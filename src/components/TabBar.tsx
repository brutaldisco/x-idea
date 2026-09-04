import Link from "next/link";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/library", label: "Library" },
  { href: "/ask", label: "Ask" },
  { href: "/settings", label: "Settings" },
] as const;

export function TabBar({
  current,
}: {
  current: (typeof TABS)[number]["href"];
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-line border-t bg-paper/90 backdrop-blur">
      <ul className="mx-auto flex max-w-lg justify-between px-4 py-2">
        {TABS.map((tab) => {
          const active = tab.href === current;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`block rounded-full px-3 py-2 text-sm ${
                  active ? "bg-paper-2 font-semibold text-ink" : "text-ink-2"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
