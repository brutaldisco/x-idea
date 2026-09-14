import { describe, expect, it } from "vitest";
import { totalBytesFromResponseHeaders } from "./remote-content-length";

describe("totalBytesFromResponseHeaders", () => {
  it("reads the Content-Range denominator", () => {
    const headers = new Headers({
      "content-range": "bytes 0-0/2405869896",
      "content-length": "1",
    });
    expect(totalBytesFromResponseHeaders(headers, 206)).toBe(2_405_869_896);
  });

  it("uses Content-Length only on 200 (HEAD / full GET)", () => {
    const headers = new Headers({ "content-length": "128" });
    expect(totalBytesFromResponseHeaders(headers, 200)).toBe(128);
    expect(totalBytesFromResponseHeaders(headers, 206)).toBeNull();
  });

  it("ignores missing or zero lengths", () => {
    expect(totalBytesFromResponseHeaders(new Headers(), 200)).toBeNull();
    expect(
      totalBytesFromResponseHeaders(
        new Headers({ "content-length": "0" }),
        200,
      ),
    ).toBeNull();
    expect(
      totalBytesFromResponseHeaders(
        new Headers({ "content-range": "bytes 0-0/*" }),
        206,
      ),
    ).toBeNull();
  });
});
