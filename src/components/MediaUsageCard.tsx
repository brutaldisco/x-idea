import Link from "next/link";
import { formatBytes } from "@/lib/bytes";

const TURSO_SOFT_CAP = 5 * 1024 * 1024 * 1024;

export function MediaUsageCard({
  blobs,
  videos,
}: {
  blobs: { count: number; bytes: number };
  videos: { count: number; bytes: number };
}) {
  const ratio =
    TURSO_SOFT_CAP > 0
      ? Math.min(100, (blobs.bytes / TURSO_SOFT_CAP) * 100)
      : 0;
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">メディアの容量</h2>
        <Link href="/videos" className="text-accent text-xs hover:underline">
          Videos
        </Link>
      </div>
      <p className="mt-2 text-ink-2 text-sm">
        画像と動画サムネイルはデータベース（Turso）に WebP
        で保存します。動画本体は Videos タブで選んだものだけ、この PC
        のフォルダへ保存します。
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-2">画像・サムネイル</dt>
          <dd>
            {blobs.count}件 · {formatBytes(blobs.bytes)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-2">保存した動画</dt>
          <dd>
            {videos.count}件 · {formatBytes(videos.bytes)}
          </dd>
        </div>
      </dl>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper">
        <div className="h-full bg-accent" style={{ width: `${ratio}%` }} />
      </div>
      <p className="mt-1 text-ink-2 text-xs">
        DB の目安 5GB に対して {ratio.toFixed(1)}%（画像・サムネイル）
      </p>
    </article>
  );
}
