export type JobRow = {
  id: number;
  type: string;
  payload_json: string;
  dedupe_key: string | null;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: string;
  timeout_sec: number;
  locked_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type TickSource = "cron" | "client";

export const JOB_PRIORITY: Record<string, number> = {
  sync_bookmarks: 100,
  sync_folders: 90,
  send_push: 80,
  media_download: 70,
  fetch_parent: 65,
  expand_thread: 60,
  reply_context: 55,
  article_fetch: 50,
  enrich_batch: 40,
  build_briefing: 35,
  embed_source: 30,
  schedule_echo: 25,
  relate_source: 20,
  build_insights: 15,
  compute_layout: 10,
  export_build: 5,
};
