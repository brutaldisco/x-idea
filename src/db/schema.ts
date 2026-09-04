import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  syncIntervalMin: integer("sync_interval_min").notNull().default(30),
  saveReplies: integer("save_replies").notNull().default(1),
  autoFileThreshold: real("auto_file_threshold").notNull().default(0.8),
  excludedDomainsJson: text("excluded_domains_json").notNull().default("[]"),
  aiModelsJson: text("ai_models_json")
    .notNull()
    .default(
      '{"bulk":"gemini-3.5-flash-lite","quality":"gemini-3.6-flash","embed":"gemini-embedding-2"}',
    ),
  aiLaneCapsJson: text("ai_lane_caps_json")
    .notNull()
    .default('{"bulk":400,"quality":16,"embed":800}'),
  xApiEnabled: integer("x_api_enabled").notNull().default(0),
  aiPaidEnabled: integer("ai_paid_enabled").notNull().default(0),
  aiPaidMonthlyCapUsd: real("ai_paid_monthly_cap_usd").notNull().default(5),
  aiPaused: integer("ai_paused").notNull().default(0),
  allowDeepThink: integer("allow_deep_think").notNull().default(1),
  paidProvidersJson: text("paid_providers_json")
    .notNull()
    .default('{"anthropic":false,"openai":false}'),
  observabilityJson: text("observability_json")
    .notNull()
    .default('{"sentry":false,"uptime_robot":false}'),
  threadExpandEnabled: integer("thread_expand_enabled").notNull().default(0),
  threadExpandMonthlyCapUsd: real("thread_expand_monthly_cap_usd")
    .notNull()
    .default(2),
  briefingTimeLocal: text("briefing_time_local").notNull().default("07:00"),
  timezone: text("timezone").notNull().default("Asia/Tokyo"),
  lastSyncHeadTweetId: text("last_sync_head_tweet_id"),
  lastSyncedAt: text("last_synced_at"),
  initialImportStateJson: text("initial_import_state_json"),
  onboardingDone: integer("onboarding_done").notNull().default(0),
  xUsageCacheJson: text("x_usage_cache_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const xAccount = sqliteTable("x_account", {
  id: text("id").primaryKey(),
  xUserId: text("x_user_id").notNull().unique(),
  xUsername: text("x_username").notNull(),
  xName: text("x_name"),
  xAvatarUrl: text("x_avatar_url"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: text("token_expires_at").notNull(),
  scopesJson: text("scopes_json").notNull(),
  status: text("status").notNull().default("active"),
  syncEnabled: integer("sync_enabled").notNull().default(0),
  lastSyncHeadTweetId: text("last_sync_head_tweet_id"),
  lastSyncedAt: text("last_synced_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    origin: text("origin").notNull().default("x_bookmark"),
    kind: text("kind").notNull(),
    xAccountId: text("x_account_id"),
    xPostId: text("x_post_id"),
    articleId: text("article_id"),
    bookmarkedAt: text("bookmarked_at"),
    savedAt: text("saved_at").notNull(),
    availability: text("availability").notNull().default("available"),
    aiSummary: text("ai_summary"),
    aiImportance: integer("ai_importance"),
    aiKeySentencesJson: text("ai_key_sentences_json"),
    aiUncertaintyReason: text("ai_uncertainty_reason"),
    categoryId: text("category_id"),
    categorySource: text("category_source").notNull().default("none"),
    categoryConfidence: real("category_confidence"),
    categoryCandidatesJson: text("category_candidates_json"),
    infoType: text("info_type"),
    infoTypeSource: text("info_type_source").notNull().default("none"),
    triageStatus: text("triage_status").notNull().default("pending"),
    readStatus: text("read_status").notNull().default("unread"),
    userNote: text("user_note"),
    pinned: integer("pinned").notNull().default(0),
    snoozedUntil: text("snoozed_until"),
    needsReenrich: integer("needs_reenrich").notNull().default(0),
    embedStatus: text("embed_status").notNull().default("pending"),
    language: text("language"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_sources_triage").on(table.triageStatus, table.savedAt, table.id),
    index("idx_sources_saved").on(table.savedAt, table.id),
  ],
);

export const xPosts = sqliteTable("x_posts", {
  id: text("id").primaryKey(),
  tweetId: text("tweet_id").notNull().unique(),
  conversationId: text("conversation_id"),
  threadRootId: text("thread_root_id"),
  threadIndex: integer("thread_index"),
  authorId: text("author_id").notNull(),
  authorUsername: text("author_username"),
  authorName: text("author_name"),
  authorAvatarUrl: text("author_avatar_url"),
  text: text("text").notNull(),
  lang: text("lang"),
  postedAt: text("posted_at"),
  url: text("url").notNull(),
  isReply: integer("is_reply").notNull().default(0),
  quotedTweetId: text("quoted_tweet_id"),
  quotedSnapshotJson: text("quoted_snapshot_json"),
  rawEntitiesJson: text("raw_entities_json"),
  rawPayloadJson: text("raw_payload_json"),
  fetchedAt: text("fetched_at").notNull(),
});

export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  normalizedUrl: text("normalized_url").notNull().unique(),
  originalUrl: text("original_url").notNull(),
  domain: text("domain").notNull(),
  title: text("title"),
  author: text("author"),
  publishedAt: text("published_at"),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  contentHtml: text("content_html"),
  contentText: text("content_text"),
  contentLinksJson: text("content_links_json"),
  fetchScope: text("fetch_scope").notNull().default("pending"),
  fetchError: text("fetch_error"),
  httpStatus: integer("http_status"),
  fetchedAt: text("fetched_at"),
  aiSummary: text("ai_summary"),
  createdAt: text("created_at").notNull(),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    dedupeKey: text("dedupe_key"),
    status: text("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAfter: text("run_after").notNull(),
    timeoutSec: integer("timeout_sec").notNull().default(120),
    lockedBy: text("locked_by"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_jobs_dequeue").on(
      table.status,
      table.runAfter,
      table.priority,
      table.createdAt,
    ),
  ],
);

export const jobSchedules = sqliteTable("job_schedules", {
  key: text("key").primaryKey(),
  jobType: text("job_type").notNull(),
  cronExpr: text("cron_expr").notNull(),
  tz: text("tz").notNull().default("Asia/Tokyo"),
  enabled: integer("enabled").notNull().default(1),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
});

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  xAccountId: text("x_account_id"),
  trigger: text("trigger").notNull(),
  mode: text("mode").notNull().default("incremental"),
  status: text("status").notNull(),
  newSources: integer("new_sources").notNull().default(0),
  pagesFetched: integer("pages_fetched").notNull().default(0),
  resourcesRead: integer("resources_read").notNull().default(0),
  estCostUsd: real("est_cost_usd").notNull().default(0),
  apiErrorsJson: text("api_errors_json"),
  rateLimitRemaining: integer("rate_limit_remaining"),
  rateLimitReset: text("rate_limit_reset"),
  errorMessage: text("error_message"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

export const aiUsageDaily = sqliteTable(
  "ai_usage_daily",
  {
    dayPt: text("day_pt").notNull(),
    lane: text("lane").notNull(),
    model: text("model").notNull(),
    requests: integer("requests").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    cooldownUntil: text("cooldown_until"),
    lastError: text("last_error"),
  },
  (table) => [primaryKey({ columns: [table.dayPt, table.lane, table.model] })],
);

export const knowledgeCards = sqliteTable("knowledge_cards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  oneLiner: text("one_liner"),
  aiKeyPointsJson: text("ai_key_points_json"),
  aiClaimsJson: text("ai_claims_json"),
  aiCaveatsJson: text("ai_caveats_json"),
  aiDraftMetaJson: text("ai_draft_meta_json"),
  myMeaning: text("my_meaning"),
  myApplication: text("my_application"),
  myNextActions: text("my_next_actions"),
  userEdited: integer("user_edited").notNull().default(0),
  categoryId: text("category_id"),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const briefings = sqliteTable("briefings", {
  dateLocal: text("date_local").primaryKey(),
  headline: text("headline").notNull(),
  sectionsJson: text("sections_json").notNull(),
  scriptText: text("script_text").notNull(),
  model: text("model").notNull(),
  openedAt: text("opened_at"),
  listenedSeconds: integer("listened_seconds").default(0),
  createdAt: text("created_at").notNull(),
});

export const insights = sqliteTable("insights", {
  id: text("id").primaryKey(),
  weekStartLocal: text("week_start_local").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  sourceIdsJson: text("source_ids_json").notNull().default("[]"),
  dismissed: integer("dismissed").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [uniqueIndex("api_tokens_token_hash").on(table.tokenHash)],
);

export const xCreditLedger = sqliteTable(
  "x_credit_ledger",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    amountUsd: real("amount_usd").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_x_credit_ledger_created").on(table.createdAt)],
);
