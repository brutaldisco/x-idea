PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sync_interval_min INTEGER NOT NULL DEFAULT 30,
  save_replies INTEGER NOT NULL DEFAULT 1,
  auto_file_threshold REAL NOT NULL DEFAULT 0.8,
  excluded_domains_json TEXT NOT NULL DEFAULT '[]',
  ai_models_json TEXT NOT NULL DEFAULT '{"bulk":"gemini-3.5-flash-lite","quality":"gemini-3.6-flash","embed":"gemini-embedding-2"}',
  ai_lane_caps_json TEXT NOT NULL DEFAULT '{"bulk":400,"quality":16,"embed":800}',
  x_api_enabled INTEGER NOT NULL DEFAULT 0,
  ai_paid_enabled INTEGER NOT NULL DEFAULT 0,
  ai_paid_monthly_cap_usd REAL NOT NULL DEFAULT 5,
  ai_paused INTEGER NOT NULL DEFAULT 0,
  allow_deep_think INTEGER NOT NULL DEFAULT 1,
  paid_providers_json TEXT NOT NULL DEFAULT '{"anthropic":false,"openai":false}',
  observability_json TEXT NOT NULL DEFAULT '{"sentry":false,"uptime_robot":false}',
  thread_expand_enabled INTEGER NOT NULL DEFAULT 0,
  thread_expand_monthly_cap_usd REAL NOT NULL DEFAULT 2,
  briefing_time_local TEXT NOT NULL DEFAULT '07:00',
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  last_sync_head_tweet_id TEXT,
  last_synced_at TEXT,
  initial_import_state_json TEXT,
  onboarding_done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS x_account (
  id TEXT PRIMARY KEY,
  x_user_id TEXT NOT NULL UNIQUE,
  x_username TEXT NOT NULL,
  x_name TEXT,
  x_avatar_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (parent_id, name)
);

