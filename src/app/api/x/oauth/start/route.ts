import { cookies } from "next/headers";
import { connection } from "next/server";
import { isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  countXAccounts,
  isLinkedUsername,
  MAX_X_ACCOUNTS,
  saveXAccount,
} from "@/server/x/account";
import {
  appUrl,
  beginOauth,
  normalizeXHint,
  OAUTH_COOKIE,
  safeNextPath,
  withQuery,
} from "@/server/x/oauth";

export const instant = false;

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const next = safeNextPath(
    url.searchParams.get("next") ?? "/onboarding?step=3",
  );
  const hint = normalizeXHint(url.searchParams.get("hint"));
  const forceLogin =
    url.searchParams.get("force_login") === "1" ||
    url.searchParams.get("force_login") === "true";

  try {
    if (isDbConfigured()) {
      await ensureSchema();
    }
    if (forceLogin && !hint) {
      return Response.redirect(`${appUrl()}${withQuery(next, "x", "hint")}`);
    }
    if (hint && (await isLinkedUsername(hint))) {
      return Response.redirect(`${appUrl()}${withQuery(next, "x", "same")}`);
    }
    if (process.env.MOCK_EXTERNAL === "1") {
      const count = await countXAccounts();
      await saveXAccount(
        {
          id: `mock-user-${hint ?? count + 1}`,
          username: hint ?? `mock${count + 1}`,
          name: hint ?? `Mock User ${count + 1}`,
        },
        {
          access_token: "mock-access",
          refresh_token: "mock-refresh",
          expires_in: 7200,
          scope: "bookmark.read tweet.read users.read offline.access",
        },
      );
      return Response.redirect(`${appUrl()}${next}`);
    }
    if ((await countXAccounts()) >= MAX_X_ACCOUNTS) {
      return Response.redirect(`${appUrl()}${withQuery(next, "x", "limit")}`);
    }
    const { url: oauthUrl, cookie } = beginOauth({
      forceLogin,
      screenName: hint ?? undefined,
      intent: forceLogin ? "add" : "link",
      next,
    });
    const jar = await cookies();
    jar.set(OAUTH_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return Response.redirect(oauthUrl);
  } catch (error) {
    if (error instanceof Error && error.message.includes("X_CLIENT_ID")) {
      return Response.redirect(`${appUrl()}/settings?x=missing`);
    }
    return Response.json(
      toErrorBody(error instanceof AppError ? error : new Error(String(error))),
      {
        status: 500,
      },
    );
  }
}
