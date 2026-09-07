"use server";

import { revalidatePath } from "next/cache";
import { setDefaultXAccountId } from "@/server/settings";
import { setAccountContext } from "@/server/x/context";

export async function setAccountContextAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }
  await setAccountContext(id);
  revalidatePath("/", "layout");
}

export async function setDefaultXAccountAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }
  await setDefaultXAccountId(id);
  revalidatePath("/settings");
}
