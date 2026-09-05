import type { CSSProperties } from "react";

export function sourceTransitionName(id: string): string {
  return `source-${id}`;
}

export function sourceTransitionStyle(id: string): CSSProperties {
  return {
    viewTransitionName: sourceTransitionName(id),
  } as CSSProperties;
}
