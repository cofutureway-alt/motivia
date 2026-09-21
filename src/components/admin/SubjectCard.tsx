import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { BookMarked, Pencil, Trash2, ImageOff } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SubjectRow } from "./SubjectFormModal";

interface Props {
  subject: SubjectRow & { courses_count: number };
  onEdit: () => void;
  onDelete: () => void;
}

const SubjectCard = ({ subject, onEdit, onDelete }: Props) => {
  const signed = useSignedThumbnail(subject.thumbnail_url);

  return (
    <motion.div
      layout
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card hover:shadow-xl hover:shadow-primary/5 hover:border-primary/40 transition-all"
    >
      <div className="relative aspect-video bg-gradient-to-br from-primary/10 via-accent/50 to-primary/5 overflow-hidden">
        {signed ? (
          <img
            src={signed}
            alt={subject.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            {subject.thumbnail_url ? (
              <div className="w-10 h-10 rounded-full border-2 border-current border-t-transparent animate-spin opacity-30" />
            ) : (
              <ImageOff className="w-10 h-10 opacity-40" />
            )}
          </div>
        )}
        <div className="absolute top-3 right-3">
          <Badge className="bg-background/90 text-foreground hover:bg-background border-0 shadow gap-1.5">
            <BookMarked className="w-3 h-3" />
            {subject.courses_count} دورات
          </Badge>
        </div>
      </div>

      <div className="p-5">
        <h3 className="font-bold text-lg text-foreground mb-1 line-clamp-1">
          {subject.name}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {subject.description || "بدون وصف"}
        </p>

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/60">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
            <Pencil className="w-4 h-4 ml-2" />
            تعديل
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

export default SubjectCard;
