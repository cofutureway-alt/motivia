import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface QrDisplaySettings {
  show_full_name: boolean;
  show_avatar: boolean;
  show_student_id: boolean;
  show_stage: boolean;
  show_phone: boolean;
  show_enrolled_courses_count: boolean;
  show_enrolled_courses_list: boolean;
  show_quiz_stats: boolean;
  show_quiz_attempts_list: boolean;
  show_weak_subjects: boolean;
  show_weak_courses: boolean;
  show_assignment_stats: boolean;
}

export const DEFAULT_QR_SETTINGS: QrDisplaySettings = {
  show_full_name: true,
  show_avatar: true,
  show_student_id: true,
  show_stage: true,
  show_phone: false,
  show_enrolled_courses_count: true,
  show_enrolled_courses_list: true,
  show_quiz_stats: true,
  show_quiz_attempts_list: true,
  show_weak_subjects: true,
  show_weak_courses: true,
  show_assignment_stats: true,
};

export function useQrSettings() {
  const [settings, setSettings] = useState<QrDisplaySettings>(DEFAULT_QR_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await (supabase as any)
        .from("qr_display_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (!alive) return;
      if (data) setSettings(data as QrDisplaySettings);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { settings, setSettings, loading };
}
