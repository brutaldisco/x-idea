import { type NextRequest, NextResponse } from "next/server";
import {
  gateCookieName,
  gateRequired,
  isPublicPath,
  verifyGate,
} from "@/lib/gate";
import { safeInternalPath } from "@/lib/pwa";

export async function proxy(request: NextRequest) {
  if (!gateRequired()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js"
  ) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(gateCookieName())?.value;
  if (await verifyGate(cookie)) {
    return NextResponse.next();
  }

  const unlock = request.nextUrl.clone();
  unlock.pathname = "/unlock";
  unlock.search = `?next=${encodeURIComponent(safeInternalPath(`${pathname}${request.nextUrl.search}`))}`;
  return NextResponse.redirect(unlock);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
