import { connection, NextResponse } from "next/server";
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
  callbackUriForRequest,
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
    return NextResponse.redirect(fail);
  }

  if (process.env.MOCK_EXTERNAL === "1") {
    const res = NextResponse.redirect(new URL(next, appUrl()));
    res.cookies.set(gateCookieName(), await signGate(), gateCookieOptions());
    return res;
  }

  try {
    const { url: oauthUrl, cookie } = beginGoogleOauth(
      next,
      callbackUriForRequest(request.url),
    );
    const res = NextResponse.redirect(oauthUrl);
    res.cookies.set(GOOGLE_OAUTH_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch {
    return NextResponse.redirect(fail);
  }
}
