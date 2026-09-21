import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SocialLink {
  platform: string;
  url: string;
}

export interface PlatformSettings {
  logo_light_url: string | null;
  logo_dark_url: string | null;
  social_links: SocialLink[];
  hero_headline: string | null;
  hero_subtext: string | null;
  hero_cta_label: string | null;
  hero_cta_url: string | null;
  /** Students only see courses assigned to their grade (when signup form has stage_id). */
  grade_lock_enabled?: boolean | null;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  logo_light_url: null,
  logo_dark_url: null,
  social_links: [],
  hero_headline: "رحلتك في العلم\nتبدأ من هنا",
  hero_subtext:
    "دروس منظّمة، متابعة مستمرة، واختبارات تفاعلية تقيس تقدّمك خطوة بخطوة — كل ما تحتاجه للتفوّق في مكان واحد.",
  hero_cta_label: "تصفح الكورسات",
  hero_cta_url: "/courses",
};

function normalize(row: any): PlatformSettings {
  if (!row) return DEFAULT_PLATFORM_SETTINGS;
  return {
    logo_light_url: row.logo_light_url ?? null,
    logo_dark_url: row.logo_dark_url ?? null,
    social_links: Array.isArray(row.social_links) ? row.social_links : [],
    hero_headline: row.hero_headline ?? DEFAULT_PLATFORM_SETTINGS.hero_headline,
    hero_subtext: row.hero_subtext ?? DEFAULT_PLATFORM_SETTINGS.hero_subtext,
    hero_cta_label: row.hero_cta_label ?? DEFAULT_PLATFORM_SETTINGS.hero_cta_label,
    hero_cta_url: row.hero_cta_url ?? DEFAULT_PLATFORM_SETTINGS.hero_cta_url,
    grade_lock_enabled: typeof row.grade_lock_enabled === "boolean" ? row.grade_lock_enabled : false,
  };
}

// Module-level cache so multiple components share a single fetch
let _cachedSettings: PlatformSettings | null = null;
let _fetchPromise: Promise<PlatformSettings> | null = null;
const _listeners = new Set<(s: PlatformSettings) => void>();

async function fetchPlatformSettings(): Promise<PlatformSettings> {
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = (async () => {
    const { data } = await (supabase as any)
      .from("platform_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    const result = normalize(data);
    _cachedSettings = result;
    _listeners.forEach((fn) => fn(result));
    return result;
  })();
  return _fetchPromise;
}

/** Call this after a save to invalidate cache and notify all hook instances */
export function invalidatePlatformSettingsCache() {
  _cachedSettings = null;
  _fetchPromise = null;
}

/** Notify all instances of updated settings (used after local save without re-fetch) */
export function notifyPlatformSettingsListeners(s: PlatformSettings) {
  _cachedSettings = s;
  _listeners.forEach((fn) => fn(s));
}

export function usePlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(
    _cachedSettings ?? DEFAULT_PLATFORM_SETTINGS
  );
  const [loading, setLoading] = useState(!_cachedSettings);

  useEffect(() => {
    let mounted = true;
    const listener = (s: PlatformSettings) => {
      if (mounted) setSettings(s);
    };
    _listeners.add(listener);

    if (!_cachedSettings) {
      fetchPlatformSettings().then((s) => {
        if (mounted) {
          setSettings(s);
          setLoading(false);
        }
      });
    } else {
      setLoading(false);
    }

    return () => {
      _listeners.delete(listener);
      mounted = false;
    };
  }, []);

  const reload = useCallback(async () => {
    invalidatePlatformSettingsCache();
    setLoading(true);
    const s = await fetchPlatformSettings();
    setSettings(s);
    setLoading(false);
  }, []);

  return { settings, loading, setSettings, reload };
}

export function getLogoUrl(settings: PlatformSettings, theme?: string): string {
  if (theme === "dark") {
    return settings.logo_dark_url || settings.logo_light_url || "/dark-logo.png";
  }
  return settings.logo_light_url || settings.logo_dark_url || "/light-logo.png";
}

