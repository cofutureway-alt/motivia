import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VideoPlayerSettings {
  double_tap_seek_enabled: boolean;
  seek_forward_seconds: number;
  seek_backward_seconds: number;
  speed_control_enabled: boolean;
  allowed_speeds: number[];
  completion_gate_enabled: boolean;
  completion_required_percentage: number;
  watermark_color: string;
  watermark_show_email: boolean;
  watermark_show_name: boolean;
  watermark_speed_seconds: number;
  watermark_opacity: number;
}

export const DEFAULT_PLAYER_SETTINGS: VideoPlayerSettings = {
  double_tap_seek_enabled: true,
  seek_forward_seconds: 10,
  seek_backward_seconds: 10,
  speed_control_enabled: true,
  allowed_speeds: [1.25, 1.5, 2],
  completion_gate_enabled: false,
  completion_required_percentage: 90,
  watermark_color: "#ffffff",
  watermark_show_email: true,
  watermark_show_name: false,
  watermark_speed_seconds: 22,
  watermark_opacity: 0.35,
};

function normalize(row: any): VideoPlayerSettings {
  if (!row) return DEFAULT_PLAYER_SETTINGS;
  return {
    ...DEFAULT_PLAYER_SETTINGS,
    ...row,
    allowed_speeds: Array.isArray(row.allowed_speeds)
      ? row.allowed_speeds.map((n: any) => Number(n))
      : DEFAULT_PLAYER_SETTINGS.allowed_speeds,
    watermark_opacity: Number(row.watermark_opacity ?? DEFAULT_PLAYER_SETTINGS.watermark_opacity),
  };
}

export function usePlayerSettings() {
  const [settings, setSettings] = useState<VideoPlayerSettings>(DEFAULT_PLAYER_SETTINGS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("video_player_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    setSettings(normalize(data));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { settings, setSettings, loading, reload: load };
}
