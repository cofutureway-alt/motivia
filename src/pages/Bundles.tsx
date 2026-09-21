import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Package } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BundleCard } from "@/components/BundleCard";
import { usePublicBundles } from "@/hooks/use-public-bundles";
import { EightPointStar } from "@/components/IslamicPatterns";

const Bundles = () => {
  const bundles = usePublicBundles();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!bundles) return null;
    if (!query) return bundles;
    const q = query.toLowerCase();
    return bundles.filter((b) => b.title.toLowerCase().includes(q));
  }, [bundles, query]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-16 relative overflow-hidden">
        <EightPointStar size={80} className="absolute top-24 left-8 text-primary/5 animate-spin-slow pointer-events-none" />
        <div className="container mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="text-3xl md:text-5xl font-bold text-foreground">حزم الدورات</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              احصل على عدة دورات معًا بسعر أفضل من شرائها منفصلة.
            </p>
          </motion.div>

          <div className="relative max-w-md mb-8">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن حزمة..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pr-10 h-11"
            />
          </div>

          {bundles === null ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border overflow-hidden">
                  <Skeleton className="h-44 w-full" />
                  <div className="p-5 space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((b, i) => (
                <BundleCard key={b.id} bundle={b} index={i} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-border p-16 text-center max-w-lg mx-auto">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                <Package className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">
                {bundles.length === 0 ? "لا توجد حزم منشورة بعد" : "لا توجد نتائج مطابقة"}
              </h2>
              <p className="text-muted-foreground">
                {bundles.length === 0 ? "سنضيف الحزم قريبًا." : "جرّب كلمات بحث أخرى."}
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Bundles;
