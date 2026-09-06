import { cookies } from "next/headers";
import { connection } from "next/server";
import {
  gateCookieName,
  gateCookieOptions,
  googleGateConfigured,
  signGate,
} from "@/lib/gate";
import { safeInternalPath } from "@/lib/pwa";
import {
  appUrl,
  beginGoogleOauth,
  GOOGLE_OAUTH_COOKIE,
} from "@/server/auth/google";

export const instant = false;

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const next = safeInternalPath(url.searchParams.get("next"));
  const fail = new URL("/unlock", appUrl());
  fail.searchParams.set("next", next);
  fail.searchParams.set("error", "google");

  if (!googleGateConfigured()) {
    return Response.redirect(fail);
  }

  if (process.env.MOCK_EXTERNAL === "1") {
    const jar = await cookies();
    jar.set(gateCookieName(), await signGate(), gateCookieOptions());
    return Response.redirect(new URL(next, appUrl()));
  }

  try {
    const { url: oauthUrl, cookie } = beginGoogleOauth(next);
    const jar = await cookies();
    jar.set(GOOGLE_OAUTH_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return Response.redirect(oauthUrl);
  } catch {
    return Response.redirect(fail);
  }
}
