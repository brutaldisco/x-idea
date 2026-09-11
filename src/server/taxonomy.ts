import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { SEED_CATEGORIES } from "@/db/seed";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import {
  isTaxonomyAccentId,
  nextTaxonomyAccent,
  type TaxonomyAccentId,
} from "@/lib/taxonomy-accent";
import { isTaxonomyItemId } from "@/lib/taxonomy-id";
import { taxonomySortOrders } from "@/lib/taxonomy-order";
import { INFO_TYPE_LABELS, INFO_TYPES } from "@/server/ai/info-types";
import { listXAccounts } from "@/server/x/account";

export const TAXONOMY_KINDS = ["category", "info_type"] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export type TaxonomyItem = {
  id: string;
  name: string;
  color: TaxonomyAccentId | null;
};

export type AccountTaxonomy = {
  categories: TaxonomyItem[];
  infoTypes: TaxonomyItem[];
};

const NAME_MAX = 40;
const CATEGORY_MAX = 40;
const INFO_TYPE_MAX = 24;

export function isTaxonomyKind(value: string): value is TaxonomyKind {
  return (TAXONOMY_KINDS as readonly string[]).includes(value);
}

export function normalizeTaxonomyName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

export function defaultAccountTaxonomy(): AccountTaxonomy {
  return {
    categories: SEED_CATEGORIES.map((row) => ({
      id: row.id,
      name: row.name,
      color: null,
    })),
    infoTypes: INFO_TYPES.map((id) => ({
      id,
      name: INFO_TYPE_LABELS[id],
      color: null,
    })),
  };
}

export async function getAccountTaxonomy(
  accountId: string,
): Promise<AccountTaxonomy> {
  if (!isDbConfigured()) {
    return defaultAccountTaxonomy();
  }
  await ensureSchema();
  await assertAccount(accountId);
  await removeEmptyTaxonomyMarker(accountId);
  await ensureAccountTaxonomy(accountId);
  return readAccountTaxonomy(accountId);
}

export async function listAccountTaxonomies(
  accountIds: string[],
): Promise<Record<string, AccountTaxonomy>> {
  const entries = await Promise.all(
    accountIds.map(async (id) => [id, await getAccountTaxonomy(id)] as const),
  );
  return Object.fromEntries(entries);
}

