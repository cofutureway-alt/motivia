import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, ShieldCheck, Percent, BookMarked, Layers, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  adminSaveInstructorPermissions, adminSetInstructorTaxonomy,
} from "@/lib/admin-instructors-api";
import { listAllSubjects, listAllStages } from "@/lib/instructor-api";

interface Perms {
  can_create_courses: boolean;
  can_create_bundles: boolean;
  can_create_books: boolean;
  can_manage_locations: boolean;
  can_manage_students: boolean;
  courses_percent_override: string;
  books_percent_override: string;
}

const PERM_KEYS: { key: keyof Perms; label: string }[] = [
  { key: "can_create_courses", label: "إنشاء كورسات" },
  { key: "can_create_bundles", label: "إنشاء باقات" },
  { key: "can_create_books", label: "إنشاء كتب" },
  { key: "can_manage_locations", label: "إدارة أماكن التواجد" },
  { key: "can_manage_students", label: "إدارة الطلاب (تصحيح، تقييم، بيانات)" },
];

export default function AdminInstructorSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string }[]>([]);
  const [allStages, setAllStages] = useState<{ id: string; name: string }[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [perms, setPerms] = useState<Perms>({
    can_create_courses: true,
    can_create_bundles: false,
    can_create_books: false,
    can_manage_locations: true,
    can_manage_students: true,
    courses_percent_override: "",
    books_percent_override: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [pRes, permRes, subjRes, stgRes, allS, allSt] = await Promise.all([
          (supabase as any).from("profiles").select("full_name, avatar_url").eq("id", id).single(),
          (supabase as any).from("instructor_permissions").select("*").eq("instructor_id", id).maybeSingle(),
          (supabase as any).from("instructor_subjects").select("subject_id").eq("instructor_id", id),
          (supabase as any).from("instructor_stages").select("stage_id").eq("instructor_id", id),
          listAllSubjects(),
          listAllStages(),
        ]);
        if (cancelled) return;
        if (pRes.data) setProfile(pRes.data);
        if (permRes.data) {
          setPerms({
            can_create_courses: permRes.data.can_create_courses ?? true,
            can_create_bundles: permRes.data.can_create_bundles ?? false,
            can_create_books: permRes.data.can_create_books ?? false,
            can_manage_locations: permRes.data.can_manage_locations ?? true,
            can_manage_students: permRes.data.can_manage_students ?? true,
            courses_percent_override:
              permRes.data.courses_percent_override != null
                ? String(permRes.data.courses_percent_override)
                : "",
            books_percent_override:
              permRes.data.books_percent_override != null
                ? String(permRes.data.books_percent_override)
                : "",
          });
        }
        setSelectedSubjects((subjRes.data ?? []).map((r: any) => r.subject_id));
        setSelectedStages((stgRes.data ?? []).map((r: any) => r.stage_id));
        setAllSubjects(allS);
        setAllStages(allSt);
      } catch (e: any) {
        toast.error(e?.message || "تعذّر التحميل");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async () => {
    if (!id) return;
    const cp = perms.courses_percent_override.trim();
    const bp = perms.books_percent_override.trim();
    if (cp && (isNaN(parseFloat(cp)) || parseFloat(cp) < 0 || parseFloat(cp) > 100))
      return toast.error("نسبة الدورات يجب أن تكون بين 0 و 100");
    if (bp && (isNaN(parseFloat(bp)) || parseFloat(bp) < 0 || parseFloat(bp) > 100))
      return toast.error("نسبة الكتب يجب أن تكون بين 0 و 100");

    setSaving(true);
    try {
      await adminSaveInstructorPermissions(id, {
        can_create_courses: perms.can_create_courses,
        can_create_bundles: perms.can_create_bundles,
        can_create_books: perms.can_create_books,
        can_manage_locations: perms.can_manage_locations,
        can_manage_students: perms.can_manage_students,
        courses_percent_override: cp ? parseFloat(cp) : null,
        books_percent_override: bp ? parseFloat(bp) : null,
      });
      await adminSetInstructorTaxonomy(id, selectedSubjects, selectedStages);
      toast.success("تم حفظ إعدادات المعلم");
      navigate("/admin/instructors");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/instructors")}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            {profile && (
              <Avatar className="w-9 h-9">
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {profile.full_name?.[0] ?? "م"}
                </AvatarFallback>
              </Avatar>
            )}
            <h1 className="text-2xl font-bold">إعدادات المعلم</h1>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
          حفظ التغييرات
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="w-4 h-4 text-primary" />
                الصلاحيات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {PERM_KEYS.map((p) => (
                <div key={p.key} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
                  <Label className="cursor-pointer">{p.label}</Label>
                  <Switch
                    checked={perms[p.key] as boolean}
                    onCheckedChange={(v) => setPerms((f) => ({ ...f, [p.key]: v }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Percent className="w-4 h-4 text-primary" />
                نسب الأرباح (تجاوز)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                اتركها فارغة لاستخدام النسب العامة من إعدادات تقسيم الأرباح
              </p>
              <div className="space-y-2">
                <Label>نسبة خاصة للدورات (%)</Label>
                <Input
                  type="number" min={0} max={100}
                  value={perms.courses_percent_override}
                  onChange={(e) => setPerms({ ...perms, courses_percent_override: e.target.value })}
                  placeholder="مثال: 60"
                />
              </div>
              <div className="space-y-2">
                <Label>نسبة خاصة للكتب (%)</Label>
                <Input
                  type="number" min={0} max={100}
                  value={perms.books_percent_override}
                  onChange={(e) => setPerms({ ...perms, books_percent_override: e.target.value })}
                  placeholder="مثال: 50"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookMarked className="w-4 h-4 text-primary" />
                المواد المخصصة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {allSubjects.map((s) => {
                  const active = selectedSubjects.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSelectedSubjects((arr) =>
                          arr.includes(s.id) ? arr.filter((x) => x !== s.id) : [...arr, s.id]
                        )
                      }
                      className={`rounded-xl border px-3 py-1.5 text-sm transition-all ${
                        active ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:border-primary/40"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="w-4 h-4 text-primary" />
                المراحل المخصصة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {allStages.map((s) => {
                  const active = selectedStages.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSelectedStages((arr) =>
                          arr.includes(s.id) ? arr.filter((x) => x !== s.id) : [...arr, s.id]
                        )
                      }
                      className={`rounded-xl border px-3 py-1.5 text-sm transition-all ${
                        active ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:border-primary/40"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {selectedSubjects.length === 0 || selectedStages.length === 0
                  ? "⚠️ المعلم سيرى نافذة إجبارية لاختيار المواد والمراحل عند دخوله لوحته"
                  : `سيُسمح للمعلم بإنشاء محتوى في ${selectedSubjects.length} مادة و ${selectedStages.length} مرحلة`}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}