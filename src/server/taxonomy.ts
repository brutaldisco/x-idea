import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { SEED_CATEGORIES } from "@/db/seed";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { isTaxonomyItemId } from "@/lib/taxonomy-id";
import { INFO_TYPE_LABELS, INFO_TYPES } from "@/server/ai/info-types";
import { listXAccounts } from "@/server/x/account";

export const TAXONOMY_KINDS = ["category", "info_type"] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export type TaxonomyItem = {
  id: string;
  name: string;
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
    })),
    infoTypes: INFO_TYPES.map((id) => ({
      id,
      name: INFO_TYPE_LABELS[id],
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
  const itemId =
    input.kind === "category"
      ? await insertCategory(name, sortOrder)
      : infoTypeId();
  await getClient().execute({
    sql: `INSERT INTO account_taxonomy
            (id, x_account_id, kind, item_id, name, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [newId(), input.accountId, input.kind, itemId, name, sortOrder],
  });
  return { id: itemId, name };
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
  return { id: input.itemId, name };
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

export async function taxonomyForAccount(
  accountId: string | null,
): Promise<AccountTaxonomy> {
  if (!accountId) {
    return defaultAccountTaxonomy();
  }
  return getAccountTaxonomy(accountId);
}

async function ensureAccountTaxonomy(accountId: string): Promise<void> {
  const existing = await getClient().execute({
    sql: `SELECT id FROM account_taxonomy WHERE x_account_id = ? LIMIT 1`,
    args: [accountId],
  });
  if (existing.rows[0]) {
    return;
  }
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
    sql: `SELECT kind, item_id, name
          FROM account_taxonomy
          WHERE x_account_id = ?
          ORDER BY kind, sort_order, name
          LIMIT 80`,
    args: [accountId],
  });
  const categories: TaxonomyItem[] = [];
  const infoTypes: TaxonomyItem[] = [];
  for (const row of result.rows) {
    const item = { id: String(row.item_id), name: String(row.name) };
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

export { isTaxonomyItemId };
