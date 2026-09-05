export function ReaderSegments({ hasArticle }: { hasArticle: boolean }) {
  const items = [
    { href: "#original", label: "原文" },
    ...(hasArticle ? [{ href: "#article", label: "記事" }] : []),
    { href: "#summary", label: "要約" },
    { href: "#note", label: "メモ" },
  ];
  return (
    <nav
      className="notranslate sticky top-0 z-10 -mx-6 mt-5 border-line border-b bg-paper/90 px-6 py-2 backdrop-blur"
      lang="ja"
      translate="no"
    >
      <ul className="flex gap-1 overflow-x-auto">
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
    </nav>
  );
}