CREATE TABLE IF NOT EXISTS x_bookmark_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  mapping_mode TEXT NOT NULL DEFAULT 'hint',
  sync_enabled INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS x_post_folders (
  tweet_id TEXT NOT NULL,
  folder_id TEXT NOT NULL REFERENCES x_bookmark_folders(id) ON DELETE CASCADE,
  PRIMARY KEY (tweet_id, folder_id)
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL DEFAULT 'x_bookmark',
  kind TEXT NOT NULL CHECK (kind IN ('x_post','article','note')),
  x_post_id TEXT,
  article_id TEXT,
  bookmarked_at TEXT,
  saved_at TEXT NOT NULL DEFAULT (datetime('now')),
  availability TEXT NOT NULL DEFAULT 'available',
  ai_summary TEXT,
  ai_importance INTEGER,
  ai_key_sentences_json TEXT,
  ai_uncertainty_reason TEXT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  category_source TEXT NOT NULL DEFAULT 'none',
  category_confidence REAL,
  category_candidates_json TEXT,
  info_type TEXT,
  info_type_source TEXT NOT NULL DEFAULT 'none',
  triage_status TEXT NOT NULL DEFAULT 'pending',
  read_status TEXT NOT NULL DEFAULT 'unread',
  user_note TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  snoozed_until TEXT,
  needs_reenrich INTEGER NOT NULL DEFAULT 0,
  embed_status TEXT NOT NULL DEFAULT 'pending',
  language TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS x_posts (
  id TEXT PRIMARY KEY,
  tweet_id TEXT NOT NULL UNIQUE,
  conversation_id TEXT,
  thread_root_id TEXT,
  thread_index INTEGER,
  author_id TEXT NOT NULL,
  author_username TEXT,
  author_name TEXT,
  author_avatar_url TEXT,
  text TEXT NOT NULL,
  lang TEXT,
  posted_at TEXT,
  url TEXT NOT NULL,
  is_reply INTEGER NOT NULL DEFAULT 0,
  quoted_tweet_id TEXT,
  quoted_snapshot_json TEXT,
  raw_entities_json TEXT,
  raw_payload_json TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  normalized_url TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  author TEXT,
  published_at TEXT,
  description TEXT,
  thumbnail_url TEXT,
  content_html TEXT,
  content_text TEXT,
  content_links_json TEXT,
  fetch_scope TEXT NOT NULL DEFAULT 'pending',
  fetch_error TEXT,
  http_status INTEGER,
  fetched_at TEXT,
  ai_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_articles (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  link_url TEXT NOT NULL,
  PRIMARY KEY (source_id, article_id)
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  x_post_id TEXT REFERENCES x_posts(id) ON DELETE CASCADE,
  media_key TEXT,
  type TEXT NOT NULL,
  preview_url TEXT,
  media_url TEXT,
  alt_text TEXT,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  ai_ocr_text TEXT,
  ai_description TEXT,
  analysis_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tag_aliases (
  alias TEXT PRIMARY KEY,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS source_tags (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  added_by TEXT NOT NULL DEFAULT 'ai',
  PRIMARY KEY (source_id, tag_id)
);

CREATE TABLE IF NOT EXISTS enrichments (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  batch_id TEXT,
  kind TEXT NOT NULL,
  lane TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL DEFAULT 0,
  few_shot_ids_json TEXT,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  one_liner TEXT,
  ai_key_points_json TEXT,
  ai_claims_json TEXT,
  ai_caveats_json TEXT,
  ai_draft_meta_json TEXT,
  my_meaning TEXT,
  my_application TEXT,
  my_next_actions TEXT,
  user_edited INTEGER NOT NULL DEFAULT 0,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
  kc_id TEXT REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  embedding F32_BLOB(768),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, article_id, kc_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS feedback_examples (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  field TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  ai_value_json TEXT NOT NULL,
  user_value_json TEXT NOT NULL,
  embedding F32_BLOB(768),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  day_pt TEXT NOT NULL,
  lane TEXT NOT NULL,
  model TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  last_error TEXT,
  PRIMARY KEY (day_pt, lane, model)
);

CREATE TABLE IF NOT EXISTS media_embeddings (
  media_id TEXT PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  embedding F32_BLOB(768),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_relations (
  id TEXT PRIMARY KEY,
  source_id_a TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  source_id_b TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  score REAL,
  detected_by TEXT NOT NULL DEFAULT 'ai',
  status TEXT NOT NULL DEFAULT 'proposed',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id_a, source_id_b, relation),
  CHECK (source_id_a < source_id_b)
);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  quote TEXT NOT NULL,
  prefix TEXT,
  suffix TEXT,
  note TEXT,
  created_by TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kc_sources (
  kc_id TEXT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'evidence',
  PRIMARY KEY (kc_id, source_id)
);

CREATE TABLE IF NOT EXISTS kc_relations (
  kc_id_a TEXT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  kc_id_b TEXT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'related',
  PRIMARY KEY (kc_id_a, kc_id_b),
  CHECK (kc_id_a < kc_id_b)
);

CREATE TABLE IF NOT EXISTS lenses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query_text TEXT,
  query_embedding F32_BLOB(768),
  filters_json TEXT NOT NULL DEFAULT '{}',
  min_score REAL NOT NULL DEFAULT 0.35,
  pinned INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS briefings (
  date_local TEXT PRIMARY KEY,
  headline TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  script_text TEXT NOT NULL,
  model TEXT NOT NULL,
  opened_at TEXT,
  listened_seconds INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  week_start_local TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  dismissed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recall_items (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  question TEXT,
  interval_days INTEGER NOT NULL DEFAULT 7,
  ease REAL NOT NULL DEFAULT 2.5,
  due_at TEXT NOT NULL,
  last_result TEXT,
  times_shown INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (target_type, target_id)
);

CREATE TABLE IF NOT EXISTS recall_events (
  id TEXT PRIMARY KEY,
  recall_item_id TEXT NOT NULL REFERENCES recall_items(id) ON DELETE CASCADE,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_layout (
  source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL,
  cluster_id INTEGER,
  computed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS layout_clusters (
  id INTEGER PRIMARY KEY,
  label TEXT,
  size INTEGER NOT NULL,
  cx REAL,
  cy REAL,
  computed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qa_sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  filters_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  parts_json TEXT NOT NULL,
  citations_json TEXT,
  lane TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  keys_json TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_success_at TEXT,
  failures INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TEXT NOT NULL DEFAULT (datetime('now')),
  timeout_sec INTEGER NOT NULL DEFAULT 120,
  locked_by TEXT,
  started_at TEXT,
  finished_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_schedules (
  key TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  cron_expr TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'incremental',
  status TEXT NOT NULL,
  new_sources INTEGER NOT NULL DEFAULT 0,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  resources_read INTEGER NOT NULL DEFAULT 0,
  est_cost_usd REAL NOT NULL DEFAULT 0,
  api_errors_json TEXT,
  rate_limit_remaining INTEGER,
  rate_limit_reset TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_x_posts_thread ON x_posts (thread_root_id, thread_index);
CREATE INDEX IF NOT EXISTS idx_articles_domain ON articles (domain);
CREATE INDEX IF NOT EXISTS idx_media_post ON media_assets (x_post_id);
CREATE INDEX IF NOT EXISTS idx_source_tags_tag ON source_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_enrichments_source ON enrichments (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON source_chunks (source_id);
CREATE INDEX IF NOT EXISTS idx_relations_a ON source_relations (source_id_a, status);
CREATE INDEX IF NOT EXISTS idx_relations_b ON source_relations (source_id_b, status);
CREATE INDEX IF NOT EXISTS idx_highlights_source ON highlights (source_id);
CREATE INDEX IF NOT EXISTS idx_insights_week ON insights (week_start_local, dismissed);
CREATE INDEX IF NOT EXISTS idx_recall_due ON recall_items (active, due_at);
CREATE INDEX IF NOT EXISTS idx_qa_messages ON qa_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_dequeue ON jobs (status, run_after, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sources_triage ON sources (triage_status, saved_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_sources_filter ON sources (category_id, info_type, read_status, saved_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_sources_saved ON sources (saved_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_sources_x_post ON sources (x_post_id);
CREATE INDEX IF NOT EXISTS idx_sources_embed ON sources (embed_status, saved_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_dedupe ON jobs (type, dedupe_key)
  WHERE status IN ('pending','running') AND dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_vec ON feedback_examples (
  libsql_vector_idx(embedding, 'compress_neighbors=float1bit', 'max_neighbors=16')
);
CREATE INDEX IF NOT EXISTS idx_chunks_vec ON source_chunks (
  libsql_vector_idx(embedding, 'compress_neighbors=float1bit', 'max_neighbors=32')
);
CREATE INDEX IF NOT EXISTS idx_media_vec ON media_embeddings (
  libsql_vector_idx(embedding, 'compress_neighbors=float1bit', 'max_neighbors=32')
);

CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(
  source_id UNINDEXED,
  post_text,
  article_title,
  article_text,
  ai_summary,
  user_note,
  tags,
  media_text,
  tokenize = 'trigram'
);
