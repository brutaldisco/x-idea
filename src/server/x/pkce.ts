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

export const X_SCOPES =
  "bookmark.read bookmark.write tweet.read users.read offline.access";

export function parseOauthScopes(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      // fall through to whitespace split
    }
  }
  return trimmed.split(/[\s,]+/).filter(Boolean);
}

export function hasOauthScope(
  raw: string | null | undefined,
  scope: string,
): boolean {
  return parseOauthScopes(raw).includes(scope);
}
