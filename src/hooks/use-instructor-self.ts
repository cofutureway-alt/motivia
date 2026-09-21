import { useEffect, useState } from "react";
import { getInstructorSelf, type InstructorSelf } from "@/lib/instructor-api";
import { useAuth } from "@/contexts/AuthContext";

export interface UseInstructorSelfResult {
  self: InstructorSelf | null;
  loading: boolean;
  hasTaxonomy: boolean;
  canCourses: boolean;
  canBundles: boolean;
  canBooks: boolean;
  canLocations: boolean;
  canStudents: boolean;
  reload: () => Promise<void>;
}

/**
 * Loads the calling instructor's permissions + chosen subjects/stages.
 * Used by InstructorLayout (nav filtering + mandatory onboarding modal)
 * and by the content editors to scope subject/stage choices.
 */
export function useInstructorSelf(): UseInstructorSelfResult {
  const { user } = useAuth();
  const [self, setSelf] = useState<InstructorSelf | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) {
      setSelf(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getInstructorSelf()
      .then((s) => {
        if (!cancelled) setSelf(s);
      })
      .catch(() => {
        if (!cancelled) setSelf(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, tick]);

  return {
    self,
    loading,
    hasTaxonomy: !!self && self.subjects.length > 0 && self.stages.length > 0,
    canCourses: self?.permissions?.can_create_courses ?? true,
    canBundles: self?.permissions?.can_create_bundles ?? false,
    canBooks: self?.permissions?.can_create_books ?? false,
    canLocations: self?.permissions?.can_manage_locations ?? true,
    canStudents: self?.permissions?.can_manage_students ?? true,
    reload: async () => setTick((t) => t + 1),
  };
}