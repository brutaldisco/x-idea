import { afterEach, describe, expect, it } from "vitest";
import {
  neighborsAround,
  parseLibraryNeighbors,
  readLibraryNeighbors,
  writeLibraryNeighbors,
} from "@/lib/library-neighbors";

const STORAGE_KEY = "marginalia.library.neighbors";

afterEach(() => {
  try {
    sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
});

describe("library neighbors", () => {
  it("reads the saved source ids", () => {
    expect(parseLibraryNeighbors(JSON.stringify({ ids: ["a", "b"] }))).toEqual([
      "a",
      "b",
    ]);
    expect(parseLibraryNeighbors("nope")).toEqual([]);
  });

  it("finds the previous and next source", () => {
    expect(neighborsAround(["a", "b", "c"], "b")).toEqual({
      prevId: "a",
      nextId: "c",
    });
    expect(neighborsAround(["a", "b", "c"], "a")).toEqual({
      prevId: null,
      nextId: "b",
    });
    expect(neighborsAround(["a"], "z")).toEqual({
      prevId: null,
      nextId: null,
    });
  });

  it("round-trips ids through sessionStorage when available", () => {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    writeLibraryNeighbors(["a", "b", "c"]);
    expect(readLibraryNeighbors()).toEqual(["a", "b", "c"]);
  });
});
