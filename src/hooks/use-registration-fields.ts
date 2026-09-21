import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RegField } from "@/lib/registration-fields";

export function useRegistrationFields() {
  const [fields, setFields] = useState<RegField[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("registration_form_fields")
      .select("*")
      .order("order_index", { ascending: true });
    setFields((data ?? []) as RegField[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { fields, loading, reload: load, setFields };
}

export function useStagesList() {
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    (supabase as any)
      .from("stages")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }: any) => setStages((data ?? []) as any));
  }, []);
  return stages;
}
