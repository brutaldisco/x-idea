import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeVideoMetaBox,
  encodeVideoMetaBox,
  isIsoBmffVideoName,
  loadVideoThumbSeek,
  type RandomAccessFile,
  readVideoFileMetadata,
  saveVideoThumbSeek,
  scanTopLevelBoxes,
  VIDEO_META_BOX_SIZE,
  VIDEO_META_HEADER_PROBE,
  VIDEO_META_USER_TYPE,
  writeVideoFileMetadata,
} from "./video-bmff-meta";
import {
  migrateThumbSidecarFile,
  NodeRandomAccessFile,
} from "./video-bmff-node";
import {
  parseThumbSidecar,
  serializeThumbSidecar,
  thumbSidecarName,
} from "./video-thumb-sidecar";

class MemoryFile implements RandomAccessFile {
  private bytes: Uint8Array;
  readonly reads: Array<{ offset: number; length: number }> = [];
  readonly writes: Array<{ offset: number; length: number }> = [];

  constructor(initial: Uint8Array) {
    this.bytes = initial.slice();
  }

  snapshot(): Uint8Array {
    return this.bytes.slice();
  }

  async size(): Promise<number> {
    return this.bytes.length;
  }

  async readAt(offset: number, length: number): Promise<Uint8Array> {
    this.reads.push({ offset, length });
    if (offset < 0 || length < 0 || offset > this.bytes.length) {
      return new Uint8Array();
    }
    const end = Math.min(this.bytes.length, offset + length);
    return this.bytes.slice(offset, end);
  }

  async writeAt(offset: number, data: Uint8Array): Promise<void> {
    this.writes.push({ offset, length: data.byteLength });
    const end = offset + data.byteLength;
    if (end > this.bytes.length) {
      const next = new Uint8Array(end);
      next.set(this.bytes);
      this.bytes = next;
    }
    this.bytes.set(data, offset);
  }

  async truncate(size: number): Promise<void> {
    const next = new Uint8Array(size);
    next.set(this.bytes.subarray(0, Math.min(size, this.bytes.length)));
    this.bytes = next;
  }
}

class CorruptOnce extends MemoryFile {
  private left: number;

  constructor(initial: Uint8Array, times = 1) {
    super(initial);
    this.left = times;
  }

  override async writeAt(offset: number, data: Uint8Array): Promise<void> {
    if (this.left > 0) {
      this.left -= 1;
      const bad = new Uint8Array(data);
      bad[bad.length - 1] ^= 0xff;
      await super.writeAt(offset, bad);
      return;
    }
    await super.writeAt(offset, data);
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function makeBox(type: string, payload: Uint8Array, large = false): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  if (!large) {
    const out = new Uint8Array(8 + payload.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, out.length, false);
    out.set(typeBytes, 4);
    out.set(payload, 8);
    return out;
  }
  const out = new Uint8Array(16 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 1, false);
  out.set(typeBytes, 4);
  view.setUint32(8, 0, false);
  view.setUint32(12, out.length, false);
  out.set(payload, 16);
  return out;
}

function sampleContainer(): Uint8Array {
  const ftyp = makeBox(
    "ftyp",
    Uint8Array.of(
      0x69,
      0x73,
      0x6f,
      0x6d,
      0,
      0,
      0,
      0,
      0x69,
      0x73,
      0x6f,
      0x6d,
      0x6d,
      0x70,
      0x34,
      0x31,
    ),
  );
  const moov = makeBox("moov", Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8));
  const media = new Uint8Array(4096);
  for (let i = 0; i < media.length; i++) {
    media[i] = i % 251;
  }
  const mdat = makeBox("mdat", media);
  const free = makeBox("free", new Uint8Array(50));
  return concat([ftyp, moov, mdat, free]);
}

function mdatPayloadRange(): [number, number] {
  const payloadStart = 24 + 16 + 8;
  return [payloadStart, payloadStart + 4096];
}

