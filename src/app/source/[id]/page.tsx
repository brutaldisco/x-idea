import Link from "next/link";
import { notFound } from "next/navigation";
import { after, connection } from "next/server";
import { ArticleBlock } from "@/components/ArticleBlock";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { ContextFetchButton } from "@/components/ContextFetchButton";
import { PostBlock } from "@/components/PostBlock";
import { ReaderSegments } from "@/components/ReaderSegments";
import { SourceActions } from "@/components/SourceActions";
import { SourceCardMenu } from "@/components/SourceCardMenu";
import { SourceHero } from "@/components/SourceHero";
import { SourceNote } from "@/components/SourceNote";
import { SourceReenrichButton } from "@/components/SourceReenrichButton";
import { SourceStatusBar } from "@/components/SourceStatusBar";
import { INFO_TYPE_LABELS, type InfoType } from "@/server/ai/info-types";
import { ensureSourceArticles } from "@/server/fetch/attach";
import { enqueuePendingArticleFetches } from "@/server/fetch/enqueue-pending";
import { hydrateXArticleFromApi } from "@/server/fetch/x-article";
import { runJobs } from "@/server/jobs/runner";
import { enqueuePendingMediaDownloads } from "@/server/media/enqueue-pending";
import { persistLocalMedia } from "@/server/media/persist";
import { getContextSettings } from "@/server/settings";
import { getSourceDetail } from "@/server/sources/detail";
import { getAccountContext } from "@/server/x/context";

export const instant = false;
export const maxDuration = 60;

const IMPORTANCE: Record<number, string> = {
  1: "低",
  2: "中",
  3: "高",
};

