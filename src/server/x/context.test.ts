import { describe, expect, it } from "vitest";
import type { XAccountPublic } from "./account";
import { pickAccount } from "./context";

function account(id: string, username: string): XAccountPublic {
  return {
    id,
    username,
    name: username,
    status: "active",
    syncEnabled: false,
    lastSyncedAt: null,
    backfillExhausted: false,
  };
}

const first = account("acc_first", "Takkk6666");
const second = account("acc_second", "Deathisnotf1nal");
const accounts = [first, second];

describe("pickAccount", () => {
  it("returns none when there are no accounts", () => {
    expect(pickAccount([], undefined, "acc_second")).toEqual({ kind: "none" });
  });

  it("prefers a valid cookie over the default", () => {
    expect(pickAccount(accounts, "acc_first", "acc_second")).toEqual({
      kind: "account",
      account: first,
    });
  });

  it("uses the default when the cookie is missing", () => {
    expect(pickAccount(accounts, undefined, "acc_second")).toEqual({
      kind: "account",
      account: second,
    });
  });

  it("uses the default when the cookie is invalid", () => {
    expect(pickAccount(accounts, "gone", "acc_second")).toEqual({
      kind: "account",
      account: second,
    });
  });

  it("falls back to the first account when default is unset", () => {
    expect(pickAccount(accounts, undefined, null)).toEqual({
      kind: "account",
      account: first,
    });
  });

  it("falls back to the first account when default is invalid", () => {
    expect(pickAccount(accounts, undefined, "gone")).toEqual({
      kind: "account",
      account: first,
    });
  });
});
