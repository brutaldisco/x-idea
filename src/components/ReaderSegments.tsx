import type { ReactNode } from "react";

export function ReaderSegments({
  hasArticle,
  menu,
}: {
  hasArticle: boolean;
  menu?: ReactNode;
}) {
  const items = [
    { href: "#original", label: "原文" },
    ...(hasArticle ? [{ href: "#article", label: "記事" }] : []),
    { href: "#summary", label: "要約" },
    { href: "#note", label: "メモ" },
  ];
  return (
    <nav
      className="notranslate sticky top-0 z-10 -mx-3 mt-5 border-line border-b bg-paper px-3 py-2 min-[48rem]:-mx-6 min-[48rem]:px-6"
      lang="ja"
      translate="no"
    >
      <div className="flex items-center gap-2">
        <ul className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {items.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="inline-flex min-h-9 items-center rounded-full px-3 text-sm text-ink-2 hover:bg-paper-2 hover:text-ink"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        {menu ? <div className="shrink-0">{menu}</div> : null}
      </div>
    </nav>
  );
}
