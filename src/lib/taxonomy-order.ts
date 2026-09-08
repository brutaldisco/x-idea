import { AppError } from "@/lib/errors";

export function isSameIdSet(currentIds: string[], nextIds: string[]): boolean {
  if (currentIds.length !== nextIds.length) {
    return false;
  }
  if (new Set(currentIds).size !== currentIds.length) {
    return false;
  }
  if (new Set(nextIds).size !== nextIds.length) {
    return false;
  }
  const seen = new Set(currentIds);
  return nextIds.every((id) => seen.has(id));
}

export function moveTaxonomyItem<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string,
): T[] {
  if (sourceId === targetId) {
    return items;
  }
  const from = items.findIndex((row) => row.id === sourceId);
  const to = items.findIndex((row) => row.id === targetId);
  if (from < 0 || to < 0) {
    return items;
  }
  return moveTaxonomyItemToIndex(items, sourceId, to);
}

export function moveTaxonomyItemToIndex<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetIndex: number,
): T[] {
  const from = items.findIndex((row) => row.id === sourceId);
  if (from < 0 || items.length === 0) {
    return items;
  }
  const to = Math.max(0, Math.min(Math.trunc(targetIndex), items.length - 1));
  if (from === to) {
    return items;
  }
  const next = [...items];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

export function dragTargetIndex(clientY: number, mids: number[]): number {
  for (let i = 0; i < mids.length; i++) {
    if (clientY < mids[i]) {
      return i;
    }
  }
  return mids.length;
}

export function taxonomySortOrders(currentIds: string[], nextIds: string[]) {
  if (!isSameIdSet(currentIds, nextIds)) {
    throw new AppError("VALIDATION", "並べ替える項目が一致しません");
  }
  return nextIds.map((itemId, index) => ({
    itemId,
    sortOrder: (index + 1) * 10,
  }));
}
