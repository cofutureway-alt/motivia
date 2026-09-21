import { useEffect } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RegField } from "@/lib/registration-fields";
import { PASSWORD_KEYS } from "@/lib/registration-fields";
import { useStagesList } from "@/hooks/use-registration-fields";

interface Props {
  field: RegField;
  value: any;
  onChange: (v: any) => void;
  error?: string;
  disabled?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  readOnly?: boolean;
}

export default function DynamicRegistrationField({
  field,
  value,
  onChange,
  error,
  disabled,
  showPassword,
  onTogglePassword,
  readOnly,
}: Props) {
  const stages = useStagesList();
  const isPassword = PASSWORD_KEYS.has(field.field_key);
  const isStage = field.field_key === "stage_id";
  const requiredMark = field.is_required ? (
    <span className="text-destructive mr-1">*</span>
  ) : null;

  const options = isStage
    ? stages.map((s) => ({ value: s.id, label: s.name }))
    : field.options ?? [];

  const commonWrap = (input: React.ReactNode) => (
    <div className="space-y-2">
      <Label htmlFor={field.field_key} className="text-sm font-bold flex items-center gap-1">
        {requiredMark}
        {field.label}
        {readOnly && <Lock className="w-3 h-3 text-muted-foreground" />}
      </Label>
      {input}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );

  // Password / confirm_password
  if (isPassword) {
    return commonWrap(
      <div className="relative">
        <Input
          id={field.field_key}
          type={showPassword ? "text" : "password"}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || readOnly}
          autoComplete={field.field_key === "password" ? "new-password" : "off"}
          className="pl-10"
        />
        {onTogglePassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>,
    );
  }

  switch (field.field_type) {
    case "textarea":
      return commonWrap(
        <Textarea
          id={field.field_key}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || readOnly}
          rows={3}
        />,
      );
    case "number":
      return commonWrap(
        <Input
          id={field.field_key}
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || readOnly}
          dir="ltr"
          className="text-right"
        />,
      );
    case "date":
      return commonWrap(
        <Input
          id={field.field_key}
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || readOnly}
          dir="ltr"
        />,
      );
    case "phone":
      return commonWrap(
        <Input
          id={field.field_key}
          type="tel"
          inputMode="tel"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="01012345678"
          disabled={disabled || readOnly}
          dir="ltr"
          className="text-right"
          autoComplete={field.field_key === "phone_number" ? "tel" : "off"}
        />,
      );
    case "select":
      return commonWrap(
        <Select
          value={value ?? ""}
          onValueChange={onChange}
          disabled={disabled || readOnly}
          dir="rtl"
        >
          <SelectTrigger id={field.field_key} dir="rtl">
            <SelectValue placeholder="— اختر —" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      );
    case "radio":
      return commonWrap(
        <RadioGroup
          value={value ?? ""}
          onValueChange={onChange}
          disabled={disabled || readOnly}
          dir="rtl"
          className="flex flex-wrap gap-3"
        >
          {options.map((o) => (
            <label
              key={o.value}
              htmlFor={`${field.field_key}_${o.value}`}
              className="flex items-center gap-2 rounded-xl border border-border/60 px-3.5 py-2 cursor-pointer hover:border-primary/60 transition-colors data-[state=checked]:border-primary"
            >
              <RadioGroupItem
                id={`${field.field_key}_${o.value}`}
                value={o.value}
              />
              <span className="text-sm font-medium">{o.label}</span>
            </label>
          ))}
        </RadioGroup>,
      );
    case "checkbox":
      return (
        <div className="space-y-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={!!value}
              onCheckedChange={(c) => onChange(!!c)}
              disabled={disabled || readOnly}
            />
            <span className="text-sm font-bold">
              {requiredMark}
              {field.label}
            </span>
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );
    default:
      return commonWrap(
        <Input
          id={field.field_key}
          type={field.field_key === "email" ? "email" : "text"}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || readOnly}
          dir={field.field_key === "email" ? "ltr" : undefined}
          autoComplete={
            field.field_key === "full_name"
              ? "name"
              : field.field_key === "email"
              ? "email"
              : "off"
          }
        />,
      );
  }
}
