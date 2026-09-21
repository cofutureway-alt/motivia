import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  Download,
  Boxes,
  Cloud,
  Package,
  ShoppingBag,
  Truck,
  Loader2,
  BadgeCheck,
  CircleSlash,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCountUp } from "@/hooks/use-count-up";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { formatPiastres, getEffectivePrice } from "@/lib/money";

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  cover_image_url: string | null;
  book_type: "digital" | "physical";
  status: "draft" | "published";
  price_piastres: number;
  discount_price_piastres: number | null;
  discount_expires_at: string | null;
  stock_quantity: number | null;
  download_limit: number | null;
  subject_id: string | null;
  stage_id: string | null;
  created_at: string;
  subjects?: { name: string } | null;
  stages?: { name: string } | null;
  created_by?: string | null;
  instructor_name?: string | null;
}

const StatCard = ({
  icon: Icon,
  label,
  value,
  hint,
  delay = 0,
  pending = false,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number | string;
  hint?: string;
  delay?: number;
  pending?: boolean;
}) => {
  const numeric = typeof value === "number" ? value : null;
  const { count } = useCountUp(numeric ?? 0, 900);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5 h-full">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className={`mt-2 text-3xl font-bold ${pending ? "text-muted-foreground" : ""}`}>
              {pending ? "—" : numeric !== null ? count.toLocaleString("ar-EG") : value}
            </div>
            {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

const CoverThumb = ({ path, title }: { path: string | null; title: string }) => {
  const url = useSignedUrl("book-assets", path);
  return (
    <div className="w-10 h-14 rounded-md overflow-hidden bg-accent flex items-center justify-center shrink-0 border border-border">
      {url ? (
        <img src={url} alt={title} className="w-full h-full object-cover" />
      ) : (
        <BookOpen className="w-4 h-4 text-muted-foreground" />
      )}
    </div>
  );
};

export default function AdminBooks() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const isInstructor = profile?.role === "instructor";
  const backTo = isInstructor ? "/instructor/books" : "/admin/books";
  const [rows, setRows] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [subjectId, setSubjectId] = useState<string>("all");
  const [stageId, setStageId] = useState<string>("all");
  const [instructorFilter, setInstructorFilter] = useState("all");
  const [instructors, setInstructors] = useState<{ id: string; full_name: string | null }[]>([]);
  const [sort, setSort] = useState<"date" | "price">("date");
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [toDelete, setToDelete] = useState<BookRow | null>(null);
  const [preview, setPreview] = useState<BookRow | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: books }, { data: subs }, { data: stgs }, { data: iRows }] = await Promise.all([
      (supabase as any)
        .from("books")
        .select(
          "id,title,author,cover_image_url,book_type,status,price_piastres,discount_price_piastres,discount_expires_at,stock_quantity,download_limit,subject_id,stage_id,created_at,created_by,subjects(name),stages(name)"
        )
        .order("created_at", { ascending: false }),
      (supabase as any).from("subjects").select("id,name").order("name"),
      (supabase as any).from("stages").select("id,name").order("name"),
      (supabase as any).from("profiles").select("id, full_name").eq("role", "instructor").order("full_name"),
    ]);
    const allBooks = (books as BookRow[]) ?? [];
    // Instructor scope: list own books only
    const mineBooks = isInstructor ? allBooks.filter((b) => (b as any).created_by === user?.id) : allBooks;
    const creatorMap = new Map(((iRows as any[]) ?? []).map((i) => [i.id, i]));
    setRows(mineBooks.map((b: any) => ({ ...b, instructor_name: creatorMap.get(b.created_by)?.full_name ?? null })));
    setInstructors((iRows as any) ?? []);
    setSubjects((subs as any) ?? []);
    setStages((stgs as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const digital = rows.filter((r) => r.book_type === "digital").length;
    const physical = rows.filter((r) => r.book_type === "physical").length;
    const stock = rows
      .filter((r) => r.book_type === "physical")
      .reduce((a, b) => a + (b.stock_quantity ?? 0), 0);
    const downloads = rows
      .filter((r) => r.book_type === "digital" && r.download_limit !== null)
      .reduce((a, b) => a + (b.download_limit ?? 0), 0);
    return { total: rows.length, digital, physical, stock, downloads };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (type !== "all" && r.book_type !== type) return false;
      if (status !== "all" && r.status !== status) return false;
      if (subjectId !== "all" && r.subject_id !== subjectId) return false;
      if (stageId !== "all" && r.stage_id !== stageId) return false;
      if (instructorFilter !== "all" && r.created_by !== instructorFilter) return false;
      if (q) {
        const hay = `${r.title} ${r.author ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort === "price") {
      list = [...list].sort((a, b) => a.price_piastres - b.price_piastres);
    } else {
      list = [...list].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return list;
  }, [rows, search, type, status, subjectId, stageId, sort, instructorFilter]);

  const toggleStatus = async (row: BookRow) => {
    const next = row.status === "published" ? "draft" : "published";
    const { error } = await (supabase as any)
      .from("books")
      .update({ status: next })
      .eq("id", row.id);
    if (error) {
      toast.error("تعذّر تغيير الحالة");
      return;
    }
    toast.success(next === "published" ? "تم النشر" : "تم التحويل إلى مسودة");
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await (supabase as any).from("books").delete().eq("id", toDelete.id);
    if (error) {
      toast.error("تعذّر الحذف");
      return;
    }
    toast.success("تم حذف الكتاب");
    setRows((rs) => rs.filter((r) => r.id !== toDelete.id));
    setToDelete(null);
  };

  return (
    <div className="space-y-8" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-primary" />
            إدارة الكتب
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            الكتب الرقمية والمطبوعة، الأسعار، والمخزون
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate(`${backTo}/new`)}>
            <Plus className="w-4 h-4 ml-2" />
            إضافة كتاب جديد
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" disabled>
                    <ShoppingBag className="w-4 h-4 ml-2" />
                    إدارة الطلبات
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>متاح قريباً</TooltipContent>
            </Tooltip>
            <Button
              variant="outline"
              onClick={() => navigate("/admin/shipping-zones")}
              className={isInstructor ? "hidden" : undefined}
            >
              <Truck className="w-4 h-4 ml-2" />
              إدارة مناطق الشحن
            </Button>
          </TooltipProvider>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={BookOpen} label="إجمالي الكتب" value={stats.total} delay={0} />
        <StatCard icon={Cloud} label="كتب رقمية" value={stats.digital} delay={0.05} />
        <StatCard icon={Package} label="كتب مطبوعة" value={stats.physical} delay={0.1} />
        <StatCard
          icon={Boxes}
          label="إجمالي المخزون"
          value={stats.stock}
          hint="نسخ مطبوعة متوفرة"
          delay={0.15}
        />
        <StatCard
          icon={Download}
          label="رصيد التنزيلات"
          value={stats.downloads}
          hint="مجموع حدود التنزيل"
          delay={0.2}
        />
        <StatCard
          icon={BadgeCheck}
          label="الأعلى مبيعاً"
          value="—"
          hint="لا توجد بيانات مبيعات بعد"
          delay={0.25}
          pending
        />
      </div>

      <Card className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث بالعنوان أو المؤلف…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue placeholder="النوع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="digital">رقمي</SelectItem>
              <SelectItem value="physical">قابل للشحن</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="published">منشور</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
            </SelectContent>
          </Select>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger><SelectValue placeholder="المادة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المواد</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stageId} onValueChange={setStageId}>
            <SelectTrigger><SelectValue placeholder="المرحلة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المراحل</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={instructorFilter} onValueChange={setInstructorFilter}>
            <SelectTrigger><SelectValue placeholder="المعلم" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المعلمين</SelectItem>
              {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.full_name || "معلم بدون اسم"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>عدد النتائج: {filtered.length}</span>
          <Select value={sort} onValueChange={(v) => setSort(v as any)}>
            <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date">الأحدث أولاً</SelectItem>
              <SelectItem value="price">السعر (تصاعدي)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكتاب</TableHead>
                <TableHead className="text-right">المؤلف</TableHead>
                <TableHead className="text-right">السعر</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">المخزون/التنزيلات</TableHead>
                <TableHead className="text-right">المادة</TableHead>
                <TableHead className="text-right">المرحلة</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                    لا توجد كتب مطابقة
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence initial={false}>
                  {filtered.map((r, i) => {
                    const eff = getEffectivePrice(
                      r.price_piastres,
                      r.discount_price_piastres,
                      r.discount_expires_at
                    );
                    return (
                      <motion.tr
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2) }}
                        className="border-b border-border/60"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <CoverThumb path={r.cover_image_url} title={r.title} />
                            <div className="font-medium">{r.title}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.author ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold">{formatPiastres(eff.amount)}</span>
                            {eff.discountActive && (
                              <span className="text-xs text-muted-foreground line-through">
                                {formatPiastres(eff.originalAmount ?? 0)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {r.book_type === "digital" ? (
                            <Badge variant="secondary" className="gap-1"><Cloud className="w-3 h-3" />رقمي</Badge>
                          ) : (
                            <Badge className="gap-1"><Package className="w-3 h-3" />مطبوع</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.book_type === "physical"
                            ? `${r.stock_quantity ?? 0} نسخة`
                            : r.download_limit === null
                              ? "غير محدود"
                              : `${r.download_limit} تنزيل`}
                        </TableCell>
                        <TableCell className="text-sm">{r.subjects?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.stages?.name ?? "—"}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleStatus(r)}
                            className="cursor-pointer"
                            title="تبديل الحالة"
                          >
                            {r.status === "published" ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25">
                                منشور
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <CircleSlash className="w-3 h-3" />
                                مسودة
                              </Badge>
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => setPreview(r)} title="معاينة">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`${backTo}/${r.id}`)}
                              title="تعديل"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setToDelete(r)}
                              title="حذف"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الكتاب</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف «{toDelete?.title}»؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookPreviewModal book={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function BookPreviewModal({ book, onClose }: { book: BookRow | null; onClose: () => void }) {
  const url = useSignedUrl("book-assets", book?.cover_image_url ?? null);
  if (!book) return null;
  const eff = getEffectivePrice(
    book.price_piastres,
    book.discount_price_piastres,
    book.discount_expires_at
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>معاينة الكتاب</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="aspect-[3/4] rounded-lg overflow-hidden bg-accent flex items-center justify-center">
            {url ? (
              <img src={url} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          <div className="md:col-span-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={book.status === "published" ? "default" : "outline"}>
                {book.status === "published" ? "منشور" : "مسودة"}
              </Badge>
              <Badge variant="secondary">
                {book.book_type === "digital" ? "رقمي" : "مطبوع"}
              </Badge>
            </div>
            <h3 className="text-xl font-bold">{book.title}</h3>
            {book.author && (
              <p className="text-sm text-muted-foreground">المؤلف: {book.author}</p>
            )}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary">{formatPiastres(eff.amount)}</span>
              {eff.discountActive && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatPiastres(eff.originalAmount ?? 0)}
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground pt-2">
              {book.book_type === "physical" ? (
                <>المخزون المتوفر: {book.stock_quantity ?? 0} نسخة</>
              ) : (
                <>حد التنزيل: {book.download_limit === null ? "غير محدود" : book.download_limit}</>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
