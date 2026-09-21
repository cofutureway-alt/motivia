import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Search, Cloud, Package, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPiastres, getEffectivePrice } from "@/lib/money";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { usePageMeta } from "@/hooks/use-page-meta";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AddToCartButton from "@/components/AddToCartButton";

interface PublicBook {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_image_url: string | null;
  book_type: "digital" | "physical";
  price_piastres: number;
  discount_price_piastres: number | null;
  discount_expires_at: string | null;
  stock_quantity: number | null;
  subject_id: string | null;
  stage_id: string | null;
  subjects?: { name: string } | null;
  stages?: { name: string } | null;
  created_by: string | null;
  instructor_name: string | null;
  instructor_avatar_url: string | null;
}

function Cover({ path, title }: { path: string | null; title: string }) {
  const url = useSignedUrl("book-assets", path);
  return (
    <div className="aspect-[2/3] w-full overflow-hidden rounded-t-3xl bg-primary-soft flex items-center justify-center">
      {url ? (
        <img src={url} alt={title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
      ) : (
        <BookOpen className="h-12 w-12 text-primary/40" />
      )}
    </div>
  );
}

function BookCard({ book, delay }: { book: PublicBook; delay: number }) {
  const eff = getEffectivePrice(book.price_piastres, book.discount_price_piastres, book.discount_expires_at);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="group"
    >
      <Card className="h-full overflow-hidden rounded-3xl border-border/70 bg-card shadow-subtle transition-all duration-500 hover:-translate-y-2 hover:border-primary/30 hover:shadow-soft">
        <Link to={`/books/${book.id}`} className="block">
          <Cover path={book.cover_image_url} title={book.title} />
        </Link>
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex flex-wrap gap-2">
            {book.book_type === "digital" ? (
              <Badge variant="secondary" className="gap-1 rounded-full bg-primary-soft px-3 py-1 text-primary"><Cloud className="h-3 w-3" />رقمي</Badge>
            ) : (
              <Badge className="gap-1 rounded-full bg-secondary px-3 py-1 text-secondary-foreground"><Package className="h-3 w-3" />مطبوع</Badge>
            )}
            {eff.discountActive && (
              <Badge variant="outline" className="rounded-full border-primary/30 text-primary">خصم</Badge>
            )}
          </div>
          <div className="flex-1">
            <Link to={`/books/${book.id}`} className="hover:text-primary transition-colors">
              <h3 className="line-clamp-2 text-xl font-black leading-tight transition-colors group-hover:text-primary">{book.title}</h3>
            </Link>
            {book.author && <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{book.author}</p>}
            {book.instructor_name && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar className="h-9 w-9 rounded-2xl border border-primary/15"><AvatarImage src={book.instructor_avatar_url ?? undefined} /><AvatarFallback className="bg-primary-soft text-primary">{book.instructor_name[0]}</AvatarFallback></Avatar>
                <span className="truncate font-bold text-foreground">{book.instructor_name}</span>
              </div>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-black text-primary">{formatPiastres(eff.amount)}</span>
            {eff.discountActive && (
              <span className="text-xs text-muted-foreground line-through">{formatPiastres(eff.originalAmount ?? 0)}</span>
            )}
          </div>
          <AddToCartButton bookId={book.id} bookType={book.book_type} stockQuantity={book.stock_quantity} fullWidth />
        </div>
      </Card>
    </motion.div>
  );
}

export default function Books() {
  const [books, setBooks] = useState<PublicBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [subjectId, setSubjectId] = useState<string>("all");
  const [stageId, setStageId] = useState<string>("all");

  usePageMeta("الكتب — منصة مستر محمد إبراهيم");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: bs }, { data: subs }, { data: stgs }] = await Promise.all([
        (supabase as any)
          .from("books")
          .select(
            "id,title,author,description,cover_image_url,book_type,price_piastres,discount_price_piastres,discount_expires_at,stock_quantity,subject_id,stage_id,created_by,subjects(name),stages(name)"
          )
          .eq("status", "published")
          .order("created_at", { ascending: false }),
        (supabase as any).from("subjects").select("id,name").order("name"),
        (supabase as any).from("stages").select("id,name").order("name"),
      ]);
      const rawBooks = (bs as any[]) ?? [];
      const creatorIds = [...new Set(rawBooks.map((b) => b.created_by).filter(Boolean))];
      let creators: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
      if (creatorIds.length) {
        const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
          "get_public_content_publishers",
          { _user_ids: creatorIds },
        );
        if (!rpcError) {
          creators = (rpcData ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[];
        } else {
          // Fallback إلى قراءة profiles مباشرةً إن فشلت الدالة (دون كسر الصفحة).
          try {
            const { data: fbData } = await (supabase as any)
              .from("profiles")
              .select("id, full_name, avatar_url")
              .in("id", creatorIds);
            creators = (fbData ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[];
          } catch {
            creators = [];
          }
        }
      }
      const creatorMap = new Map<string, { full_name: string | null; avatar_url: string | null }>(
        creators.map((p) => [p.id, p]),
      );
      setBooks(rawBooks.map((b: any) => ({
        ...b,
        instructor_name: creatorMap.get(b.created_by)?.full_name ?? null,
        instructor_avatar_url: creatorMap.get(b.created_by)?.avatar_url ?? null,
      })));
      setSubjects((subs as any) ?? []);
      setStages((stgs as any) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter((b) => {
      if (type !== "all" && b.book_type !== type) return false;
      if (subjectId !== "all" && b.subject_id !== subjectId) return false;
      if (stageId !== "all" && b.stage_id !== stageId) return false;
      if (q && !`${b.title} ${b.author ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [books, search, type, subjectId, stageId]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-16">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">مكتبة الكتب</h1>
            <p className="text-sm text-muted-foreground">اطّلع على أحدث الكتب الرقمية والمطبوعة</p>
          </div>
        </motion.div>

        <Card className="p-4 md:p-5 mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ابحث بالعنوان أو المؤلف…" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue placeholder="النوع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="digital">رقمي</SelectItem>
              <SelectItem value="physical">مطبوع</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder="المادة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواد</SelectItem>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger><SelectValue placeholder="المرحلة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المراحل</SelectItem>
                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">لا توجد كتب مطابقة</Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
            <AnimatePresence>
              {filtered.map((b, i) => (
                <BookCard key={b.id} book={b} delay={Math.min(i * 0.03, 0.3)} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
