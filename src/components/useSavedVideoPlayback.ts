"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveSavedVideoUrl } from "@/lib/play-saved-video";

export function useSavedVideoPlayback() {
  const [session, setSession] = useState<{ url: string; title: string } | null>(
    null,
  );
  const revokeRef = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    revokeRef.current?.();
    revokeRef.current = null;
  }, []);

  const play = useCallback(
    async (input: {
      mediaId: string;
      videoRelPath?: string | null;
      title: string;
    }) => {
      release();
      const resolved = await resolveSavedVideoUrl(input);
      revokeRef.current = resolved.revoke ?? null;
      setSession({ url: resolved.url, title: input.title });
    },
    [release],
  );

  const close = useCallback(() => {
    release();
    setSession(null);
  }, [release]);

  useEffect(() => release, [release]);

  return { session, play, close };
}
