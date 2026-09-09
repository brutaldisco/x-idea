export const TABS = [
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/library", label: "Library" },
  { href: "/videos", label: "Videos" },
  { href: "/ask", label: "Ask" },
  { href: "/settings", label: "Settings" },
] as const;

export type TabHref = (typeof TABS)[number]["href"];

export function tabFromPathname(pathname: string): TabHref | null {
  const hit = TABS.find(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );
  return hit?.href ?? null;
}

export function initialTab(pathname: string): TabHref {
  if (pathname.startsWith("/source/")) {
    return "/library";
  }
  return tabFromPathname(pathname) ?? "/today";
}

export function rememberTab(pathname: string, lastTab: TabHref): TabHref {
  if (pathname.startsWith("/source/")) {
    return lastTab;
  }
  return tabFromPathname(pathname) ?? "/today";
}

export function isReaderOpen(pathname: string, reader: unknown): boolean {
  return Boolean(reader) && pathname.startsWith("/source/");
}
