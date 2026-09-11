export const SOURCE_SORTS = [
  { id: "posted_desc", label: "新しい順" },
  { id: "posted_asc", label: "古い順" },
  { id: "saved_desc", label: "保存が新しい順" },
  { id: "saved_asc", label: "保存が古い順" },
  { id: "video_saved", label: "動画の保存済み" },
] as const;

const POSTED_AT_SQL = "COALESCE(p.posted_at, s.bookmarked_at, s.saved_at)";

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
) THEN '1' ELSE '0' END) || '|' || ${POSTED_AT_SQL}`;

export type SourceSort = (typeof SOURCE_SORTS)[number]["id"];

export function parseSourceSort(raw: string | undefined | null): SourceSort {
  return SOURCE_SORTS.some((item) => item.id === raw)
    ? (raw as SourceSort)
    : "posted_desc";
}

export function sourceSortSql(sort: SourceSort): string {
  switch (sort) {
    case "posted_asc":
      return `${POSTED_AT_SQL} ASC, s.id ASC`;
    case "saved_desc":
      return "s.saved_at DESC, s.id DESC";
    case "saved_asc":
      return "s.saved_at ASC, s.id ASC";
    case "video_saved":
      return `${VIDEO_READY_SQL} DESC, ${POSTED_AT_SQL} DESC, s.id DESC`;
    default:
      return `${POSTED_AT_SQL} DESC, s.id DESC`;
  }
}
