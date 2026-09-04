import { describe, expect, it } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
  it("returns on first success", async () => {
    const value = await withRetry(async () => 7, { attempts: 3, baseMs: 1 });
    expect(value).toBe(7);
  });

  it("retries then succeeds", async () => {
    let n = 0;
    const value = await withRetry(
      async () => {
        n += 1;
        if (n < 3) {
          throw new Error("fail");
        }
        return "ok";
      },
      { attempts: 3, baseMs: 1 },
    );
    expect(value).toBe("ok");
    expect(n).toBe(3);
  });

  it("stops when retryOn is false", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n += 1;
          throw Object.assign(new Error("no"), { status: 400 });
        },
        { attempts: 3, baseMs: 1, retryOn: (e) => defaultStatus(e) >= 500 },
      ),
    ).rejects.toThrow("no");
    expect(n).toBe(1);
  });
});

function defaultStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    return Number((error as { status: number }).status);
  }
  return 500;
}
