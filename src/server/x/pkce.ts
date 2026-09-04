import { createHash, randomBytes } from "node:crypto";

export function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function createVerifier(): string {
  return base64url(randomBytes(32));
}

export function createState(): string {
  return base64url(randomBytes(16));
}

export function challengeS256(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export const X_SCOPES = "bookmark.read tweet.read users.read offline.access";
