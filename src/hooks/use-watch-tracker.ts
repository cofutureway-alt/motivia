import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Params {
  userId: string | undefined;
  lessonId: string;
  courseId: string;
}

interface State {
  duration: number;
  watched: number;
  furthest: number;
  last: number;
  loaded: boolean;
}

/**
 * Tracks the ACTUAL time a lesson was watched.
 *
 * - `tick(currentTime, deltaSeconds)` is called only while the video is
 *   actively playing AND the tab is visible. `deltaSeconds` is the real
 *   wall-clock time elapsed since the previous tick, so pausing / seeking
 *   without playback contribute exactly 0 to the watched total.
 * - Percentage = watched / duration (capped at 100).
 * - `flush()` persists to the DB (debounced by caller).
 */
export function useWatchTracker({ userId, lessonId, courseId }: Params) {
  const stateRef = useRef<State>({
    duration: 0,
    watched: 0,
    furthest: 0,
    last: 0,
    loaded: false,
  });
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const onProgressRef = useRef<((pct: number) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    stateRef.current = { duration: 0, watched: 0, furthest: 0, last: 0, loaded: false };
    if (!userId || !lessonId) return;
    (async () => {
      const { data } = await supabase
        .from("lesson_watch_progress")
        .select("duration_seconds, watched_seconds, furthest_position_seconds, last_position_seconds")
        .eq("user_id", userId)
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (cancelled) return;
      stateRef.current = {
        duration: Number(data?.duration_seconds ?? 0),
        watched: Number(data?.watched_seconds ?? 0),
        furthest: Number(data?.furthest_position_seconds ?? 0),
        last: Number(data?.last_position_seconds ?? 0),
        loaded: true,
      };
      if (onProgressRef.current) {
        onProgressRef.current(computePct(stateRef.current));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, lessonId]);

  const setDuration = useCallback((d: number) => {
    if (!d || !isFinite(d)) return;
    if (Math.abs(stateRef.current.duration - d) > 0.5) {
      stateRef.current.duration = d;
      dirtyRef.current = true;
    }
  }, []);

  const tick = useCallback((currentTime: number, deltaSeconds: number) => {
    if (!deltaSeconds || deltaSeconds <= 0) return;
    // Cap delta to avoid huge jumps (tab hidden, wake from sleep, etc.)
    const delta = Math.min(deltaSeconds, 2);
    const s = stateRef.current;
    s.watched += delta;
    s.last = currentTime;
    if (currentTime > s.furthest) s.furthest = currentTime;
    dirtyRef.current = true;
    if (onProgressRef.current) onProgressRef.current(computePct(s));
  }, []);

  const setPosition = useCallback((currentTime: number) => {
    stateRef.current.last = currentTime;
    dirtyRef.current = true;
  }, []);

  const flush = useCallback(
    async (opts?: { keepalive?: boolean }) => {
      if (!userId || !dirtyRef.current || savingRef.current) return;
      const s = stateRef.current;
      if (!s.loaded) return;
      savingRef.current = true;
      const pct = computePct(s);
      const payload = {
        user_id: userId,
        lesson_id: lessonId,
        course_id: courseId,
        duration_seconds: Math.round(s.duration),
        watched_seconds: Math.round(s.watched),
        furthest_position_seconds: Math.round(s.furthest),
        last_position_seconds: Math.round(s.last),
        watch_percentage: pct,
      };
      dirtyRef.current = false;
      try {
        if (opts?.keepalive) {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/lesson_watch_progress?on_conflict=user_id,lesson_id`;
          const { data: sess } = await supabase.auth.getSession();
          const token = sess.session?.access_token;
          const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
          await fetch(url, {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              apikey: key,
              Authorization: `Bearer ${token ?? key}`,
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(payload),
          });
        } else {
          await supabase
            .from("lesson_watch_progress")
            .upsert(payload, { onConflict: "user_id,lesson_id" });
        }
      } catch {
        dirtyRef.current = true;
      } finally {
        savingRef.current = false;
      }
    },
    [userId, lessonId, courseId],
  );

  const onProgress = useCallback((cb: (pct: number) => void) => {
    onProgressRef.current = cb;
    if (stateRef.current.loaded) cb(computePct(stateRef.current));
  }, []);

  return { stateRef, setDuration, tick, setPosition, flush, onProgress };
}

function computePct(s: State) {
  if (!s.duration) return 0;
  return Math.min(100, Math.round((s.watched / s.duration) * 100));
}
