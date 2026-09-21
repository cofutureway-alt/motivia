export type RegFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "phone";

export interface RegFieldOption {
  value: string;
  label: string;
}

export interface RegField {
  id: string;
  field_key: string;
  label: string;
  field_type: RegFieldType;
  is_required: boolean;
  is_locked: boolean;
  options: RegFieldOption[] | null;
  order_index: number;
}

// Fields that always render as password inputs regardless of stored type
export const PASSWORD_KEYS = new Set(["password", "confirm_password"]);

// Fields that map to dedicated profiles columns (rest go to custom_fields)
export const KNOWN_PROFILE_COLUMNS = new Set([
  "full_name",
  "phone_number",
  "email",
  "governorate",
  "registration_type",
  "gender",
  "guardian_phone",
  "stage_id",
]);

export const FIELD_TYPES: { value: RegFieldType; label: string }[] = [
  { value: "text", label: "نص قصير" },
  { value: "textarea", label: "نص طويل" },
  { value: "number", label: "رقم" },
  { value: "date", label: "تاريخ" },
  { value: "select", label: "قائمة منسدلة" },
  { value: "radio", label: "اختيار من متعدد" },
  { value: "checkbox", label: "خانة اختيار" },
  { value: "phone", label: "رقم هاتف" },
];

export function slugifyKey(input: string, existing: Set<string>): string {
  const base =
    "custom_" +
    (input || "field")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) ||
    "custom_field";
  let candidate = base;
  let i = 2;
  while (existing.has(candidate)) {
    candidate = `${base}_${i}`;
    i++;
  }
  return candidate;
}
