export type SyncKind = "sync" | "backfill";

export type SyncOutcome = {
  phase: "done" | "error";
  title: string;
  detail: string;
};

export function describeSyncResult(input: {
  ok: boolean;
  created: number;
  errors: number;
  kind: SyncKind;
}): SyncOutcome {
  if (!input.ok || (input.errors > 0 && input.created <= 0)) {
    return {
      phase: "error",
      title: "取得できませんでした",
      detail: "もう一度試してください。",
    };
  }
  const partial = input.errors > 0 ? " 一部のアカウントは失敗しました。" : "";
  if (input.kind === "backfill") {
    return {
      phase: "done",
      title: "取得済み",
      detail:
        input.created > 0
          ? `過去分から ${input.created} 件を追加しました。${partial}`
          : `新しい過去分はありませんでした。${partial}`,
    };
  }
  return {
    phase: "done",
    title: "取得済み",
    detail:
      input.created > 0
        ? `新着 ${input.created} 件をライブラリに追加しました。${partial}`
        : `新しいブックマークはありませんでした。${partial}`,
  };
}
