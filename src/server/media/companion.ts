import { writeFile } from "node:fs/promises";
import { ensureMediaDir, isLocalMediaEnabled } from "@/server/media/paths";
import { encodePhotoWebp } from "@/server/media/webp";

export const COMPANION_PORTS = [3000, 3001, 3010, 3011];
export const MAX_COMPANION_BYTES = 200 * 1024 * 1024;

const PROD_ORIGINS = new Set([
  "https://x-idea.vercel.app",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
]);

export function companionAllowedOrigin(origin: string | null): string | null {
  if (!origin) {
    return null;
  }
  if (PROD_ORIGINS.has(origin)) {
    return origin;
  }
  try {
    const host = new URL(origin).hostname;
    if (host === "127.0.0.1" || host === "localhost") {
      return origin;
    }
  } catch {
    return null;
  }
  return null;
}

export function isLocalCompanionHost(request: Request): boolean {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  return (
    host === "127.0.0.1" ||
    host === "localhost" ||
    host.startsWith("127.0.0.1:") ||
    host.startsWith("localhost:")
  );
}

export function companionCorsHeaders(origin: string | null): HeadersInit {
  const allowed = companionAllowedOrigin(origin);
  if (!allowed) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Relative-Path, X-Media-Type",
    Vary: "Origin",
  };
}

export function isSafeRelativeMediaPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length < 240 &&
    !path.startsWith("/") &&
    !path.includes("..") &&
    /^[A-Za-z0-9._/-]+$/.test(path)
  );
}

export async function writeCompanionFile(input: {
  relativePath: string;
  type: string;
  bytes: Buffer;
}): Promise<{ path: string; bytes: number }> {
  if (!isLocalMediaEnabled()) {
    throw new Error("local media disabled");
  }
  if (!isSafeRelativeMediaPath(input.relativePath)) {
    throw new Error("invalid media path");
  }
  if (input.bytes.byteLength === 0) {
    throw new Error("empty body");
  }
  if (input.bytes.byteLength > MAX_COMPANION_BYTES) {
    throw new Error("body too large");
  }
  const dest = await ensureMediaDir(input.relativePath);
  const payload = await encodePhotoWebp(input.bytes);
  await writeFile(dest, payload);
  return { path: input.relativePath, bytes: payload.length };
}
