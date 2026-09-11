import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isDeletedSourceId,
  readDeletedSourceIds,
  rememberDeletedSource,
} from "./library-deleted";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    },
  });
});

afterEach(() => {
  store.clear();
});

describe("library deleted ids", () => {
  it("remembers ids across reads", () => {
    expect(readDeletedSourceIds().size).toBe(0);
    rememberDeletedSource("src-1");
    expect(isDeletedSourceId("src-1")).toBe(true);
    expect(readDeletedSourceIds()).toEqual(new Set(["src-1"]));
  });
});
