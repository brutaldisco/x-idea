export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "LANE_COOLDOWN"
  | "LANE_CAP"
  | "X_DISABLED"
  | "CONFLICT"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly status: number;
  readonly retryAfter?: string;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { retryable?: boolean; status?: number; retryAfter?: string },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.status = options?.status ?? statusFor(code);
    this.retryAfter = options?.retryAfter;
  }
}

function statusFor(code: AppErrorCode): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "VALIDATION":
      return 400;
    case "RATE_LIMITED":
    case "LANE_COOLDOWN":
    case "LANE_CAP":
      return 429;
    case "X_DISABLED":
    case "CONFLICT":
      return 409;
    default:
      return 500;
  }
}

export function toErrorBody(error: unknown): {
  error: { code: string; message: string; retryable: boolean };
} {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      },
    };
  }
  return {
    error: {
      code: "INTERNAL",
      message: "内部エラーが発生しました",
      retryable: true,
    },
  };
}
