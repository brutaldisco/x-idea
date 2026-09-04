import { type NextRequest, NextResponse } from "next/server";
import { gateCookieName, isPublicPath, verifyGate } from "@/lib/gate";

export async function proxy(request: NextRequest) {
  if (!process.env.APP_PASSCODE) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest"
  ) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(gateCookieName())?.value;
  if (await verifyGate(cookie)) {
    return NextResponse.next();
  }

  const unlock = request.nextUrl.clone();
  unlock.pathname = "/unlock";
  unlock.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(unlock);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
