import { useEffect, useMemo, useRef, useState } from "react";
// @ts-ignore – plyr ships CJS with a default export at runtime
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronsLeft, ChevronsRight, PlayCircle } from "lucide-react";
import { parseVideoUrl, type VideoProvider } from "@/lib/video";
import { useAuth } from "@/contexts/AuthContext";
import { useWatchTracker } from "@/hooks/use-watch-tracker";
import Watermark from "./Watermark";
import { DEFAULT_PLAYER_SETTINGS, type VideoPlayerSettings } from "@/hooks/use-player-settings";

interface Props {
  lessonId: string;
  courseId: string;
  title: string;
  provider: VideoProvider | null;
  videoUrl: string | null;
  settings?: VideoPlayerSettings;
  onProgress?: (pct: number) => void;
  paused?: boolean;
}

export const LessonVideoPlayer = ({
  lessonId,
  courseId,
  title,
  provider,
  videoUrl,
  settings: settingsProp,
  onProgress,
  paused,
}: Props) => {
  const settings = settingsProp ?? DEFAULT_PLAYER_SETTINGS;
  const { user, profile } = useAuth();
  const parsed = useMemo(() => {
    if (!provider || !videoUrl) return null;
    const p = parseVideoUrl(provider, videoUrl);
    if ("error" in p) return null;
    return p;
  }, [provider, videoUrl]);

  const isBunny = parsed?.provider === "bunny";
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const plyrRef = useRef<Plyr | null>(null);
  const tracker = useWatchTracker({ userId: user?.id, lessonId, courseId });

  // Externally-triggered pause (e.g. when file viewer opens on the lesson page)
  useEffect(() => {
    if (!paused) return;
    try {
      plyrRef.current?.pause();
    } catch {
      /* noop */
    }
    if (isBunny && iframeRef.current) {
      try {
        iframeRef.current.contentWindow?.postMessage(
          '{"method":"pause"}',
          "*",
        );
      } catch {
        /* noop */
      }
    }
  }, [paused, isBunny]);

  const [seekHint, setSeekHint] = useState<null | "forward" | "backward">(null);
  const seekHintTimer = useRef<number | null>(null);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (onProgress) tracker.onProgress(onProgress);
  }, [onProgress, tracker]);

  const showSeekHint = (dir: "forward" | "backward") => {
    setSeekHint(dir);
    if (seekHintTimer.current) window.clearTimeout(seekHintTimer.current);
    seekHintTimer.current = window.setTimeout(() => setSeekHint(null), 550);
  };

  // Manual seek helper — respected by keyboard + double-tap
  const seekBy = (deltaSec: number) => {
    const player = plyrRef.current;
    if (!player) return;
    const cur = player.currentTime || 0;
    const dur = player.duration || Infinity;
    const target = Math.max(0, Math.min(dur - 0.5, cur + deltaSec));
    try {
      player.currentTime = target;
    } catch {
      /* noop */
    }
    showSeekHint(deltaSec > 0 ? "forward" : "backward");
  };

  // Setup Plyr for YT / Vimeo
  useEffect(() => {
    if (!parsed || isBunny || !videoRef.current) return;

    const el = document.createElement("div");
    el.setAttribute("data-plyr-provider", parsed.provider);
    el.setAttribute("data-plyr-embed-id", parsed.id);
    videoRef.current.innerHTML = "";
    videoRef.current.appendChild(el);

    const speeds = settingsRef.current.speed_control_enabled
      ? [1, ...settingsRef.current.allowed_speeds].filter(
        (v, i, a) => a.indexOf(v) === i,
      )
      : [1];

    const controls = [
      "play-large",
      "play",
      "progress",
      "current-time",
      "duration",
      "mute",
      "volume",
      "pip",
      "airplay",
      "fullscreen",
    ];
    if (settingsRef.current.speed_control_enabled) controls.splice(-3, 0, "settings");

    const player = new Plyr(el, {
      controls,
      settings: settingsRef.current.speed_control_enabled ? ["quality", "speed"] : [],
      speed: { selected: 1, options: speeds },
      seekTime: settingsRef.current.seek_forward_seconds || 10,
      keyboard: { focused: true, global: true },
      youtube: {
        noCookie: true,
        rel: 0,
        showinfo: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        customControls: true,
        playsinline: 1,
      },
      ratio: "16:9",
    });
    plyrRef.current = player;

    let tickTimer: number | null = null;
    let lastTickTs = 0;
    const startTicking = () => {
      if (tickTimer) return;
      lastTickTs = performance.now();
      tickTimer = window.setInterval(() => {
        if (document.hidden) return;
        const now = performance.now();
        const delta = (now - lastTickTs) / 1000;
        lastTickTs = now;
        try {
          tracker.tick(player.currentTime || 0, delta);
        } catch {
          /* noop */
        }
      }, 1000);
    };
    const stopTicking = () => {
      if (tickTimer) {
        window.clearInterval(tickTimer);
        tickTimer = null;
      }
    };

    const onReady = () => {
      const d = player.duration;
      if (d) tracker.setDuration(d);
      const last = tracker.stateRef.current.last;
      if (last > 2 && d && last < d - 3) {
        try {
          player.currentTime = last;
        } catch {
          /* noop */
        }
      }
    };
    const onLoaded = () => {
      if (player.duration) tracker.setDuration(player.duration);
    };
    const onPlay = () => startTicking();
    const onPause = () => {
      stopTicking();
      tracker.flush();
    };
    const onEnded = () => {
      stopTicking();
      tracker.flush();
    };
    const onSeeked = () => {
      tracker.setPosition(player.currentTime || 0);
    };

    player.on("ready", onReady);
    player.on("loadedmetadata", onLoaded);
    player.on("play", onPlay);
    player.on("pause", onPause);
    player.on("ended", onEnded);
    player.on("seeked", onSeeked);

    const saveTimer = window.setInterval(() => tracker.flush(), 8000);

    const onVisibility = () => {
      if (document.hidden) {
        stopTicking();
        tracker.flush();
      } else if (!player.paused) {
        startTicking();
      }
    };
    const onBeforeUnload = () => tracker.flush({ keepalive: true });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onBeforeUnload);

    return () => {
      stopTicking();
      window.clearInterval(saveTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onBeforeUnload);
      tracker.flush();
      try {
        player.destroy();
      } catch {
        /* noop */
      }
      plyrRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.provider, parsed?.id, isBunny, lessonId]);

  // Keyboard shortcuts: Left/Right arrows seek by configured amount.
  // (Overrides Plyr's default 5s step to match admin settings.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!plyrRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(settingsRef.current.seek_forward_seconds || 10);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-(settingsRef.current.seek_backward_seconds || 10));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Double-tap seek gesture (mobile & desktop)
  useEffect(() => {
    if (isBunny) return;
    if (!settings.double_tap_seek_enabled) return;
    const el = shellRef.current;
    if (!el) return;

    let lastTap = 0;
    let lastX = 0;
    const DBL_MS = 320;

    const handleTap = (clientX: number, target: EventTarget | null) => {
      if (target instanceof HTMLElement && target.closest(".plyr__controls, .plyr__control")) {
        return false;
      }
      const now = Date.now();
      if (now - lastTap < DBL_MS && Math.abs(clientX - lastX) < 60) {
        const rect = el.getBoundingClientRect();
        const isRight = clientX - rect.left > rect.width / 2;
        if (isRight) {
          seekBy(settingsRef.current.seek_forward_seconds);
        } else {
          seekBy(-settingsRef.current.seek_backward_seconds);
        }
        lastTap = 0;
        return true;
      }
      lastTap = now;
      lastX = clientX;
      return false;
    };

    const onClick = (e: MouseEvent) => {
      if (handleTap(e.clientX, e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("click", onClick, true);
    };
  }, [isBunny, settings.double_tap_seek_enabled, settings.seek_forward_seconds, settings.seek_backward_seconds]);

  // Bunny fallback flush
  useEffect(() => {
    if (!isBunny) return;
    const onUnload = () => tracker.flush({ keepalive: true });
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      tracker.flush();
    };
  }, [isBunny, tracker]);

  const watermarkText = (() => {
    const parts: string[] = [];
    if (settings.watermark_show_name && profile?.full_name) parts.push(profile.full_name);
    if (settings.watermark_show_email && user?.email) parts.push(user.email);
    return parts.join(" · ") || user?.email || "";
  })();

  if (!parsed) {
    return (
      <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-border shadow-lg flex flex-col items-center justify-center text-muted-foreground gap-2">
        <PlayCircle className="w-14 h-14 opacity-30" />
        <div className="text-sm">لا يوجد فيديو صالح لهذا الدرس بعد.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        ref={shellRef}
        className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-border shadow-lg select-none"
        dir="ltr"
      >
        {isBunny ? (
          <iframe
            ref={iframeRef}
            src={parsed.url}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            title={title}
          />
        ) : (
          <div ref={videoRef} className="plyr-shell w-full h-full" />
        )}

        <Watermark
          text={watermarkText}
          color={settings.watermark_color}
          opacity={settings.watermark_opacity}
          speedSeconds={settings.watermark_speed_seconds}
        />

        <AnimatePresence>
          {seekHint && (
            <motion.div
              key={seekHint}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.18 }}
              className={`absolute top-1/2 -translate-y-1/2 pointer-events-none z-30 flex items-center gap-1 px-4 py-3 rounded-full bg-black/60 text-white text-sm font-bold ${seekHint === "forward" ? "right-8" : "left-8"
                }`}
            >
              {seekHint === "forward" ? (
                <>
                  <ChevronsRight className="w-5 h-5" />
                  {settings.seek_forward_seconds}s
                </>
              ) : (
                <>
                  {settings.seek_backward_seconds}s
                  <ChevronsLeft className="w-5 h-5" />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LessonVideoPlayer;
