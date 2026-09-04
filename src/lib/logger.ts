import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "access_token",
      "refresh_token",
      "token",
      "CRON_SECRET",
      "TURSO_AUTH_TOKEN",
      "GEMINI_API_KEY",
      "X_CLIENT_SECRET",
    ],
    remove: true,
  },
});
