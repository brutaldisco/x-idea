import { describe, expect, it } from "vitest";
import { videoRootHandleKey } from "./video-store";

describe("videoRootHandleKey", () => {
  it("namespaces IndexedDB handles by account", () => {
    expect(videoRootHandleKey("acc_1")).toBe("root:acc_1");
    expect(videoRootHandleKey("acc_1")).not.toBe(videoRootHandleKey("acc_2"));
  });
});