export async function addTaxonomyItem(input: {
  accountId: string;
  kind: TaxonomyKind;
  name: string;
}): Promise<TaxonomyItem> {
  await ensureSchema();
  await assertAccount(input.accountId);
  await ensureAccountTaxonomy(input.accountId);
  const name = normalizeTaxonomyName(input.name);
  if (!name) {
    throw new AppError("VALIDATION", "名前が必要です");
  }
  const current = await readAccountTaxonomy(input.accountId);
  const list =
    input.kind === "category" ? current.categories : current.infoTypes;
  const limit = input.kind === "category" ? CATEGORY_MAX : INFO_TYPE_MAX;
  if (list.length >= limit) {
    throw new AppError("VALIDATION", `最大 ${limit} 件です`);
  }
  if (list.some((row) => row.name === name)) {
    throw new AppError("VALIDATION", "同じ名前がすでにあります");
  }
  const sortOrder = list.length * 10 + 10;
  const color = nextTaxonomyAccent(list.map((row) => row.color));
  const itemId =
    input.kind === "category"
      ? await insertCategory(name, sortOrder)
      : infoTypeId();
  await getClient().execute({
    sql: `INSERT INTO account_taxonomy
            (id, x_account_id, kind, item_id, name, color, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      newId(),
      input.accountId,
      input.kind,
      itemId,
      name,
      color,
      sortOrder,
    ],
  });
  return { id: itemId, name, color };
}

export async function renameTaxonomyItem(input: {
  accountId: string;
  kind: TaxonomyKind;
  itemId: string;
  name: string;
}): Promise<TaxonomyItem> {
  await ensureSchema();
  await assertAccount(input.accountId);
  await ensureAccountTaxonomy(input.accountId);
  const name = normalizeTaxonomyName(input.name);
  if (!name) {
    throw new AppError("VALIDATION", "名前が必要です");
  }
  const current = await readAccountTaxonomy(input.accountId);
  const list =
    input.kind === "category" ? current.categories : current.infoTypes;
  if (!list.some((row) => row.id === input.itemId)) {
    throw new AppError("NOT_FOUND", "項目が見つかりません");
  }
  if (list.some((row) => row.id !== input.itemId && row.name === name)) {
    throw new AppError("VALIDATION", "同じ名前がすでにあります");
  }
  const result = await getClient().execute({
    sql: `UPDATE account_taxonomy SET name = ?
          WHERE x_account_id = ? AND kind = ? AND item_id = ?`,
    args: [name, input.accountId, input.kind, input.itemId],
  });
  if (Number(result.rowsAffected ?? 0) === 0) {
    throw new AppError("NOT_FOUND", "項目が見つかりません");
  }
  if (input.kind === "category") {
    const shared = await getClient().execute({
      sql: `SELECT COUNT(*) AS n FROM account_taxonomy
            WHERE kind = 'category' AND item_id = ? AND x_account_id != ?
            LIMIT 1`,
      args: [input.itemId, input.accountId],
    });
    if (Number(shared.rows[0]?.n ?? 0) === 0) {
      await getClient().execute({
        sql: "UPDATE categories SET name = ? WHERE id = ?",
        args: [name, input.itemId],
      });
    }
  }
  return { id: input.itemId, name, color: currentColor(list, input.itemId) };
}

export async function setTaxonomyItemColor(input: {
  accountId: string;
  kind: TaxonomyKind;
  itemId: string;
  color: string | null;
}): Promise<TaxonomyItem> {
  await ensureSchema();
  await assertAccount(input.accountId);
  await ensureAccountTaxonomy(input.accountId);
  const color =
    input.color == null || input.color === ""
      ? null
      : isTaxonomyAccentId(input.color)
        ? input.color
        : null;
  if (input.color && !color) {
    throw new AppError("VALIDATION", "色が不正です");
  }
  const current = await readAccountTaxonomy(input.accountId);
  const list =
    input.kind === "category" ? current.categories : current.infoTypes;
  const row = list.find((item) => item.id === input.itemId);
  if (!row) {
    throw new AppError("NOT_FOUND", "項目が見つかりません");
  }
  const result = await getClient().execute({
    sql: `UPDATE account_taxonomy SET color = ?
          WHERE x_account_id = ? AND kind = ? AND item_id = ?`,
    args: [color, input.accountId, input.kind, input.itemId],
  });
  if (Number(result.rowsAffected ?? 0) === 0) {
    throw new AppError("NOT_FOUND", "項目が見つかりません");
  }
  return { id: input.itemId, name: row.name, color };
}

export async function reorderTaxonomyItems(input: {
  accountId: string;
  kind: TaxonomyKind;
  itemIds: string[];
}): Promise<AccountTaxonomy> {
  await ensureSchema();
  await assertAccount(input.accountId);
  await ensureAccountTaxonomy(input.accountId);
  const current = await readAccountTaxonomy(input.accountId);
  const list =
    input.kind === "category" ? current.categories : current.infoTypes;
  const updates = taxonomySortOrders(
    list.map((row) => row.id),
    input.itemIds,
  );
  const client = getClient();
  for (const row of updates) {
    await client.execute({
      sql: `UPDATE account_taxonomy SET sort_order = ?
            WHERE x_account_id = ? AND kind = ? AND item_id = ?`,
      args: [row.sortOrder, input.accountId, input.kind, row.itemId],
    });
  }
  logger.info(
    { accountId: input.accountId, kind: input.kind, count: updates.length },
    "taxonomy.reordered",
  );
  return readAccountTaxonomy(input.accountId);
}

export async function removeTaxonomyItem(input: {
  accountId: string;
  kind: TaxonomyKind;
  itemId: string;
}): Promise<void> {
  await ensureSchema();
  await assertAccount(input.accountId);
  await ensureAccountTaxonomy(input.accountId);
  const current = await readAccountTaxonomy(input.accountId);
  const list =
    input.kind === "category" ? current.categories : current.infoTypes;
  if (list.length <= 1) {
    throw new AppError("VALIDATION", "最後の1件は削除できません");
  }
  const result = await getClient().execute({
    sql: `DELETE FROM account_taxonomy
          WHERE x_account_id = ? AND kind = ? AND item_id = ?`,
    args: [input.accountId, input.kind, input.itemId],
  });
  if (Number(result.rowsAffected ?? 0) === 0) {
    throw new AppError("NOT_FOUND", "項目が見つかりません");
  }
}

/** 一覧・Reader 用の軽量読み取り。未シードならデフォルトを返す（Settings の getAccountTaxonomy がシードする）。 */
export async function taxonomyForAccount(
  accountId: string | null,
): Promise<AccountTaxonomy> {
  if (!accountId || !isDbConfigured()) {
    return defaultAccountTaxonomy();
  }
  await ensureSchema();
  return readAccountTaxonomy(accountId);
}

const TAXONOMY_EMPTY_ITEM_ID = "_empty";

export async function clearSourceTaxonomyBadges(
  accountId: string,
): Promise<{ cleared: number }> {
  await ensureSchema();
  await assertAccount(accountId);
  const result = await getClient().execute({
    sql: `UPDATE sources
          SET category_id = NULL,
              category_source = 'none',
              category_confidence = NULL,
              info_type = NULL,
              info_type_source = 'none',
              updated_at = datetime('now')
          WHERE x_account_id = ?
            AND (category_id IS NOT NULL OR info_type IS NOT NULL)`,
    args: [accountId],
  });
  const cleared = Number(result.rowsAffected ?? 0);
  logger.info({ accountId, cleared }, "taxonomy.source_badges_cleared");
  return { cleared };
}

async function removeEmptyTaxonomyMarker(accountId: string): Promise<void> {
  await getClient().execute({
    sql: `DELETE FROM account_taxonomy
          WHERE x_account_id = ? AND item_id = ?`,
    args: [accountId, TAXONOMY_EMPTY_ITEM_ID],
  });
}

async function ensureAccountTaxonomy(accountId: string): Promise<void> {
  const existing = await getClient().execute({
    sql: `SELECT id FROM account_taxonomy WHERE x_account_id = ? LIMIT 1`,
    args: [accountId],
  });
  if (existing.rows[0]) {
    return;
  }
  await seedAccountTaxonomy(accountId);
}

async function seedAccountTaxonomy(accountId: string): Promise<void> {
  const defaults = defaultAccountTaxonomy();
  const client = getClient();
  let order = 10;
  for (const row of defaults.categories) {
    await client.execute({
      sql: `INSERT INTO account_taxonomy
              (id, x_account_id, kind, item_id, name, sort_order, created_at)
            VALUES (?, ?, 'category', ?, ?, ?, datetime('now'))`,
      args: [newId(), accountId, row.id, row.name, order],
    });
    order += 10;
  }
  order = 10;
  for (const row of defaults.infoTypes) {
    await client.execute({
      sql: `INSERT INTO account_taxonomy
              (id, x_account_id, kind, item_id, name, sort_order, created_at)
            VALUES (?, ?, 'info_type', ?, ?, ?, datetime('now'))`,
      args: [newId(), accountId, row.id, row.name, order],
    });
    order += 10;
  }
}

async function readAccountTaxonomy(
  accountId: string,
): Promise<AccountTaxonomy> {
  const result = await getClient().execute({
    sql: `SELECT kind, item_id, name, color
          FROM account_taxonomy
          WHERE x_account_id = ?
          ORDER BY kind, sort_order, name
          LIMIT 80`,
    args: [accountId],
  });
  const categories: TaxonomyItem[] = [];
  const infoTypes: TaxonomyItem[] = [];
  for (const row of result.rows) {
    if (String(row.item_id) === TAXONOMY_EMPTY_ITEM_ID) {
      continue;
    }
    const colorRaw = row.color ? String(row.color) : "";
    const item = {
      id: String(row.item_id),
      name: String(row.name),
      color: isTaxonomyAccentId(colorRaw) ? colorRaw : null,
    };
    if (row.kind === "info_type") {
      infoTypes.push(item);
    } else if (row.kind === "category") {
      categories.push(item);
    }
  }
  const fallback = defaultAccountTaxonomy();
  return {
    categories: categories.length > 0 ? categories : fallback.categories,
    infoTypes: infoTypes.length > 0 ? infoTypes : fallback.infoTypes,
  };
}

async function assertAccount(accountId: string): Promise<void> {
  const accounts = await listXAccounts();
  if (!accounts.some((account) => account.id === accountId)) {
    throw new AppError("NOT_FOUND", "アカウントが見つかりません");
  }
}

async function insertCategory(
  name: string,
  sortOrder: number,
): Promise<string> {
  const id = `cat_${newId().toLowerCase()}`;
  try {
    await getClient().execute({
      sql: `INSERT INTO categories (id, name, sort_order, created_at)
            VALUES (?, ?, ?, datetime('now'))`,
      args: [id, name, sortOrder],
    });
    return id;
  } catch {
    const unique = `${name} ·${id.slice(-3)}`;
    await getClient().execute({
      sql: `INSERT INTO categories (id, name, sort_order, created_at)
            VALUES (?, ?, ?, datetime('now'))`,
      args: [id, unique, sortOrder],
    });
    return id;
  }
}

function infoTypeId(): string {
  return `it_${newId().toLowerCase().slice(0, 16)}`;
}

function currentColor(
  list: TaxonomyItem[],
  itemId: string,
): TaxonomyAccentId | null {
  return list.find((row) => row.id === itemId)?.color ?? null;
}

export { isTaxonomyItemId };