describe("iso bmff video metadata", () => {
  it("stores seconds in a fixed uuid box without a path", () => {
    const raw = parseThumbSidecar(
      '{"version":1,"thumbSeekSeconds":88.643132}\n',
    );
    expect(raw).toBe(88.643132);
    const box = encodeVideoMetaBox(raw ?? 0);
    expect(box).toHaveLength(VIDEO_META_BOX_SIZE);
    expect(decodeVideoMetaBox(box)).toBe(88.643132);
    expect(decodeVideoMetaBox(encodeVideoMetaBox(0))).toBe(0);
    const text = new TextDecoder().decode(box);
    expect(text).not.toContain("clip.mp4");
    expect(text).not.toContain("library");
    expect(text).not.toContain("parent");
    expect(() => encodeVideoMetaBox(-1)).toThrow();
  });

  it("recognizes only mp4, mov, and m4v", () => {
    expect(isIsoBmffVideoName("a.mp4")).toBe(true);
    expect(isIsoBmffVideoName("a.MOV")).toBe(true);
    expect(isIsoBmffVideoName("a.m4v")).toBe(true);
    expect(isIsoBmffVideoName("a.webm")).toBe(false);
    expect(isIsoBmffVideoName("a.mp4.lvl.json")).toBe(false);
    expect(isIsoBmffVideoName("a.mp4.part")).toBe(false);
  });

  it("scans top-level headers only and appends when sizes match", async () => {
    const media = sampleContainer();
    const file = new MemoryFile(media);
    const scan = await scanTopLevelBoxes(file);
    expect(scan).toEqual({
      ok: true,
      fileSize: media.length,
      metaOffset: null,
    });
    expect(
      file.reads.every((read) => read.length <= VIDEO_META_HEADER_PROBE),
    ).toBe(true);
    const [payloadStart, payloadEnd] = mdatPayloadRange();
    expect(
      file.reads.some(
        (read) =>
          read.offset < payloadEnd && read.offset + read.length > payloadStart,
      ),
    ).toBe(false);

    file.writes.length = 0;
    const written = await writeVideoFileMetadata(file, 12.25);
    expect(written).toEqual({
      ok: true,
      mode: "append",
      offset: media.length,
    });
    expect(file.writes).toEqual([
      { offset: media.length, length: VIDEO_META_BOX_SIZE },
    ]);
    expect(file.snapshot().subarray(0, media.length)).toEqual(media);
    expect(await readVideoFileMetadata(file)).toBe(12.25);
  });

  it("skips a largesize payload and a foreign uuid", async () => {
    const payload = new Uint8Array(300);
    payload.fill(0x5a);
    const foreign = makeBox(
      "uuid",
      concat([new Uint8Array(16).fill(0xab), Uint8Array.of(1, 2, 3, 4)]),
    );
    const media = concat([
      makeBox("ftyp", new Uint8Array(8)),
      makeBox("mdat", payload, true),
      foreign,
    ]);
    const file = new MemoryFile(media);
    file.reads.length = 0;
    const scan = await scanTopLevelBoxes(file);
    expect(scan.ok).toBe(true);
    expect(
      file.reads.every((read) => read.length <= VIDEO_META_HEADER_PROBE),
    ).toBe(true);
    const mdatPayload = 8 + 8 + 16;
    expect(
      file.reads.some(
        (read) => read.offset >= mdatPayload && read.offset < mdatPayload + 300,
      ),
    ).toBe(false);
    expect(await writeVideoFileMetadata(file, 4)).toMatchObject({
      ok: true,
      mode: "append",
    });
    expect(file.snapshot().subarray(0, media.length)).toEqual(media);
    expect(await readVideoFileMetadata(file)).toBe(4);
  });

  it("overwrites only the existing uuid box at the same length", async () => {
    const media = sampleContainer();
    const file = new MemoryFile(media);
    await writeVideoFileMetadata(file, 12.25);
    const withBox = file.snapshot();
    file.writes.length = 0;
    const again = await writeVideoFileMetadata(file, 3.5);
    expect(again).toEqual({
      ok: true,
      mode: "overwrite",
      offset: media.length,
    });
    expect(file.writes).toEqual([
      { offset: media.length, length: VIDEO_META_BOX_SIZE },
    ]);
    expect(file.snapshot().length).toBe(withBox.length);
    expect(file.snapshot().subarray(0, media.length)).toEqual(media);
    expect(await readVideoFileMetadata(file)).toBe(3.5);
  });

  it("does not write into a size-zero box, a short box, or trailing bytes", async () => {
    const cases = [
      concat([
        makeBox("ftyp", new Uint8Array(8)),
        (() => {
          const rest = new Uint8Array(24);
          rest.set(new TextEncoder().encode("mdat"), 4);
          return rest;
        })(),
      ]),
      (() => {
        const head = new Uint8Array(8);
        new DataView(head.buffer).setUint32(0, 1000, false);
        head.set(new TextEncoder().encode("mdat"), 4);
        return head;
      })(),
      concat([makeBox("ftyp", new Uint8Array(8)), Uint8Array.of(1, 2, 3, 4)]),
      new Uint8Array(),
      concat([
        makeBox("ftyp", new Uint8Array(8)),
        makeBox("uuid", concat([VIDEO_META_USER_TYPE, Uint8Array.of(9)])),
      ]),
    ];
    for (const initial of cases) {
      const file = new MemoryFile(initial);
      const result = await writeVideoFileMetadata(file, 1);
      expect(result.ok).toBe(false);
      expect(file.writes).toEqual([]);
      expect(file.snapshot()).toEqual(initial);
    }
  });

  it("truncates an append when the readback does not match", async () => {
    const media = sampleContainer();
    const file = new CorruptOnce(media);
    const result = await writeVideoFileMetadata(file, 8);
    expect(result).toEqual({ ok: false, reason: "readback" });
    expect(file.snapshot()).toEqual(media);
    expect(await readVideoFileMetadata(file)).toBeNull();
  });

  it("restores the previous box when an overwrite readback fails", async () => {
    const media = sampleContainer();
    const good = new MemoryFile(media);
    await writeVideoFileMetadata(good, 6);
    const file = new CorruptOnce(good.snapshot());
    const result = await writeVideoFileMetadata(file, 9);
    expect(result).toEqual({ ok: false, reason: "readback" });
    expect(file.snapshot().length).toBe(media.length + VIDEO_META_BOX_SIZE);
    expect(file.snapshot().subarray(0, media.length)).toEqual(media);
    expect(await readVideoFileMetadata(file)).toBe(6);
  });

  it("deletes a sidecar only after a matching readback", async () => {
    const media = sampleContainer();
    const file = new MemoryFile(media);
    const calls: string[] = [];
    await expect(
      saveVideoThumbSeek({
        fileName: "clip.mp4",
        seconds: 4,
        openVideo: async () => file,
        writeSidecar: async () => {
          calls.push("write-sidecar");
        },
        deleteSidecar: async () => {
          calls.push("delete-sidecar");
        },
      }),
    ).resolves.toBe("embedded");
    expect(calls).toEqual(["delete-sidecar"]);
    expect(await readVideoFileMetadata(file)).toBe(4);

    const broken = new MemoryFile(new Uint8Array());
    let deleted = false;
    await expect(
      saveVideoThumbSeek({
        fileName: "clip.mov",
        seconds: 4,
        openVideo: async () => broken,
        writeSidecar: async () => {
          throw new Error("sidecar should stay unused");
        },
        deleteSidecar: async () => {
          deleted = true;
        },
      }),
    ).rejects.toThrow(/invalid-size/);
    expect(deleted).toBe(false);
    expect(broken.snapshot()).toEqual(new Uint8Array());

    let sidecar: number | null = null;
    await expect(
      saveVideoThumbSeek({
        fileName: "clip.webm",
        seconds: 2.5,
        openVideo: async () => {
          throw new Error("unsupported files stay out of the container writer");
        },
        writeSidecar: async (seconds) => {
          sidecar = seconds;
        },
        deleteSidecar: async () => {
          throw new Error("unsupported sidecar is kept");
        },
      }),
    ).resolves.toBe("sidecar");
    expect(sidecar).toBe(2.5);
    expect(
      await loadVideoThumbSeek({
        fileName: "clip.webm",
        openVideo: async () => {
          throw new Error("no container");
        },
        readSidecar: async () => sidecar,
      }),
    ).toBe(2.5);
  });

  it("keeps the value across rename, move, copy, and folder renames", async () => {
    const root = await mkdirTemp();
    try {
      const library = path.join(root, "library");
      const parent = path.join(library, "parent");
      await mkdir(parent, { recursive: true });
      const media = sampleContainer();
      const video = path.join(parent, "clip.mp4");
      await writeFile(video, media);
      await writeFile(
        path.join(parent, thumbSidecarName("clip.mp4")),
        serializeThumbSidecar(88.643132),
      );

      const migrated = await migrateThumbSidecarFile(video);
      expect(migrated).toMatchObject({
        action: "embedded",
        seconds: 88.643132,
        mode: "append",
      });
      expect(await readdir(parent)).toEqual(["clip.mp4"]);
      await expectUnchangedMedia(video, media);

      const renamed = path.join(parent, "renamed.mp4");
      await rename(video, renamed);
      expect(await readSeconds(renamed)).toBe(88.643132);
      await expectUnchangedMedia(renamed, media);

      const moved = path.join(library, "other", "renamed.mp4");
      await mkdir(path.dirname(moved), { recursive: true });
      await rename(renamed, moved);
      expect(await readSeconds(moved)).toBe(88.643132);
      expect(await readdir(path.dirname(moved))).toEqual(["renamed.mp4"]);

      const copied = path.join(root, "copies", "only-one.m4v");
      await mkdir(path.dirname(copied), { recursive: true });
      await copyFile(moved, copied);
      expect(await readdir(path.dirname(copied))).toEqual(["only-one.m4v"]);
      expect(await readSeconds(copied)).toBe(88.643132);
      await expectUnchangedMedia(copied, media);

      const parentRenamed = path.join(library, "other-renamed");
      await rename(path.dirname(moved), parentRenamed);
      const afterParent = path.join(parentRenamed, "renamed.mp4");
      expect(await readSeconds(afterParent)).toBe(88.643132);

      const libraryRenamed = path.join(root, "library-renamed");
      await rename(library, libraryRenamed);
      const afterRoot = path.join(
        libraryRenamed,
        "other-renamed",
        "renamed.mp4",
      );
      expect(await readSeconds(afterRoot)).toBe(88.643132);
      await expectUnchangedMedia(afterRoot, media);

      await rm(afterRoot);
      expect(await readdir(path.dirname(afterRoot))).toEqual([]);
      expect(await readSeconds(copied)).toBe(88.643132);
      await rm(copied);
      expect(
        (await readdir(path.dirname(copied))).filter(
          (name) => name.endsWith(".json") || name.endsWith(".m4v"),
        ),
      ).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("leaves the sidecar in place for a broken container or an unsupported file", async () => {
    const root = await mkdirTemp();
    try {
      const broken = path.join(root, "broken.mp4");
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setUint32(0, 1000, false);
      bytes.set(new TextEncoder().encode("mdat"), 4);
      await writeFile(broken, bytes);
      await writeFile(`${broken}.lvl.json`, serializeThumbSidecar(1));
      const kept = await migrateThumbSidecarFile(broken);
      expect(kept).toMatchObject({
        action: "kept-sidecar",
        reason: "size-mismatch",
      });
      expect(await readdir(root)).toContain("broken.mp4.lvl.json");

      const webm = path.join(root, "clip.webm");
      await writeFile(webm, Buffer.from("not-bmff"));
      await writeFile(`${webm}.lvl.json`, serializeThumbSidecar(2));
      const skipped = await migrateThumbSidecarFile(webm);
      expect(skipped).toEqual({
        action: "skipped",
        videoPath: webm,
        reason: "unsupported",
      });
      expect(await readdir(root)).toContain("clip.webm.lvl.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function mkdirTemp(): Promise<string> {
  const root = path.join(
    os.tmpdir(),
    `x-idea-meta-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await mkdir(root, { recursive: true });
  return root;
}

async function readSeconds(filePath: string): Promise<number | null> {
  const file = new NodeRandomAccessFile(filePath);
  try {
    return await readVideoFileMetadata(file);
  } finally {
    await file.close();
  }
}

async function expectUnchangedMedia(
  filePath: string,
  media: Uint8Array,
): Promise<void> {
  const file = new NodeRandomAccessFile(filePath);
  try {
    expect(await file.size()).toBe(media.length + VIDEO_META_BOX_SIZE);
    const prefix = await file.readAt(0, media.length);
    expect(prefix).toEqual(media);
  } finally {
    await file.close();
  }
}
