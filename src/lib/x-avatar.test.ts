import { describe, expect, it } from "vitest";
import { authorInitial, xAvatarDisplayUrl } from "./x-avatar";

describe("xAvatarDisplayUrl", () => {
  it("upgrades the X _normal suffix", () => {
    expect(
      xAvatarDisplayUrl(
        "https://pbs.twimg.com/profile_images/1/a_normal.jpg",
        "bigger",
      ),
    ).toBe("https://pbs.twimg.com/profile_images/1/a_bigger.jpg");
  });

  it("leaves unknown urls alone", () => {
    expect(xAvatarDisplayUrl("https://example.com/me.png")).toBe(
      "https://example.com/me.png",
    );
  });
});

describe("authorInitial", () => {
  it("prefers the display name", () => {
    expect(authorInitial("Alice", "alice")).toBe("A");
    expect(authorInitial(null, "@bob")).toBe("b");
  });
});
