export async function readAskSse(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: unknown) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";
    for (const block of blocks) {
      for (const line of block.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") {
          continue;
        }
        try {
          onChunk(JSON.parse(data) as unknown);
        } catch {
          // 途中行は次のチャンクで揃う
        }
      }
    }
  }
}

export function formatAskReset(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return null;
  }
  return new Date(at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
