import { AppError } from "@/lib/errors";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionFail(error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message },
    };
  }
  return {
    ok: false,
    error: { code: "INTERNAL", message: "内部エラーが発生しました" },
  };
}
