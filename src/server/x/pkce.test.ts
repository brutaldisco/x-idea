import { describe, expect, it } from "vitest";
import { challengeS256, createVerifier } from "./pkce";

describe("pkce", () => {
  it("creates an S256 challenge", () => {
    const verifier = createVerifier();
    const challenge = challengeS256(verifier);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toBe(verifier);
    expect(challengeS256(verifier)).toBe(challenge);
  });
});
