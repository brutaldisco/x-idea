import { cookies } from "next/headers";
import { connection } from "next/server";
import { gateCookieName, gateCookieOptions, signGate } from "@/lib/gate";
import { safeInternalPath } from "@/lib/pwa";
import {
  appUrl,
  decryptGooglePayload,
  exchangeGoogleCode,
  fetchGoogleIdentity,
  GOOGLE_OAUTH_COOKIE,
  googleIdentityAllowed,
} from "@/server/auth/google";

export const instant = false;

function unlockRedirect(next: string, error: string): Response {
  const fail = new URL("/unlock", appUrl());
  fail.searchParams.set("next", next);
  fail.searchParams.set("error", error);
  return Response.redirect(fail);
}

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  const jar = await cookies();
  const payload = decryptGooglePayload(jar.get(GOOGLE_OAUTH_COOKIE)?.value);
  jar.delete(GOOGLE_OAUTH_COOKIE);
  const next = safeInternalPath(payload?.next);

  if (denied) {
    return unlockRedirect(next, "denied");
  }
  if (!code || !state || !payload || payload.state !== state) {
    return unlockRedirect(next, "google");
  }

  try {
    const accessToken = await exchangeGoogleCode(code, payload.verifier);
    const identity = await fetchGoogleIdentity(accessToken);
    if (!googleIdentityAllowed(identity)) {
      return unlockRedirect(next, "mismatch");
    }
    jar.set(gateCookieName(), await signGate(), gateCookieOptions());
    return Response.redirect(new URL(next, appUrl()));
  } catch {
    return unlockRedirect(next, "google");
  }
}
