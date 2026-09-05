export function MediaFolderLink({
  href,
  path,
}: {
  href: string;
  path: string;
}) {
  return (
    <p className="mt-1">
      <a
        href={href}
        className="break-all font-mono text-accent text-xs underline-offset-2 hover:underline"
      >
        {path}
      </a>
    </p>
  );
}
