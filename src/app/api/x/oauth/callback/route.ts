import { cookies } from "next/headers";
import { connection } from "next/server";
import { ensureSchema } from "@/db/ensure";
import { toErrorBody } from "@/lib/errors";
import { saveXAccount } from "@/server/x/account";
import {
  allowedOauthOrigins,
  decryptPayload,
  exchangeCode,
  fetchMe,
  OAUTH_COOKIE,
  safeNextPath,
  withQuery,
} from "@/server/x/oauth";

export const instant = false;

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  if (denied) {
    return Response.redirect(`${url.origin}/settings?x=denied`);
  }

  const jar = await cookies();
  const payload = decryptPayload(jar.get(OAUTH_COOKIE)?.value);
  jar.delete(OAUTH_COOKIE);

  if (!code || !state || !payload || payload.state !== state) {
    const origin = url.origin;
    return Response.redirect(`${origin}/settings?x=oauth`);
  }

  try {
    await ensureSchema();
    const tokens = await exchangeCode(
      code,
      payload.verifier,
      payload.redirectUri,
    );
    const me = await fetchMe(tokens.access_token);
    const saved = await saveXAccount(me, tokens);
    const next = safeNextPath(payload.next ?? "/onboarding?step=3");
    const fromPayload = payload.redirectUri
      ? new URL(payload.redirectUri).origin
      : url.origin;
    const home = allowedOauthOrigins().has(fromPayload)
      ? fromPayload
      : url.origin;
    if (!saved.created && payload.intent === "add") {
      return Response.redirect(`${home}${withQuery(next, "x", "same")}`);
    }
    return Response.redirect(`${home}${next}`);
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
