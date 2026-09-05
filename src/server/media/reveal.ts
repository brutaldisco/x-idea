import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import {
  accountMediaDir,
  isLocalMediaEnabled,
  mediaRoot,
} from "@/server/media/paths";
import { listXAccounts } from "@/server/x/account";

const execFileAsync = promisify(execFile);

export async function resolveRevealPath(
  accountId?: string | null,
): Promise<string> {
  if (!accountId) {
    return mediaRoot();
  }
  const accounts = await listXAccounts();
  if (!accounts.some((account) => account.id === accountId)) {
    throw new Error("account not found");
  }
  return accountMediaDir(accountId);
}

export async function revealMediaFolder(
  accountId?: string | null,
): Promise<string> {
  if (!isLocalMediaEnabled()) {
    throw new Error("local media disabled");
  }
  const abs = await resolveRevealPath(accountId);
  await mkdir(abs, { recursive: true });
  if (process.platform === "darwin") {
    await execFileAsync("open", [abs]);
  } else if (process.platform === "win32") {
    await execFileAsync("explorer", [abs]).catch(() => undefined);
  } else {
    await execFileAsync("xdg-open", [abs]);
  }
  return abs;
}
