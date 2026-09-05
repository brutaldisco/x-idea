import Link from "next/link";
import { notFound } from "next/navigation";
import { after, connection } from "next/server";
import { ArticleBlock } from "@/components/ArticleBlock";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { ContextFetchButton } from "@/components/ContextFetchButton";
import { PostBlock } from "@/components/PostBlock";
import { SourceActions } from "@/components/SourceActions";
import { SourceCardMenu } from "@/components/SourceCardMenu";
import { ensureSourceArticles } from "@/server/fetch/attach";
import { enqueuePendingArticleFetches } from "@/server/fetch/enqueue-pending";
import { runJobs } from "@/server/jobs/runner";
import { enqueuePendingMediaDownloads } from "@/server/media/enqueue-pending";
import { persistLocalMedia } from "@/server/media/persist";
import { getContextSettings } from "@/server/settings";
import { getSourceDetail } from "@/server/sources/detail";
import { getAccountContext } from "@/server/x/context";

export const instant = false;
export const maxDuration = 60;

export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const ctx = await getAccountContext();
  await ensureSourceArticles(id);
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

  return (
    <main className="px-6 pt-8 pb-10">
      <div className="flex items-center justify-between gap-3">
        <Link href="/library" className="text-ink-2 text-sm hover:underline">
          ← ライブラリ
        </Link>
        <div className="flex items-center gap-2">
          <p className="text-ink-2 text-xs">{source.availability}</p>
          <SourceCardMenu sourceId={source.id} url={source.post.url} />
        </div>
      </div>
      <h1 className="mt-4 font-semibold text-2xl" lang="ja" translate="no">
        原文
      </h1>
      <p className="mt-1 text-ink-2 text-sm" lang="ja" translate="no">
        英語などの原文は、投稿下の「日本語に翻訳」か、「原文を選択」→ 右クリック
        → 日本語に翻訳で読めます。
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
        <CollapsibleSection title="セルフスレッド" count={source.thread.length}>
          {source.thread.map((post) => (
            <PostBlock key={post.id} post={post} />
          ))}
        </CollapsibleSection>
      ) : flags.threadExpandEnabled ? (
        <div className="mt-6">
          <ContextFetchButton
            sourceId={source.id}
            kind="thread"
            label="セルフスレッドを取得"
          />
        </div>
      ) : null}

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

      {source.articles.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-semibold text-lg" lang="ja" translate="no">
            記事
          </h2>
          <div className="mt-3 space-y-3">
            {source.articles.map((article) => (
              <ArticleBlock
                key={article.id}
                title={article.title}
                url={article.url}
                scope={article.scope}
                description={article.description}
                contentText={article.contentText}
                contentHtml={article.contentHtml}
              />
            ))}
          </div>
        </section>
      ) : null}

      {source.aiSummary ? (
        <section
          className="notranslate mt-8 rounded-[var(--radius-card)] border border-line bg-ai-soft p-5"
          lang="ja"
          translate="no"
        >
          <p className="text-ai text-xs">✦ AI</p>
          <p className="mt-2 text-sm">{source.aiSummary}</p>
        </section>
      ) : null}

      <SourceActions
        id={source.id}
        triageStatus={source.triageStatus}
        readStatus={source.readStatus}
        userNote={source.userNote}
        categoryId={source.categoryId}
        infoType={source.infoType}
      />
    </main>
  );
}
