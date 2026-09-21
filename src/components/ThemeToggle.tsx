"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  applyLibraryWide,
  getLibraryWideServerSnapshot,
  readLibraryWide,
  subscribeLibraryWide,
} from "@/lib/library-layout";
import { applyTheme, readTheme, type ThemeMode } from "@/lib/theme";

function SettingsSwitch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? "bg-ink" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-paper transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("light");
  const libraryWide = useSyncExternalStore(
    subscribeLibraryWide,
    readLibraryWide,
    getLibraryWideServerSnapshot,
  );

  useEffect(() => {
    setMode(readTheme());
  }, []);

  const dark = mode === "dark";

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <h2 className="font-semibold">表示</h2>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-sm">
          ダークモード
          <span className="ml-2 text-ink-2 text-xs">{dark ? "ON" : "OFF"}</span>
          <span className="mt-1 block text-ink-2 text-xs">
            ライトとダークを切り替えます。この端末に保存されます。
          </span>
        </span>
        <SettingsSwitch
          checked={dark}
          label="ダークモード"
          onChange={(next) => {
            const theme: ThemeMode = next ? "dark" : "light";
            applyTheme(theme);
            setMode(theme);
          }}
        />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-line border-t pt-4">
        <span className="text-sm">
          Library / Videos を広く（最大5列）
          <span className="ml-2 text-ink-2 text-xs">
            {libraryWide ? "ON" : "OFF"}
          </span>
          <span className="mt-1 block text-ink-2 text-xs">
            カード幅は 3 列のまま、画面幅に応じて最大 5 列（入らなければ 4
            列）表示します。
          </span>
        </span>
        <SettingsSwitch
          checked={libraryWide}
          label="Library / Videos を広く（最大5列）"
          onChange={applyLibraryWide}
        />
      </div>
    </article>
  );
}
