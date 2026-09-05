export type RepeatMode = "off" | "one" | "folder";

export const REPEAT_MODES: { id: RepeatMode; label: string }[] = [
  { id: "off", label: "リピートなし" },
  { id: "one", label: "1本リピート" },
  { id: "folder", label: "フォルダをループ" },
];

export function parseRepeatMode(raw: string | null | undefined): RepeatMode {
  return raw === "one" || raw === "folder" || raw === "off" ? raw : "folder";
}

export function folderPlaylist<
  T extends { id: string; folderId: string | null },
>(library: T[], item: T): T[] {
  const folderId = item.folderId ?? null;
  return library.filter((row) => (row.folderId ?? null) === folderId);
}

export function playlistIndex<T extends { id: string }>(
  list: T[],
  currentId: string,
): number {
  return list.findIndex((row) => row.id === currentId);
}

export function stepPlaylist<T extends { id: string }>(
  list: T[],
  currentId: string,
  delta: number,
): T | null {
  if (list.length === 0) {
    return null;
  }
  const index = playlistIndex(list, currentId);
  const from = index < 0 ? 0 : index;
  const next = (from + delta + list.length * 8) % list.length;
  return list[next] ?? null;
}
