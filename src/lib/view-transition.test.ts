import { describe, expect, it } from "vitest";
import {
  sourceTransitionName,
  sourceTransitionStyle,
} from "@/lib/view-transition";

describe("source view transition", () => {
  it("shares a name per source id", () => {
    expect(sourceTransitionName("abc")).toBe("source-abc");
    expect(sourceTransitionStyle("abc")).toMatchObject({
      viewTransitionName: "source-abc",
    });
  });
});
