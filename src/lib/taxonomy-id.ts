export function isTaxonomyItemId(value: string): boolean {
  return (
    value.length > 0 && value.length <= 48 && /^[a-zA-Z0-9_-]+$/.test(value)
  );
}
