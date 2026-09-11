import { afterEach, describe, expect, it } from "vitest";
import {
  readLibraryAccountId,
  subscribeLibraryAccount,
  writeLibraryAccountId,
} from "@/lib/library-account";

const STORAGE_KEY = "x-idea.library.account";

afterEach(() => {
  try {
    sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
});

describe("library account", () => {
  it("does not notify when the account id is unchanged", () => {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    let n = 0;
    const stop = subscribeLibraryAccount(() => {
      n += 1;
    });
    writeLibraryAccountId("acc-1");
    writeLibraryAccountId("acc-1");
    expect(readLibraryAccountId()).toBe("acc-1");
    expect(n).toBe(1);
    stop();
  });
});
