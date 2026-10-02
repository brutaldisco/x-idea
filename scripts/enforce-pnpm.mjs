#!/usr/bin/env node
const ua = process.env.npm_config_user_agent ?? "";
if (!/\bpnpm\b/.test(ua)) {
  console.error(
    "このリポジトリは pnpm のみです。npm / yarn / bun では install できません。\n" +
      "  corepack enable && pnpm install",
  );
  process.exit(1);
}
