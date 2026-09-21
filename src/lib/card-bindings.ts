import { supabase } from "@/integrations/supabase/client";

export type BindingKind = "text" | "image" | "qr";

export interface BindingSource {
  key: string;
  label: string;
  kind: BindingKind;
  sample: string;
}

// Fixed system bindings (not in registration_form_fields)
export const SYSTEM_BINDINGS: BindingSource[] = [
  { key: "student_id", label: "معرّف الطالب", kind: "text", sample: "184203" },
  { key: "avatar_url", label: "الصورة الشخصية", kind: "image", sample: "" },
  { key: "qr_token", label: "رمز QR", kind: "qr", sample: "sample-qr-token-preview" },
];

// Field keys we never allow binding to
const EXCLUDED_KEYS = new Set(["password", "confirm_password"]);

const SAMPLES: Record<string, string> = {
  full_name: "أحمد محمد السيد",
  phone_number: "201012345678",
  guardian_phone: "201098765432",
  email: "student@example.com",
  governorate: "القاهرة",
  registration_type: "طالب",
  gender: "ذكر",
  stage_id: "الصف الثالث الثانوي",
  student_id: "184203",
  qr_token: "sample-qr-token-preview",
  avatar_url: "",
};

export async function fetchBindingSources(): Promise<BindingSource[]> {
  const { data } = await (supabase as any)
    .from("registration_form_fields")
    .select("field_key,label,field_type")
    .order("order_index", { ascending: true });

  const dynamic: BindingSource[] = (data ?? [])
    .filter((r: any) => !EXCLUDED_KEYS.has(r.field_key))
    .map((r: any) => ({
      key: r.field_key,
      label: r.label,
      kind: "text" as const,
      sample: SAMPLES[r.field_key] ?? `[${r.label}]`,
    }));

  // Merge system, prefer dynamic labels if same key
  const seen = new Set(dynamic.map((d) => d.key));
  const merged = [...dynamic];
  for (const s of SYSTEM_BINDINGS) if (!seen.has(s.key)) merged.push(s);
  return merged;
}

export function placeholderForBinding(label: string): string {
  return `{{${label}}}`;
}

export function sampleFor(key: string, fallback = ""): string {
  return SAMPLES[key] ?? fallback;
}
