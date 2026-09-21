import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Lock, PlayCircle, ClipboardList, HelpCircle, Tag } from 'lucide-react';
import { useSignedThumbnail } from '@/hooks/use-signed-thumbnail';
import type { PublicCourse } from '@/hooks/use-public-courses';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatPiastres, getEffectiveCoursePrice } from '@/lib/money';
import { ComingSoonBadge, ComingSoonCountdown } from '@/components/ComingSoon';

interface Props {
  course: PublicCourse;
  index?: number;
  progress?: number | null;
}

export const CourseCard = forwardRef<HTMLDivElement, Props>(function CourseCard({
  course,
  index = 0,
  progress,
}: Props, ref) {
  const thumb = useSignedThumbnail(course.thumbnail_url);
  const price = getEffectiveCoursePrice(course);
  const isComingSoon = course.status === "coming_soon";
  const completed = progress === 100;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index, 6) * 0.06 }}
      whileHover={{ y: -6 }}
    >
      <Link
        to={`/courses/${course.id}`}
        className="group block h-full overflow-hidden rounded-3xl border border-border/70 bg-card shadow-subtle transition-all duration-500 hover:-translate-y-2 hover:border-primary/40 hover:shadow-soft"
      >
        {/* Cover */}
        <div className="relative aspect-video overflow-hidden bg-muted">
          {thumb ? (
            <img
              src={thumb}
              alt={course.title}
              loading="lazy"
              className={
                "h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035] " +
                (isComingSoon ? "grayscale-[35%]" : "")
              }
            />
          ) : (
            /* Branded placeholder for courses without a cover — solid tint */
            <div className="relative flex h-full w-full items-center justify-center bg-primary-soft">
              <BookOpen size={56} className="text-primary/30 transition-colors duration-500 group-hover:text-primary/60" />
            </div>
          )}

          {/* Bottom edge line — solid accent */}
          <div className="absolute inset-x-0 bottom-0 h-1 bg-primary/70" />

          {/* Top badges */}
          <div className="absolute top-3 inset-x-3 flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {isComingSoon && <ComingSoonBadge />}
            </div>
            <div className="flex flex-wrap gap-1.5 justify-end">
              {course.stage_name && (
                <span className="rounded-full border border-border bg-background/90 px-3 py-1 text-[11px] font-bold text-foreground shadow-sm backdrop-blur">
                  {course.stage_name}
                </span>
              )}
              {course.subject_name && (
                <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground shadow-sm">
                  {course.subject_name}
                </span>
              )}
            </div>
          </div>

          {/* Play hint on hover (desktop) */}
          <div className="absolute inset-0 hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="w-14 h-14 rounded-full bg-background/90 backdrop-blur shadow-xl flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-300">
              <PlayCircle className="w-7 h-7 text-primary" />
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col p-5">
          <h3 className="line-clamp-2 text-xl font-black leading-tight text-foreground transition-colors group-hover:text-primary">
            {course.title}
          </h3>
          {course.instructor_name && (
            <div className="mt-4 flex items-center gap-3 mb-3 shrink-0">
              <Avatar className="h-10 w-10 rounded-full border-2 border-primary/20 bg-primary/5">
                <AvatarImage src={course.instructor_avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary/5 text-primary font-bold text-sm">
                  {course.instructor_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-bold text-foreground">{course.instructor_name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {course.subject_name || 'معلم'}
                </p>
              </div>
            </div>
          )}

          {/* Meta row — only meaningful counts */}
          <div className="mb-3 mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
              {course.lessons_count} درس
            </span>
            {course.quizzes_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <ClipboardList className="h-3.5 w-3.5 text-primary" />
                {course.quizzes_count} اختبار
              </span>
            )}
            {course.assignments_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5 text-primary" />
                {course.assignments_count} واجب
              </span>
            )}
          </div>

          <p className="min-h-[2.5rem] line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {course.description || "دورة تعليمية على المنصة"}
          </p>

          {isComingSoon && course.scheduled_publish_at && (
            <div className="mt-4">
              <ComingSoonCountdown target={course.scheduled_publish_at} />
            </div>
          )}

          {typeof progress === "number" && !isComingSoon && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>تقدّمك</span>
                <span className="font-semibold text-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}

          {/* Footer: price + CTA */}
          <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
            <div className="flex flex-col">
              {isComingSoon ? (
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  قريبًا
                </span>
              ) : price.isFree ? (
                  <span className="text-base font-extrabold text-primary">
                  مجانًا
                </span>
              ) : price.discountActive && price.originalAmount !== null ? (
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-lg font-black text-primary">
                    {formatPiastres(price.amount)}
                  </span>
                  <span className="text-xs text-muted-foreground line-through">
                    {formatPiastres(price.originalAmount)}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive">
                    <Tag className="w-2.5 h-2.5" />
                    خصم
                  </span>
                </div>
              ) : (
                <span className="text-lg font-black text-foreground">
                  {formatPiastres(price.amount)}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              tabIndex={-1}
              className={
                "rounded-xl gap-1.5 font-bold transition-all duration-300 " +
                (isComingSoon
                  ? "text-muted-foreground"
                  : "group-hover:bg-primary group-hover:text-primary-foreground")
              }
            >
              {isComingSoon ? (
                <>
                  <Lock className="w-4 h-4" />
                  التفاصيل
                </>
              ) : (
                <>
                  ابدأ الآن
                  <ArrowLeft className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

export default CourseCard;
