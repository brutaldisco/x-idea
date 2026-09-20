import { describe, expect, it } from "vitest";
import {
  isVideoPlayerTypingTarget,
  videoPlayerKeyAction,
} from "./video-player-keys";

describe("videoPlayerKeyAction", () => {
  it("maps arrows to playlist navigation, not seek", () => {
    expect(
      videoPlayerKeyAction({
        key: "ArrowRight",
        code: "",
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      }),
    ).toBe("next");
    expect(
      videoPlayerKeyAction({
        key: "ArrowLeft",
        code: "",
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      }),
    ).toBe("prev");
  });

  it("maps space and escape", () => {
    expect(
      videoPlayerKeyAction({
        key: " ",
        code: "Space",
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      }),
    ).toBe("toggle");
    expect(
      videoPlayerKeyAction({
        key: "Escape",
        code: "",
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      }),
    ).toBe("close");
  });

  it("ignores modified keys", () => {
    expect(
      videoPlayerKeyAction({
        key: "ArrowRight",
        code: "",
        altKey: false,
        ctrlKey: false,
        metaKey: true,
      }),
    ).toBeNull();
  });
});

describe("isVideoPlayerTypingTarget", () => {
  it("does not treat the native seek bar as typing", () => {
    expect(
      isVideoPlayerTypingTarget({
        tagName: "INPUT",
        type: "range",
      }),
    ).toBe(false);
    expect(isVideoPlayerTypingTarget({ tagName: "VIDEO" })).toBe(false);
  });

  it("treats text fields as typing", () => {
    expect(
      isVideoPlayerTypingTarget({
        tagName: "INPUT",
        type: "text",
      }),
    ).toBe(true);
    expect(isVideoPlayerTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(
      isVideoPlayerTypingTarget({
        tagName: "DIV",
        isContentEditable: true,
      }),
    ).toBe(true);
  });
});
