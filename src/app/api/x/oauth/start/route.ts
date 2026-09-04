import { cookies } from "next/headers";
import { connection } from "next/server";
import { isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  countXAccounts,
  MAX_X_ACCOUNTS,
  saveXAccount,
} from "@/server/x/account";
import { appUrl, beginOauth, OAUTH_COOKIE } from "@/server/x/oauth";

export const instant = false;

export async function GET() {
  await connection();
  try {
    if (isDbConfigured()) {
      await ensureSchema();
    }
    if (process.env.MOCK_EXTERNAL === "1") {
      const count = await countXAccounts();
      await saveXAccount(
        {
          id: `mock-user-${count + 1}`,
          username: `mock${count + 1}`,
          name: `Mock User ${count + 1}`,
        },
        {
          access_token: "mock-access",
          refresh_token: "mock-refresh",
          expires_in: 7200,
          scope: "bookmark.read tweet.read users.read offline.access",
        },
      );
      return Response.redirect(`${appUrl()}/onboarding?step=3`);
    }
    if ((await countXAccounts()) >= MAX_X_ACCOUNTS) {
      return Response.redirect(`${appUrl()}/settings?x=limit`);
    }
    const { url, cookie } = beginOauth();
    const jar = await cookies();
    jar.set(OAUTH_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return Response.redirect(url);
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
