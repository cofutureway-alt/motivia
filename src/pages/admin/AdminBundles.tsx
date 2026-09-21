import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Package, Plus, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BundleRow {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  status: string;
  is_paid: boolean;
  is_featured: boolean;
  price_piastres: number | null;
  discount_price_piastres: number | null;
  bundle_courses: { course_id: string }[];
  created_by?: string | null;
  instructor_name?: string | null;
}

function BundleCardRow({
  b,
  onEdit,
  onDelete,
  onToggleFeatured,
}: {
  b: BundleRow;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFeatured: () => void;
}) {
  const thumb = useSignedThumbnail(b.cover_image_url);
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="relative h-36 bg-accent">
        {thumb ? (
          <img src={thumb} alt={b.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Package className="w-10 h-10 opacity-30" />
          </div>
        )}
        <button
          onClick={onToggleFeatured}
          className="absolute top-2 left-2 bg-background/90 hover:bg-background rounded-full p-1.5 shadow"
          title="مميز"
        >
          <Star
            className={`w-4 h-4 ${b.is_featured ? "fill-yellow-400 text-yellow-400" : ""}`}
          />
        </button>
      </div>
      <div className="p-5 space-y-3 flex-1 flex flex-col">
        <div className="flex-1">
          <div className="font-bold text-lg truncate">{b.title}</div>
          <div className="text-xs text-muted-foreground mt-1 flex gap-2 items-center flex-wrap">
            <Badge variant={b.status === "published" ? "default" : "secondary"}>
              {b.status === "published" ? "منشورة" : "مسودة"}
            </Badge>
            <span>{b.bundle_courses?.length ?? 0} دورة</span>
            {b.is_paid && b.price_piastres != null && (
              <span className="text-primary font-semibold">
                {(b.price_piastres / 100).toLocaleString("ar-EG")} ج.م
              </span>
            )}
          </div>
          {b.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
              {b.description}
            </p>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
            <Pencil className="w-4 h-4 ml-1" /> تعديل
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function AdminBundles() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const isInstructor = profile?.role === "instructor";
  const backTo = isInstructor ? "/instructor/bundles" : "/admin/bundles";
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructorFilter, setInstructorFilter] = useState("all");
  const [instructors, setInstructors] = useState<{ id: string; full_name: string | null }[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: iRows }] = await Promise.all([
      (supabase as any)
        .from("bundles")
        .select("id, title, description, cover_image_url, status, is_paid, is_featured, price_piastres, discount_price_piastres, created_by, bundle_courses(course_id)")
        .order("created_at", { ascending: false }),
      (supabase as any).from("profiles").select("id, full_name").eq("role", "instructor").order("full_name"),
    ]);
    if (error) toast.error("تعذّر تحميل الباقات");
    const creatorMap = new Map(((iRows as any[]) ?? []).map((i) => [i.id, i]));
    const all = ((data as BundleRow[]) ?? []).map((b: any) => ({
      ...b,
      instructor_name: creatorMap.get(b.created_by)?.full_name ?? null,
    }));
    setInstructors((iRows as any) ?? []);
    setBundles(isInstructor ? all.filter((b) => b.created_by === user?.id) : all);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("هل تريد حذف هذه الباقة؟")) return;
    const { error } = await (supabase as any).from("bundles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    load();
  };

  const toggleFeatured = async (row: BundleRow) => {
    const { error } = await (supabase as any)
      .from("bundles")
      .update({
        is_featured: !row.is_featured,
        featured_at: !row.is_featured ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="w-7 h-7 text-primary" /> باقات الدورات
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            أنشئ باقات تجمع عدة دورات بسعر واحد مع إمكانية الخصم
          </p>
        </div>
        <Button onClick={() => navigate(`${backTo}/new`)}>
          <Plus className="w-4 h-4 ml-2" /> باقة جديدة
        </Button>
      </div>

      {!isInstructor && (
        <div className="max-w-xs">
          <Select value={instructorFilter} onValueChange={setInstructorFilter}>
            <SelectTrigger><SelectValue placeholder="فلترة حسب المعلم" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المعلمين</SelectItem>
              {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.full_name || "معلم بدون اسم"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">جارٍ التحميل…</div>
      ) : bundles.length === 0 ? (
        <Card className="p-16 text-center text-muted-foreground">
          لا توجد باقات بعد. اضغط "باقة جديدة" لإنشاء أول باقة.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bundles.filter((b) => instructorFilter === "all" || b.created_by === instructorFilter).map((b) => (
            <BundleCardRow
              key={b.id}
              b={b}
              onEdit={() => navigate(`${backTo}/${b.id}`)}
              onDelete={() => remove(b.id)}
              onToggleFeatured={() => toggleFeatured(b)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
