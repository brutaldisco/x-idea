"use client";

import { SourceCard } from "@/components/SourceCard";
import { splitAskAnswer } from "@/lib/ask";
import type { TaxonomyChipItem } from "@/lib/taxonomy-chip";
import type { SourceListItem } from "@/server/sources/query";

function AskAnswerText({
  text,
  onCite,
}: {
  text: string;
  onCite: (n: number) => void;
}) {
  const parts = text.split(/(\[\d+\])/g);
  const seen = new Map<string, number>();
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part) => {
        const occ = (seen.get(part) ?? 0) + 1;
        seen.set(part, occ);
        const key = `${part}#${occ}`;
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) {
          return <span key={key}>{part}</span>;
        }
        const n = Number(match[1]);
        return (
          <button
            key={key}
            type="button"
            className="text-accent hover:underline"
            onClick={() => onCite(n)}
          >
            [{n}]
          </button>
        );
      })}
    </p>
  );
}

export function AskChat({
  question,
  answer,
  sources,
  streaming,
  error,
  accountId,
  categories,
  infoTypes,
  followUps,
  onFollowUp,
  canAsk,
}: {
  question: string;
  answer: string;
  sources: SourceListItem[];
  streaming: boolean;
  error: string | null;
  accountId: string | null;
  categories: TaxonomyChipItem[];
  infoTypes: TaxonomyChipItem[];
  followUps: string[];
  onFollowUp: (text: string) => void;
  canAsk: boolean;
}) {
  const { body } = splitAskAnswer(answer);
  return (
    <section className="mt-6 space-y-4">
      <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 px-4 py-3">
        <p className="text-ink-2 text-xs">質問</p>
        <p className="mt-1 text-sm">{question}</p>
      </article>
      {sources.length > 0 ? (
        <div>
          <p className="mb-2 text-ink-2 text-xs">根拠にした Source</p>
          <ul className="grid min-w-0 grid-cols-1 gap-3">
            {sources.map((item) => (
              <SourceCard
                key={item.id}
                id={item.id}
                categoryId={item.categoryId}
                infoType={item.infoType}
                categories={categories}
                infoTypes={infoTypes}
                summary={item.summary}
                url={item.url}
                authorAvatarUrl={item.authorAvatarUrl}
                authorName={item.authorName}
                authorUsername={item.authorUsername}
                mediaId={item.mediaId}
                mediaType={item.mediaType}
                videoSaveStatus={item.videoSaveStatus}
                videoRelPath={item.videoRelPath}
                durationMs={item.durationMs}
                accountId={accountId}
                kind={item.kind}
                hasQueueableVideos={item.hasQueueableVideos}
                lang={item.lang}
                summaryFromAi={item.summaryFromAi}
                postedAt={item.postedAt}
                variant="list"
                avatarFallback
              />
            ))}
          </ul>
        </div>
      ) : null}
      <article className="rounded-[var(--radius-card)] border border-line bg-paper px-4 py-3">
        {error ? (
          <p className="text-danger text-sm">{error}</p>
        ) : streaming && !body ? (
          <p className="text-ink-2 text-sm">考えています…</p>
        ) : body ? (
          <AskAnswerText
            text={body}
            onCite={(n) => {
              const source = sources[n - 1];
              if (!source) {
                return;
              }
              document
                .querySelector(`[data-source-id="${source.id}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}
          />
        ) : null}
        {streaming ? (
          <p className="mt-2 text-ink-2 text-xs">回答を書いています…</p>
        ) : null}
      </article>
      {!streaming && followUps.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {followUps.map((item) => (
            <button
              key={item}
              type="button"
              disabled={!canAsk}
              onClick={() => onFollowUp(item)}
              className="rounded-full border border-line px-3 py-1 text-xs hover:bg-paper-2 disabled:opacity-50"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
