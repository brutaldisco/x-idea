import { describe, expect, it } from "vitest";
import {
  packReaderLinesForTranslate,
  readerLineGapEm,
  splitReadableLines,
  splitReaderLines,
  splitReaderSentences,
} from "./reader-paragraphs";

function fields(text: string) {
  return splitReaderLines(text).map(({ text: line, breakBefore, bullet }) => ({
    text: line,
    breakBefore,
    bullet,
  }));
}

describe("splitReaderLines", () => {
  it("returns an empty list for blank input", () => {
    expect(splitReaderLines("")).toEqual([]);
    expect(splitReaderLines("  \n\n  ")).toEqual([]);
  });

  it("treats one sentence per line as separate paragraphs", () => {
    expect(
      fields(
        "一覧に載っているのは英語一行の説明だけです。\n単語だけでも通ります。",
      ),
    ).toEqual([
      {
        text: "一覧に載っているのは英語一行の説明だけです。",
        breakBefore: false,
        bullet: false,
      },
      {
        text: "単語だけでも通ります。",
        breakBefore: false,
        bullet: false,
      },
    ]);
  });

  it("collapses blank lines and marks the next paragraph", () => {
    expect(fields("前の段落。\n\n\n次の段落。\n")).toEqual([
      { text: "前の段落。", breakBefore: false, bullet: false },
      { text: "次の段落。", breakBefore: true, bullet: false },
    ]);
  });

  it("normalizes CRLF and drops trailing spaces", () => {
    expect(fields("一行目。  \r\n二行目。\r")).toEqual([
      { text: "一行目。", breakBefore: false, bullet: false },
      { text: "二行目。", breakBefore: false, bullet: false },
    ]);
  });

  it("keeps a unique offset for each line", () => {
    expect(splitReaderLines("前。\n\n後。").map((line) => line.offset)).toEqual(
      [0, 4],
    );
  });

  it("marks bullets and numbered lines", () => {
    const lines = splitReaderLines(
      "- ダッシュ\n* アスタリスク\n・ 中黒\n1. 番号\n(2) 括弧\n① 丸数字\n本文。",
    );
    expect(lines.map((line) => [line.text, line.bullet])).toEqual([
      ["- ダッシュ", true],
      ["* アスタリスク", true],
      ["・ 中黒", true],
      ["1. 番号", true],
      ["(2) 括弧", true],
      ["① 丸数字", true],
      ["本文。", false],
    ]);
  });

  it("does not treat a number without a following space as a bullet", () => {
    expect(splitReaderLines("1.本文")[0]?.bullet).toBe(false);
  });
});

describe("readerLineGapEm", () => {
  const body = {
    text: "本文",
    offset: 0,
    breakBefore: false,
    bullet: false,
  };
  const section = {
    text: "区切りのあと",
    offset: 3,
    breakBefore: true,
    bullet: false,
  };
  const bullet = {
    text: "- 項目",
    offset: 10,
    breakBefore: false,
    bullet: true,
  };

  it("uses no gap for the first line", () => {
    expect(readerLineGapEm(body, undefined)).toBe(0);
  });

  it("uses a larger gap after a blank line", () => {
    expect(readerLineGapEm(section, body)).toBe(1.8);
  });

  it("tightens consecutive bullets", () => {
    expect(readerLineGapEm(bullet, bullet)).toBe(0.2);
  });

  it("uses a paragraph gap between ordinary lines", () => {
    expect(readerLineGapEm(body, body)).toBe(0.8);
    expect(readerLineGapEm(body, bullet)).toBe(0.8);
  });
});

describe("splitReaderSentences", () => {
  it("splits a wall of Japanese on sentence endings", () => {
    const text =
      "Hermes Bottingsで一つのメディア会社を構築する方法を提供する6つのボットのチームを構築しました。ほとんどの人はAIを使ってより書き込みます。これ役に立ちますが、書き込みはもはやボトルネックではありません。";
    expect(splitReaderSentences(text).map((line) => line.text)).toEqual([
      "Hermes Bottingsで一つのメディア会社を構築する方法を提供する6つのボットのチームを構築しました。",
      "ほとんどの人はAIを使ってより書き込みます。",
      "これ役に立ちますが、書き込みはもはやボトルネックではありません。",
    ]);
  });

  it("keeps trailing text without a terminator", () => {
    expect(
      splitReaderSentences("前の文です。続きは句点なし").map(
        (line) => line.text,
      ),
    ).toEqual(["前の文です。", "続きは句点なし"]);
  });

  it("treats ！ and ？ as endings", () => {
    expect(
      splitReaderSentences("本当ですか？はい、そうです！").map(
        (line) => line.text,
      ),
    ).toEqual(["本当ですか？", "はい、そうです！"]);
  });
});

describe("splitReadableLines", () => {
  it("keeps short newline paragraphs as-is", () => {
    expect(
      splitReadableLines("短い一行です。\nもう一行です。").map(
        (line) => line.text,
      ),
    ).toEqual(["短い一行です。", "もう一行です。"]);
  });

  it("explodes a long translated blob without newlines", () => {
    const text =
      "難しいのは、一貫してカバーする価値のあるアイデアを見つけ、独自の角度を開発し、5つのプラットフォームに同じサイクルポストを公開せずにそれぞれを配布することです。私自身のコンテンツプロセスから最も強力な調査、パッケージ、証拠、および配布パターンについてシステムをトレーニングし、共有黒板のグラフに保存しました。";
    expect(splitReadableLines(text).map((line) => line.text)).toEqual([
      "難しいのは、一貫してカバーする価値のあるアイデアを見つけ、独自の角度を開発し、5つのプラットフォームに同じサイクルポストを公開せずにそれぞれを配布することです。",
      "私自身のコンテンツプロセスから最も強力な調査、パッケージ、証拠、および配布パターンについてシステムをトレーニングし、共有黒板のグラフに保存しました。",
    ]);
  });

  it("keeps a section break on the first sentence of a long line", () => {
    const long =
      "難しいのは、一貫してカバーする価値のあるアイデアを見つけ、独自の角度を開発し、5つのプラットフォームに同じサイクルポストを公開せずにそれぞれを配布することです。次の文も十分に長くして句点分割の対象にします。";
    const lines = splitReadableLines(`前の段落。\n\n${long}`);
    expect(lines.map((line) => [line.breakBefore, line.text[0]])).toEqual([
      [false, "前"],
      [true, "難"],
      [false, "次"],
    ]);
  });
});

describe("packReaderLinesForTranslate", () => {
  it("inserts blank lines so the translator can keep paragraphs", () => {
    expect(packReaderLinesForTranslate("一行目。\n二行目。")).toBe(
      "一行目。\n\n二行目。",
    );
    expect(packReaderLinesForTranslate("前。\n\n後。")).toBe("前。\n\n\n後。");
  });
});
