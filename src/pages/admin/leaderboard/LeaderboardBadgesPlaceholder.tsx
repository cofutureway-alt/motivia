import { Award, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function LeaderboardBadgesPlaceholder() {
  return (
    <Card className="p-10 text-center space-y-3">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
        <Award className="w-8 h-8 text-amber-500" />
      </div>
      <h3 className="text-xl font-bold flex items-center justify-center gap-2">
        الشارات <Sparkles className="w-5 h-5 text-amber-500" />
      </h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        نظام الشارات قادم في المرحلة القادمة. سيتم بناؤه فوق نظام النقاط الحالي.
      </p>
    </Card>
  );
}
