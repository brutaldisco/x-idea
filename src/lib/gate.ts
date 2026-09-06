import { isPwaPublicPath } from "@/lib/pwa";

const COOKIE = "marginalia_gate";
export const GATE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

function encoder() {
  return new TextEncoder();
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function secret(): string {
  return process.env.SESSION_SECRET || process.env.APP_PASSCODE || "dev-only";
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder().encode(value));
  return toHex(sig);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export function gateCookieName(): string {
  return COOKIE;
}

export async function signGate(issued = String(Date.now())): Promise<string> {
  return `${issued}.${await hmac(issued)}`;
}

export function gateCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_MAX_AGE_SEC,
  };
}

export async function verifyGate(value: string | undefined): Promise<boolean> {
  if (!value) {
    return false;
  }
  const [issued, mac] = value.split(".");
  if (!issued || !mac) {
    return false;
  }
  const expected = await hmac(issued);
  if (!safeEqual(mac, expected)) {
    return false;
  }
  const age = Date.now() - Number(issued);
  return Number.isFinite(age) && age >= 0 && age < GATE_MAX_AGE_SEC * 1000;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

export function allowedGoogleEmail(): string | null {
  return normalizeEmail(process.env.ALLOWED_GOOGLE_EMAIL);
}

export function googleGateConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      allowedGoogleEmail(),
  );
}

export function gateRequired(): boolean {
  return Boolean(process.env.APP_PASSCODE || googleGateConfigured());
}

export function passcodeOk(input: string): boolean {
  const expected = process.env.APP_PASSCODE;
  if (!expected) {
    return false;
  }
  return safeEqual(input, expected);
}

export function emailAllowed(email: string | null | undefined): boolean {
  const allowed = allowedGoogleEmail();
  const got = normalizeEmail(email);
  if (!allowed || !got) {
    return false;
  }
  return safeEqual(allowed, got);
}

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/unlock" ||
    pathname === "/api/health" ||
    pathname === "/api/jobs/tick" ||
    pathname.startsWith("/api/mcp") ||
    pathname.startsWith("/api/capture") ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/api/x/oauth") ||
    pathname === "/api/media/companion" ||
    isPwaPublicPath(pathname)
  );
}
