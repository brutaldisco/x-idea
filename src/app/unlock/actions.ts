"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { gateCookieName, passcodeOk, signGate } from "@/lib/gate";

export async function unlockAction(formData: FormData) {
  const code = String(formData.get("passcode") ?? "");
  const next = String(formData.get("next") ?? "/today");
  if (!passcodeOk(code)) {
    redirect(`/unlock?next=${encodeURIComponent(next)}&error=1`);
  }
  const jar = await cookies();
  jar.set(gateCookieName(), await signGate(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith("/") ? next : "/today");
}
