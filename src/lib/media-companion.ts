const COMPANION_PORTS = [3000, 3001, 3010, 3011];

export type PendingMedia = {
  id: string;
  type: string;
  persistPath: string;
};

async function companionBase(): Promise<string | null> {
  for (const port of COMPANION_PORTS) {
    const base = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${base}/api/media/companion`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(800),
      });
      if (res.ok) {
        return base;
      }
    } catch {
      // try next port
    }
  }
  return null;
}

export async function probeLocalCompanion(): Promise<{
  ok: boolean;
  root?: string;
}> {
  const base = await companionBase();
  if (!base) {
    return { ok: false };
  }
  try {
    const res = await fetch(`${base}/api/media/companion`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false };
    }
    const body = (await res.json()) as { root?: string };
    return { ok: true, root: body.root };
  } catch {
    return { ok: false };
  }
}

export async function syncPendingMediaToLocal(): Promise<number> {
  const pendingRes = await fetch("/api/media/pending", {
    method: "GET",
    cache: "no-store",
  });
  if (!pendingRes.ok) {
    return 0;
  }
  const payload = (await pendingRes.json()) as { items?: PendingMedia[] };
  const items = payload.items ?? [];
  if (items.length === 0) {
    return 0;
  }
  const base = await companionBase();
  if (!base) {
    return 0;
  }

  let saved = 0;
  for (const item of items.slice(0, 8)) {
    try {
      const remote = await fetch(`/api/media/${item.id}`, {
        cache: "no-store",
      });
      if (!remote.ok) {
        continue;
      }
      const bytes = new Uint8Array(await remote.arrayBuffer());
      const write = await fetch(`${base}/api/media/companion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Relative-Path": item.persistPath,
          "X-Media-Type": item.type,
        },
        body: bytes,
      });
      if (!write.ok) {
        continue;
      }
      const written = (await write.json()) as { bytes?: number };
      const mark = await fetch(`/api/media/${item.id}/saved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          local_path: item.persistPath,
          bytes: written.bytes ?? bytes.byteLength,
        }),
      });
      if (mark.ok) {
        saved += 1;
      }
    } catch {
      // keep going
    }
  }
  return saved;
}
