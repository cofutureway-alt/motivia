import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Package, ArrowLeft, Tag, BookOpen, Star } from "lucide-react";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { EightPointStar } from "@/components/IslamicPatterns";
import { Button } from "@/components/ui/button";
import { formatPiastres } from "@/lib/money";
import type { PublicBundle } from "@/hooks/use-public-bundles";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Props {
  bundle: PublicBundle;
  index?: number;
}

export const BundleCard = ({ bundle, index = 0 }: Props) => {
  const thumb = useSignedThumbnail(bundle.cover_image_url);
  const now = Date.now();
  const discountActive =
    bundle.is_paid &&
    bundle.discount_price_piastres !== null &&
    (!bundle.discount_expires_at || new Date(bundle.discount_expires_at).getTime() > now);
  const effective = !bundle.is_paid
    ? 0
    : discountActive
      ? bundle.discount_price_piastres!
      : bundle.price_piastres ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: index * 0.07 }}
      whileHover={{ y: -6 }}
    >
      <Link
        to={`/bundles/${bundle.id}`}
        className="group block h-full rounded-2xl border border-border bg-card overflow-hidden shadow-md hover:shadow-2xl hover:border-primary/40 transition-all"
      >
        <div className="relative h-44 overflow-hidden bg-accent">
          {thumb ? (
            <img
              src={thumb}
              alt={bundle.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Package className="w-10 h-10 opacity-30" />
            </div>
          )}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full bg-primary/95 backdrop-blur text-primary-foreground shadow">
              <Package className="w-3 h-3" /> حزمة
            </span>
            {bundle.is_featured && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full bg-amber-500/95 text-white shadow">
                <Star className="w-3 h-3 fill-current" /> مميزة
              </span>
            )}
          </div>
          <EightPointStar
            size={36}
            className="absolute bottom-3 left-3 text-primary-foreground/70 opacity-70"
          />
        </div>

        <div className="p-5">
          <h3 className="text-lg font-bold text-foreground mb-2 line-clamp-1">{bundle.title}</h3>
          {bundle.instructor_name && (
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <Avatar className="w-6 h-6"><AvatarImage src={bundle.instructor_avatar_url ?? undefined} /><AvatarFallback>{bundle.instructor_name[0]}</AvatarFallback></Avatar>
              <span className="truncate">{bundle.instructor_name}</span>
            </div>
          )}
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem] mb-4">
            {bundle.description || "حزمة دورات بسعر مخفّض"}
          </p>

          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pt-4 border-t border-border">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              {bundle.courses_count} دورة
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex flex-col">
              {!bundle.is_paid ? (
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">مجانًا</span>
              ) : discountActive && bundle.price_piastres !== null ? (
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-extrabold text-primary">{formatPiastres(effective)}</span>
                  <span className="text-[11px] text-muted-foreground line-through">
                    {formatPiastres(bundle.price_piastres)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    <Tag className="w-3 h-3" /> خصم
                  </span>
                </div>
              ) : (
                <span className="text-base font-extrabold text-foreground">{formatPiastres(effective)}</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
            >
              عرض الحزمة
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export default BundleCard;
