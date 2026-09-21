import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, UserPlus, CheckCircle2, IdCard, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import DynamicRegistrationField from "@/components/auth/DynamicRegistrationField";
import { useRegistrationFields } from "@/hooks/use-registration-fields";
import {
  KNOWN_PROFILE_COLUMNS,
  PASSWORD_KEYS,
} from "@/lib/registration-fields";
import { isValidEgPhone, normalizeEgPhone, syntheticAuthEmail } from "@/lib/phone";
import { adminCreateStudent, updateStudentProfile, type AdminStudentRow } from "@/lib/admin-students-api";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  student?: AdminStudentRow | null;
  onSaved: () => void;
}

export default function StudentFormModal({ open, onOpenChange, mode, student, onSaved }: Props) {
  const { fields, loading: loadingFields } = useRegistrationFields();
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPw, setShowPw] = useState<Record<string, boolean>>({});
  const [createdInfo, setCreatedInfo] = useState<{ student_id: string | null } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setCreatedInfo(null);
    if (mode === "edit" && student) {
      setAvatarUrl(student.avatar_url ?? null);
      setValues({
        full_name: student.full_name ?? "",
        phone_number: student.phone_number ?? "",
        email: student.email ?? "",
        governorate: student.governorate ?? "",
        registration_type: student.registration_type ?? "",
        gender: student.gender ?? "",
        stage_id: student.stage_id ?? "",
        guardian_phone: (student as any).guardian_phone ?? "",
        ...(student.custom_fields ?? {}),
      });
    } else {
      setAvatarUrl(null);
      setValues({});
    }
  }, [open, mode, student]);

  const visibleFields = useMemo(() => {
    if (mode === "edit") {
      return fields.filter((f) => !PASSWORD_KEYS.has(f.field_key));
    }
    return fields;
  }, [fields, mode]);

  const uploadAvatar = async (file: File) => {
    if (!student) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("الحجم الأقصى للصورة 3 ميجابايت");
      return;
    }
    setAvatarBusy(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${student.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: signed, error: signErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr || !signed?.signedUrl) throw signErr || new Error("no url");
      const url = signed.signedUrl;
      await (supabase as any).from("profiles").update({ avatar_url: url }).eq("id", student.id);
      setAvatarUrl(url);
      onSaved();
      toast.success("تم تحديث الصورة");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر رفع الصورة");
    } finally {
      setAvatarBusy(false);
    }
  };

  const deleteAvatar = async () => {
    if (!student) return;
    setAvatarBusy(true);
    try {
      // Best-effort: remove existing files under the user's avatar folder
      const { data: list } = await supabase.storage.from("avatars").list(student.id);
      if (list && list.length) {
        await supabase.storage
          .from("avatars")
          .remove(list.map((f) => `${student.id}/${f.name}`));
      }
      await (supabase as any).from("profiles").update({ avatar_url: null }).eq("id", student.id);
      setAvatarUrl(null);
      onSaved();
      toast.success("تم حذف الصورة");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حذف الصورة");
    } finally {
      setAvatarBusy(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    for (const f of fields) {
      if (mode === "edit" && PASSWORD_KEYS.has(f.field_key)) continue;
      const raw = values[f.field_key];
      const val = typeof raw === "string" ? raw.trim() : raw;
      if (f.is_required) {
        if (val === undefined || val === null || val === "" || (f.field_type === "checkbox" && !val)) {
          e[f.field_key] = "هذا الحقل مطلوب";
          continue;
        }
      }
      if (!val && !f.is_required) continue;
      if (f.field_type === "phone" && !isValidEgPhone(String(val))) {
        e[f.field_key] = "رقم هاتف غير صالح";
      }
      if (f.field_key === "email" && val && !/^\S+@\S+\.\S+$/.test(String(val))) {
        e[f.field_key] = "بريد غير صالح";
      }
      if (mode === "create" && f.field_key === "password" && String(val).length < 6) {
        e[f.field_key] = "كلمة المرور 6 أحرف على الأقل";
      }
    }
    if (mode === "create" && (values.password || values.confirm_password)) {
      if ((values.password || "") !== (values.confirm_password || "")) {
        e.confirm_password = "كلمة المرور غير مطابقة";
      }
    }
    if (values.phone_number && values.guardian_phone) {
      if (normalizeEgPhone(String(values.phone_number)) === normalizeEgPhone(String(values.guardian_phone))) {
        e.guardian_phone = "رقم ولي الأمر يجب أن يختلف عن رقم الطالب";
      }
    }
    return e;
  };

  const handleSubmit = async () => {
    const eMap = validate();
    setErrors(eMap);
    if (Object.keys(eMap).length) return;

    const canonicalPhone = normalizeEgPhone(String(values.phone_number || ""));
    const canonicalGuardian = values.guardian_phone
      ? normalizeEgPhone(String(values.guardian_phone))
      : null;
    const realEmail = (values.email || "").toString().trim().toLowerCase() || "";

    const knownData: Record<string, any> = {};
    const customData: Record<string, any> = {};
    for (const f of fields) {
      if (PASSWORD_KEYS.has(f.field_key)) continue;
      const v = values[f.field_key];
      if (v === undefined) continue;
      if (KNOWN_PROFILE_COLUMNS.has(f.field_key)) {
        knownData[f.field_key] = v === "" ? null : v;
      } else {
        customData[f.field_key] = v === "" ? null : v;
      }
    }
    knownData.phone_number = canonicalPhone;
    if (canonicalGuardian !== undefined) knownData.guardian_phone = canonicalGuardian;
    if (realEmail) knownData.email = realEmail;
    else knownData.email = null;

    setSubmitting(true);
    try {
      if (mode === "create") {
        const authEmail = realEmail || syntheticAuthEmail(canonicalPhone);
        const res = await adminCreateStudent({
          auth_email: authEmail,
          password: String(values.password || ""),
          full_name: knownData.full_name ?? "",
          phone_number: canonicalPhone,
          guardian_phone: canonicalGuardian,
          real_email: realEmail || null,
          governorate: knownData.governorate ?? null,
          registration_type: knownData.registration_type ?? null,
          gender: knownData.gender ?? null,
          stage_id: knownData.stage_id ?? null,
          custom_fields: customData,
        });
        setCreatedInfo({ student_id: res.student_id });
        toast.success("تم إنشاء حساب الطالب");
        onSaved();
      } else if (student) {
        await updateStudentProfile(student.id, {
          ...knownData,
          custom_fields: customData,
        });
        toast.success("تم حفظ البيانات");
        onSaved();
        onOpenChange(false);
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.includes("phone_taken")) toast.error("رقم الهاتف مستخدم بالفعل");
      else if (msg.toLowerCase().includes("already")) toast.error("الحساب مسجّل بالفعل");
      else toast.error(msg || "تعذّر الحفظ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <UserPlus className="w-5 h-5 text-primary" />
            {mode === "create" ? "إضافة طالب جديد" : "تعديل بيانات الطالب"}
          </DialogTitle>
        </DialogHeader>

        {createdInfo ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-6 text-center space-y-4"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <div className="font-black text-lg">تم إنشاء الحساب بنجاح</div>
              {createdInfo.student_id && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary/10 text-primary px-4 py-2 font-mono text-lg">
                  <IdCard className="w-5 h-5" />
                  رقم الطالب: {createdInfo.student_id}
                </div>
              )}
            </div>
            <Button onClick={() => onOpenChange(false)} className="min-w-32">إغلاق</Button>
          </motion.div>
        ) : loadingFields ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {mode === "edit" && student && (
              <div className="flex items-center gap-4 rounded-xl border border-border/50 p-3">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={avatarUrl ?? undefined} />
                  <AvatarFallback>{(student.full_name || "?").slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-bold">الصورة الشخصية</div>
                  <div className="text-xs text-muted-foreground">PNG/JPG - أقصى 3 ميجابايت</div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAvatar(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarBusy}
                >
                  {avatarBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {avatarUrl ? "تغيير" : "رفع"}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={deleteAvatar}
                    disabled={avatarBusy}
                  >
                    <Trash2 className="w-4 h-4" />
                    حذف
                  </Button>
                )}
              </div>
            )}
            {visibleFields.map((f) => (
              <DynamicRegistrationField
                key={f.id}
                field={f}
                value={values[f.field_key]}
                onChange={(v) => setValues((p) => ({ ...p, [f.field_key]: v }))}
                error={errors[f.field_key]}
                disabled={submitting}
                showPassword={!!showPw[f.field_key]}
                onTogglePassword={
                  PASSWORD_KEYS.has(f.field_key)
                    ? () => setShowPw((p) => ({ ...p, [f.field_key]: !p[f.field_key] }))
                    : undefined
                }
              />
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                إلغاء
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="min-w-32 gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> جارٍ الحفظ...
                  </>
                ) : mode === "create" ? (
                  "إنشاء الحساب"
                ) : (
                  "حفظ التغييرات"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
