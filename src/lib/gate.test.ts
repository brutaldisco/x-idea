import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedGoogleEmail,
  emailAllowed,
  GATE_MAX_AGE_SEC,
  gateRequired,
  googleGateConfigured,
  isPublicPath,
  normalizeEmail,
  passcodeOk,
  signGate,
  verifyGate,
} from "./gate";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeEmail", () => {
  it("trims and lowercases a valid address", () => {
    expect(normalizeEmail("  You@Example.COM ")).toBe("you@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("gate flags", () => {
  it("requires Google only when all three vars are set", () => {
    vi.stubEnv("APP_PASSCODE", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "you@example.com");
    expect(googleGateConfigured()).toBe(true);
    expect(gateRequired()).toBe(true);
    expect(allowedGoogleEmail()).toBe("you@example.com");
    expect(emailAllowed("YOU@example.com")).toBe(true);
    expect(emailAllowed("other@example.com")).toBe(false);
  });

  it("stays open without passcode or Google", () => {
    vi.stubEnv("APP_PASSCODE", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "");
    expect(gateRequired()).toBe(false);
    expect(passcodeOk("anything")).toBe(false);
  });
});

describe("verifyGate", () => {
  it("accepts a fresh signature and rejects an expired one", async () => {
    vi.stubEnv("SESSION_SECRET", "test-secret");
    const fresh = await signGate();
    expect(await verifyGate(fresh)).toBe(true);
    const old = await signGate(
      String(Date.now() - (GATE_MAX_AGE_SEC + 10) * 1000),
    );
    expect(await verifyGate(old)).toBe(false);
    expect(await verifyGate("bad")).toBe(false);
  });
});

describe("isPublicPath", () => {
  it("allows Google OAuth callbacks", () => {
    expect(isPublicPath("/api/auth/google/start")).toBe(true);
    expect(isPublicPath("/api/auth/google/callback")).toBe(true);
    expect(isPublicPath("/today")).toBe(false);
  });
});
