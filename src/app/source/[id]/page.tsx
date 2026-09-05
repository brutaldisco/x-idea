import Link from "next/link";
import { notFound } from "next/navigation";
import { after, connection } from "next/server";
import { ContextFetchButton } from "@/components/ContextFetchButton";
import { PostBlock } from "@/components/PostBlock";
import { runJobs } from "@/server/jobs/runner";
import { enqueuePendingMediaDownloads } from "@/server/media/enqueue-pending";
import { getContextSettings } from "@/server/settings";
import { getSourceDetail } from "@/server/sources/detail";
import { getAccountContext } from "@/server/x/context";

export const instant = false;

export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const ctx = await getAccountContext();
  const [source, flags] = await Promise.all([
    getSourceDetail(id, ctx),
    getContextSettings(),
  ]);
  if (!source) {
    notFound();
  }
  if (source.xAccountId) {
    await enqueuePendingMediaDownloads(source.xAccountId, 16);
    after(() => {
      void runJobs({ max: 3 });
    });
  }

  return (
    <main className="px-6 pt-8 pb-10">
      <div className="flex items-center justify-between gap-3">
        <Link href="/library" className="text-ink-2 text-sm hover:underline">
          ← ライブラリ
        </Link>
        <p className="text-ink-2 text-xs">{source.availability}</p>
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
        <section className="mt-8">
          <h2 className="font-semibold text-lg">セルフスレッド</h2>
          <div className="mt-3 space-y-3">
            {source.thread.map((post) => (
              <PostBlock key={post.id} post={post} />
            ))}
          </div>
        </section>
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
        <section className="mt-8">
          <h2 className="font-semibold text-lg">直近の返信</h2>
          <div className="mt-3 space-y-3">
            {source.replies.map((post) => (
              <PostBlock key={post.id} post={post} eyebrow="返信" />
            ))}
          </div>
        </section>
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
          <h2 className="font-semibold text-lg">リンク</h2>
          <ul className="mt-2 space-y-2">
            {source.articles.map((article) => (
              <li key={article.id}>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent text-sm hover:underline"
                >
                  {article.title || article.url}
                </a>
                <span className="ml-2 text-ink-2 text-xs">{article.scope}</span>
              </li>
            ))}
          </ul>
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

      {source.userNote ? (
        <section className="mt-6 border-ink border-l-2 pl-4" translate="no">
          <p className="text-ink-2 text-xs">自分のメモ</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{source.userNote}</p>
        </section>
      ) : null}
    </main>
  );
}
