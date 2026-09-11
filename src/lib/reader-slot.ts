export function isReaderSlotActive(pathname: string): boolean {
  return pathname.startsWith("/source/");
}