export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const ctx = await getAccountContext();
  await ensureSourceArticles(id);
  await hydrateXArticleFromApi(id);
  const [source, flags] = await Promise.all([
    getSourceDetail(id, ctx),
    getContextSettings(),
  ]);
  if (!source) {
    notFound();
  }
  await enqueuePendingArticleFetches(8, source.id);
  if (source.xAccountId) {
    await enqueuePendingMediaDownloads(source.xAccountId, 16);
  }
  after(() => {
    void (async () => {
      if (source.xAccountId) {
        await persistLocalMedia({
          accountId: source.xAccountId,
          items: [
            ...source.post.media,
            ...(source.parent?.media ?? []),
            ...source.thread.flatMap((post) => post.media),
          ],
        });
      }
      await runJobs({ max: 6 });
    })();
  });

  const hasArticle = source.articles.length > 0;
  const hasSummary = Boolean(source.aiSummary);
  const infoLabel =
    source.infoType && source.infoType in INFO_TYPE_LABELS
      ? INFO_TYPE_LABELS[source.infoType as InfoType]
      : null;

  return (
    <main className="scroll-smooth px-6 pt-8 pb-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/library"
          transitionTypes={["nav-back"]}
          className="text-ink-2 text-sm hover:underline"
        >
          ← ライブラリ
        </Link>
        <div className="flex items-center gap-2">
          <p className="text-ink-2 text-xs">{source.availability}</p>
          <SourceCardMenu sourceId={source.id} url={source.post.url} />
        </div>
      </div>

      <SourceHero
        sourceId={source.id}
        authorName={source.post.authorName}
        authorUsername={source.post.authorUsername}
        authorAvatarUrl={source.post.authorAvatarUrl}
        postedAt={source.post.postedAt}
        url={source.post.url}
        media={source.post.media}
      />

      <ReaderSegments hasArticle={hasArticle} />

      <section id="original" className="scroll-mt-16">
        <h1 className="mt-6 font-semibold text-2xl" lang="ja" translate="no">
          原文
        </h1>
        <p className="mt-1 text-ink-2 text-sm" lang="ja" translate="no">
          英語などの原文・記事は、「日本語に翻訳」か、「原文を選択」→ 右クリック
          → 日本語に翻訳で読めます。長い記事は本文の上にボタンがあります。
        </p>

        {source.post.isReply ? (
          source.parent ? (
            <div className="mt-5">
              <PostBlock post={source.parent} eyebrow="返信先" />
            </div>
          ) : (
            <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-line p-4">
              <p className="text-sm">返信先の投稿がまだありません。</p>
              <ContextFetchButton
                sourceId={source.id}
                kind="parent"
                label="返信先を取得"
              />
            </div>
          )
        ) : null}

        <div className="mt-5">
          <PostBlock post={source.post} eyebrow="ブックマーク" />
        </div>

        {source.thread.length > 0 ? (
          <CollapsibleSection
            title="セルフスレッド"
            count={source.thread.length}
          >
            {source.thread.map((post) => (
              <PostBlock key={post.id} post={post} />
            ))}
          </CollapsibleSection>
        ) : source.threadLoaded ? (
          <p className="mt-6 text-ink-2 text-sm">
            追加のセルフスレッドはありません。
          </p>
        ) : flags.threadExpandEnabled ? (
          <div className="mt-6">
            <ContextFetchButton
              sourceId={source.id}
              kind="thread"
              label="セルフスレッドを取得"
            />
          </div>
        ) : (
          <p className="mt-6 text-ink-2 text-sm">
            セルフスレッドの取得は Settings のトグルが OFF です。
          </p>
        )}

        {source.replies.length > 0 ? (
          <CollapsibleSection title="直近の返信" count={source.replies.length}>
            {source.replies.map((post) => (
              <PostBlock key={post.id} post={post} eyebrow="返信" />
            ))}
          </CollapsibleSection>
        ) : flags.replyContextEnabled ? (
          <div className="mt-6">
            <ContextFetchButton
              sourceId={source.id}
              kind="replies"
              label="直近7日の返信を取得"
            />
          </div>
        ) : (
          <p className="mt-6 text-ink-2 text-sm">
            返信ツリーの自動取得は Settings のトグルが OFF です。
          </p>
        )}
      </section>

      {hasArticle ? (
        <section id="article" className="mt-10 scroll-mt-16">
          <h2 className="font-semibold text-lg" lang="ja" translate="no">
            記事
          </h2>
          <div className="mt-3 space-y-3">
            {source.articles.map((article) => (
              <ArticleBlock
                key={article.id}
                id={article.id}
                title={article.title}
                url={article.url}
                scope={article.scope}
                description={article.description}
                contentText={article.contentText}
                contentHtml={article.contentHtml}
                lang={source.post.lang}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section id="summary" className="mt-10 scroll-mt-16">
        {hasSummary ? (
          <div
            className="notranslate rounded-[var(--radius-card)] border border-ai/30 bg-ai-soft p-5"
            lang="ja"
            translate="no"
          >
            <p className="text-ai text-xs">✦ AI 要約</p>
            <p className="mt-2 text-sm leading-7">{source.aiSummary}</p>
            <dl className="mt-4 grid gap-1 text-ink-2 text-xs">
              {infoLabel ? (
                <div>
                  <dt className="inline">情報タイプ：</dt>
                  <dd className="inline">{infoLabel}</dd>
                </div>
              ) : null}
              {source.categoryName ? (
                <div>
                  <dt className="inline">カテゴリ：</dt>
                  <dd className="inline">
                    {source.categoryName}
                    {source.categoryConfidence != null
                      ? ` ${Math.round(source.categoryConfidence * 100)}%`
                      : ""}
                  </dd>
                </div>
              ) : null}
              {source.aiImportance != null ? (
                <div>
                  <dt className="inline">重要度：</dt>
                  <dd className="inline">
                    {IMPORTANCE[source.aiImportance] ?? source.aiImportance}
                  </dd>
                </div>
              ) : null}
              {source.tags.length > 0 ? (
                <div>
                  <dt className="inline">タグ：</dt>
                  <dd className="inline">{source.tags.join(" · ")}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line p-5">
            <p className="text-ai text-xs">✦ AI 要約</p>
            <p className="mt-2 text-ink-2 text-sm">まだ要約がありません。</p>
          </div>
        )}
        <SourceReenrichButton id={source.id} />
      </section>

      <SourceActions
        id={source.id}
        triageStatus={source.triageStatus}
        categoryId={source.categoryId}
        infoType={source.infoType}
      />

      <SourceNote id={source.id} userNote={source.userNote} />
      <SourceStatusBar id={source.id} readStatus={source.readStatus} />
    </main>
  );
}
