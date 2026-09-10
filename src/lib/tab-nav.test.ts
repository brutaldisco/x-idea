import { describe, expect, it } from "vitest";
import {
  initialTab,
  isReaderOpen,
  rememberTab,
  tabFromPathname,
} from "@/lib/tab-nav";

describe("tabFromPathname", () => {
  it("matches a tab and its nested paths", () => {
    expect(tabFromPathname("/settings")).toBe("/settings");
    expect(tabFromPathname("/settings/x/add")).toBe("/settings");
    expect(tabFromPathname("/library")).toBe("/library");
  });

  it("does not treat Reader as a tab", () => {
    expect(tabFromPathname("/source/src_nav_1")).toBeNull();
  });
});

describe("rememberTab", () => {
  it("keeps the originating tab while Reader is open", () => {
    expect(rememberTab("/source/src_nav_1", "/library")).toBe("/library");
    expect(rememberTab("/source/src_nav_1", "/inbox")).toBe("/inbox");
  });

  it("follows the URL again after leaving Reader", () => {
    expect(rememberTab("/today", "/library")).toBe("/today");
    expect(rememberTab("/inbox", "/library")).toBe("/inbox");
  });
});

describe("initialTab", () => {
  it("defaults a deep-linked Reader to Library", () => {
    expect(initialTab("/source/src_nav_1")).toBe("/library");
  });
});

describe("isReaderOpen", () => {
  it("requires both a slot and a Reader URL", () => {
    expect(isReaderOpen("/source/a", "reader")).toBe(true);
    expect(isReaderOpen("/library", "reader")).toBe(false);
    expect(isReaderOpen("/source/a", null)).toBe(false);
  });
});
