"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadVideoRoot,
  peekVideoRoot,
  pickVideoRoot,
  supportsDirectoryPicker,
} from "@/lib/video-store";

const CHANGED = "x-idea:video-save-folder";

type FolderState = {
  accountId: string;
  folderName: string | null;
  linked: boolean;
};

export function useVideoSaveFolder(
  accountId: string | null,
  initialFolderName?: string | null,
): {
  supported: boolean | null;
  folderName: string | null;
  linked: boolean;
  persistWarning: string | null;
  linkFolder: () => Promise<void>;
} {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [folderName, setFolderName] = useState<string | null>(
    peekVideoRoot(accountId)?.name ?? initialFolderName ?? null,
  );
  const [linked, setLinked] = useState(() =>
    Boolean(accountId && peekVideoRoot(accountId)),
  );
  const [persistWarning, setPersistWarning] = useState<string | null>(null);
  const genRef = useRef(0);

  useEffect(() => {
    setSupported(supportsDirectoryPicker());
  }, []);

  useEffect(() => {
    setFolderName(peekVideoRoot(accountId)?.name ?? initialFolderName ?? null);
    setLinked(Boolean(accountId && peekVideoRoot(accountId)));
    setPersistWarning(null);
  }, [accountId, initialFolderName]);

  useEffect(() => {
    const gen = ++genRef.current;
    let cancelled = false;
    if (!accountId) {
      setFolderName(initialFolderName ?? null);
      setLinked(false);
      return;
    }
    void (async () => {
      const [saved, handle] = await Promise.all([
        fetch("/api/settings/video-folder", { cache: "no-store" })
          .then((res) =>
            res.ok
              ? (res.json() as Promise<{
                  accountId?: string | null;
                  folderName?: string | null;
                }>)
              : null,
          )
          .catch(() => null),
        loadVideoRoot(accountId),
      ]);
      if (cancelled || gen !== genRef.current) {
        return;
      }
      const name =
        saved?.accountId === accountId
          ? (saved.folderName ?? handle?.name ?? initialFolderName ?? null)
          : (handle?.name ?? initialFolderName ?? null);
      setFolderName(name);
      setLinked(Boolean(handle ?? peekVideoRoot(accountId)));
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, initialFolderName]);

  useEffect(() => {
    function onChanged(event: Event) {
      const detail = (event as CustomEvent<FolderState>).detail;
      if (!detail || detail.accountId !== accountId) {
        return;
      }
      genRef.current += 1;
      setFolderName(detail.folderName);
      setLinked(detail.linked);
    }
    window.addEventListener(CHANGED, onChanged);
    return () => window.removeEventListener(CHANGED, onChanged);
  }, [accountId]);

  const linkFolder = useCallback(async () => {
    if (!accountId) {
      throw new Error("アカウントを選んでください");
    }
    const { handle, persisted } = await pickVideoRoot(accountId);
    genRef.current += 1;
    setFolderName(handle.name);
    setLinked(true);
    setPersistWarning(
      persisted
        ? null
        : "このプレビューではフォルダを保持できません。再読み込みすると外れます。保存と再生は Chrome / Edge で開いてください。",
    );
    window.dispatchEvent(
      new CustomEvent<FolderState>(CHANGED, {
        detail: { accountId, folderName: handle.name, linked: true },
      }),
    );
    const res = await fetch("/api/settings/video-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: handle.name }),
    });
    if (!res.ok) {
      throw new Error(
        "このブラウザではリンク済みです。フォルダ名の共有に失敗したので、もう一度選んでください",
      );
    }
  }, [accountId]);

  return { supported, folderName, linked, persistWarning, linkFolder };
}
