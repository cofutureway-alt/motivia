import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

export interface GradeLock {
  /** True when the student should only see courses of their own grade. */
  active: boolean;
  /** The logged-in student's grade id (null when unset / not applicable). */
  stageId: string | null;
  /** True while the registration-form check is still loading. */
  loading: boolean;
}

let _stageIdFieldExists: boolean | null = null;
let _stageIdFieldPromise: Promise<boolean> | null = null;

/**
 * Does the signup form currently include the "الصف الدراسي" (stage_id) field?
 * Cached module-level; the lock is only meaningful when this field exists.
 */
async function stageFieldExists(): Promise<boolean> {
  if (_stageIdFieldExists !== null) return _stageIdFieldExists;
  if (!_stageIdFieldPromise) {
    _stageIdFieldPromise = (async () => {
      try {
        const { data } = await (supabase as any)
          .from("registration_form_fields")
          .select("field_key")
          .eq("field_key", "stage_id")
          .limit(1);
        _stageIdFieldExists = Array.isArray(data) && data.length > 0;
      } catch {
        _stageIdFieldExists = false;
      }
      return _stageIdFieldExists;
    })();
  }
  return _stageIdFieldPromise;
}

/**
 * Grade-based course visibility for students.
 *
 * Active when ALL of these hold:
 *  - platform_settings.grade_lock_enabled is true
 *  - the signup form contains a stage_id field
 *  - current user is a student with a known stage_id
 *
 * Admins, parents, guests and students without a grade are never locked.
 */
export function useGradeLock(): GradeLock {
  const { profile, user } = useAuth();
  const { settings } = usePlatformSettings();
  const [fieldExists, setFieldExists] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    stageFieldExists().then((v) => mounted && setFieldExists(v));
    return () => {
      mounted = false;
    };
  }, []);

  const isStudent = profile?.role === "student" || (!profile && !!user); // self-healed profiles default to student
  const enabled = settings.grade_lock_enabled === true;
  const studentStageId = (profile as any)?.stage_id as string | null | undefined;

  const active =
    enabled &&
    fieldExists === true &&
    isStudent === true &&
    typeof studentStageId === "string" &&
    studentStageId.length > 0;

  return {
    active,
    stageId: active ? (studentStageId as string) : null,
    // True only until we know whether the signup form has the grade field.
    loading: fieldExists === null,
  };
}
