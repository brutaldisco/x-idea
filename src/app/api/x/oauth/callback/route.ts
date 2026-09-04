import { cookies } from "next/headers";
import { connection } from "next/server";
import { ensureSchema } from "@/db/ensure";
import { AppError, toErrorBody } from "@/lib/errors";
import { saveXAccount } from "@/server/x/account";
import {
  appUrl,
  decryptPayload,
  exchangeCode,
  fetchMe,
  OAUTH_COOKIE,
} from "@/server/x/oauth";

export const instant = false;

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  if (denied) {
    return Response.redirect(`${appUrl()}/settings?x=denied`);
  }

  const jar = await cookies();
  const payload = decryptPayload(jar.get(OAUTH_COOKIE)?.value);
  jar.delete(OAUTH_COOKIE);

  if (!code || !state || !payload || payload.state !== state) {
    return Response.json(
      toErrorBody(new AppError("UNAUTHORIZED", "OAuth state が不正です")),
      {
        status: 401,
      },
    );
  }

  try {
    await ensureSchema();
    const tokens = await exchangeCode(code, payload.verifier);
    const me = await fetchMe(tokens.access_token);
    await saveXAccount(me, tokens);
    return Response.redirect(`${appUrl()}/onboarding?step=3`);
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
