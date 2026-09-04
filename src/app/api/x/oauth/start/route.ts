import { cookies } from "next/headers";
import { connection } from "next/server";
import { isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { AppError, toErrorBody } from "@/lib/errors";
import { saveXAccount } from "@/server/x/account";
import { appUrl, beginOauth, OAUTH_COOKIE } from "@/server/x/oauth";

export const instant = false;

export async function GET() {
  await connection();
  try {
    if (isDbConfigured()) {
      await ensureSchema();
    }
    if (process.env.MOCK_EXTERNAL === "1") {
      await saveXAccount(
        { id: "mock-user", username: "mock", name: "Mock User" },
        {
          access_token: "mock-access",
          refresh_token: "mock-refresh",
          expires_in: 7200,
          scope: "bookmark.read tweet.read users.read offline.access",
        },
      );
      return Response.redirect(`${appUrl()}/onboarding?step=3`);
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
