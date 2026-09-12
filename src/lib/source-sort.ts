export const SOURCE_SORTS = [
  { id: "posted_desc", label: "新しい順" },
  { id: "posted_asc", label: "古い順" },
  { id: "video_saved", label: "動画の保存済み" },
] as const;

/** X のブックマーク時刻は API に無いので、初回観測（`saved_at`）で近似する。 */
const BOOKMARK_AT_SQL = "s.saved_at";

/** `video_downloads.status='ready'` の投稿を 1、それ以外を 0。 */
export const VIDEO_READY_SQL = `CASE WHEN EXISTS (
  SELECT 1 FROM media_assets m
  JOIN video_downloads vd ON vd.media_id = m.id
  WHERE m.x_post_id = p.id AND vd.status = 'ready'
  LIMIT 1
) THEN 1 ELSE 0 END`;

export const VIDEO_SAVED_SORT_KEY_SQL = `(CASE WHEN EXISTS (
  SELECT 1 FROM media_assets m
  JOIN video_downloads vd ON vd.media_id = m.id
  WHERE m.x_post_id = p.id AND vd.status = 'ready'
  LIMIT 1
) THEN '1' ELSE '0' END) || '|' || ${BOOKMARK_AT_SQL}`;

export type SourceSort = (typeof SOURCE_SORTS)[number]["id"];

export function parseSourceSort(raw: string | undefined | null): SourceSort {
  if (raw === "saved_asc") {
    return "posted_asc";
  }
  return SOURCE_SORTS.some((item) => item.id === raw)
    ? (raw as SourceSort)
    : "posted_desc";
}

export function sourceSortSql(sort: SourceSort): string {
  switch (sort) {
    case "posted_asc":
      // 同期は X と同じく新しいブックマークから入れる。同秒は id が後の方が古い。
      return `${BOOKMARK_AT_SQL} ASC, s.id DESC`;
    case "video_saved":
      return `${VIDEO_READY_SQL} DESC, ${BOOKMARK_AT_SQL} DESC, s.id ASC`;
    default:
      return `${BOOKMARK_AT_SQL} DESC, s.id ASC`;
  }
}
