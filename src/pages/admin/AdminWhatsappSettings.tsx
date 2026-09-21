import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Key,
  ShieldCheck,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Save,
  Search,
  Sliders,
  Radio,
  FileText,
  RotateCw,
  Eye,
  EyeOff,
  User,
  Users,
  ShieldAlert,
  CheckCheck,
  Power,
  SendHorizontal,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { EightPointStar } from "@/components/IslamicPatterns";
import {
  fetchWhatsappSettings,
  saveWhatsappSettings,
  fetchWhatsappInstances,
  addWhatsappInstance,
  toggleWhatsappInstanceActive,
  deleteWhatsappInstance,
  fetchNotificationChannels,
  toggleChannelWhatsapp,
  fetchMessageTemplates,
  updateMessageTemplate,
  triggerWhatsappDispatcher,
  sendWhatsappTestMessage,
  type WhatsappInstance,
  type WhatsappSettings,
  type WhatsappSecrets,
  type NotificationTypeChannel,
  type WhatsappMessageTemplate,
} from "@/lib/whatsapp-api";

export type RoleCategory = "all" | "student" | "parent" | "admin";

export interface ChannelMeta {
  type: string;
  titleAr: string;
  role: "student" | "parent" | "admin";
  descriptionAr: string;
}

export const CHANNEL_META_MAP: Record<string, ChannelMeta> = {
  // Student Notifications
  course_published: { type: "course_published", titleAr: "نشر دورة جديدة لمرحلتك", role: "student", descriptionAr: "إشعار الطالب عند نشر كورس جديد لمرحلته الدراسية" },
  lesson_added: { type: "lesson_added", titleAr: "إضافة درس جديد", role: "student", descriptionAr: "إشعار الطالب المشترك عند إضافة درس جديد" },
  quiz_added: { type: "quiz_added", titleAr: "إضافة اختبار جديد", role: "student", descriptionAr: "إشعار الطالب المشترك عند إضافة اختبار جديد" },
  assignment_added: { type: "assignment_added", titleAr: "إضافة واجب جديد", role: "student", descriptionAr: "إشعار الطالب المشترك عند إضافة واجب جديد" },
  quiz_graded: { type: "quiz_graded", titleAr: "تصحيح نتيجة اختبار", role: "student", descriptionAr: "إشعار الطالب بنتيجة الاختبار والدرجة" },
  assignment_graded: { type: "assignment_graded", titleAr: "تقييم نتيجة واجب", role: "student", descriptionAr: "إشعار الطالب بنتيجة تقييم الواجب" },
  assignment_feedback: { type: "assignment_feedback", titleAr: "ملاحظات المعلم على الواجب", role: "student", descriptionAr: "إشعار الطالب عند كتابة المعلم لملاحظات" },
  course_purchased: { type: "course_purchased", titleAr: "تأكيد تفعيل كورس", role: "student", descriptionAr: "إشعار الطالب عند نجاح شراء/تفعيل كورس" },
  bundle_purchased: { type: "bundle_purchased", titleAr: "تأكيد تفعيل باقة", role: "student", descriptionAr: "إشعار الطالب عند نجاح شراء/تفعيل باقة" },
  book_order_created: { type: "book_order_created", titleAr: "إنشاء طلب كتاب", role: "student", descriptionAr: "إشعار الطالب بتأكيد استلام طلب الكتاب" },
  book_order_status_changed: { type: "book_order_status_changed", titleAr: "تحديث حالة طلب كتاب", role: "student", descriptionAr: "إشعار الطالب بتغير حالة شحن/تسليم الكتاب" },
  wallet_transaction: { type: "wallet_transaction", titleAr: "معاملات المحفظة والشحن", role: "student", descriptionAr: "إشعار الطالب بحركات المحفظة والشحن" },
  refund_status_changed: { type: "refund_status_changed", titleAr: "تحديث حالة طلب الاسترجاع", role: "student", descriptionAr: "إشعار الطالب بقبول/رفض طلب الاسترجاع" },
  badge_earned: { type: "badge_earned", titleAr: "الحصول على وسام جديد", role: "student", descriptionAr: "إشعار الطالب فور كسب وسام إنجاز" },
  level_up: { type: "level_up", titleAr: "الارتقاء لمستوى جديد", role: "student", descriptionAr: "إشعار الطالب فور ارتقائه لمستوى أعلى" },
  leaderboard_top10: { type: "leaderboard_top10", titleAr: "الوصول للائحة الأوائل", role: "student", descriptionAr: "إشعار الطالب عند دخوله قائمة التوب 10" },
  account_banned: { type: "account_banned", titleAr: "تنبيه حظر الحساب", role: "student", descriptionAr: "إشعار المستخدم في حال حظر حسابه" },
  payment_proof_rejected: { type: "payment_proof_rejected", titleAr: "رفض إثبات الدفع اليدوي", role: "student", descriptionAr: "إشعار الطالب عند رفض إثبات الدفع مع رقم الدعم" },

  // Parent Notifications
  parent_lesson_completed: { type: "parent_lesson_completed", titleAr: "إكمال الطالب لدرس", role: "parent", descriptionAr: "إشعار ولي الأمر عند إكمال ابنه لدرس تعليمي" },
  parent_quiz_graded: { type: "parent_quiz_graded", titleAr: "نتيجة اختبار الطالب", role: "parent", descriptionAr: "إشعار ولي الأمر بدرجة ابنه في الاختبار" },
  parent_assignment_graded: { type: "parent_assignment_graded", titleAr: "نتيجة واجب الطالب", role: "parent", descriptionAr: "إشعار ولي الأمر بنتيجة تقييم واجب ابنه" },
  parent_badge_earned: { type: "parent_badge_earned", titleAr: "حصول الطالب على وسام", role: "parent", descriptionAr: "إشعار ولي الأمر عند حصول ابنه على وسام" },
  parent_leaderboard_top10: { type: "parent_leaderboard_top10", titleAr: "وصول الطالب للائحة الأوائل", role: "parent", descriptionAr: "إشعار ولي الأمر عند وصول ابنه لقائمة الأوائل" },
  parent_course_purchased: { type: "parent_course_purchased", titleAr: "تفعيل كورس للطالب", role: "parent", descriptionAr: "إشعار ولي الأمر عند تفعيل كورس لابنه" },
  parent_bundle_purchased: { type: "parent_bundle_purchased", titleAr: "تفعيل باقة للطالب", role: "parent", descriptionAr: "إشعار ولي الأمر عند تفعيل باقة لابنه" },
  parent_wallet_topup: { type: "parent_wallet_topup", titleAr: "شحن محفظة الطالب", role: "parent", descriptionAr: "إشعار ولي الأمر عند شحن محفظة ابنه" },

  // Admin Notifications
  admin_payment_proof_submitted: { type: "admin_payment_proof_submitted", titleAr: "إثبات دفع يدوي جديد", role: "admin", descriptionAr: "إشعار الإدارة فور رفع الطالب لإثبات دفع يدوي" },
  admin_refund_request: { type: "admin_refund_request", titleAr: "طلب استرجاع جديد", role: "admin", descriptionAr: "إشعار الإدارة فور تقديم طلب استرجاع" },
  admin_parent_link_request: { type: "admin_parent_link_request", titleAr: "طلب ربط ولي أمر جديد", role: "admin", descriptionAr: "إشعار الإدارة فور إرسال ولي الأمر لطلب ربط" },
  assignment_submitted: { type: "assignment_submitted", titleAr: "تسليم واجب جديد", role: "admin", descriptionAr: "إشعار الإدارة بتسليم طالب لواجب يحتاج تقييم" },
  quiz_needs_review: { type: "quiz_needs_review", titleAr: "اختبار يتطلب مراجعة مقالية", role: "admin", descriptionAr: "إشعار الإدارة بمحاولة اختبار تحتوي أسئلة مقالية" },
  admin_new_book_order: { type: "admin_new_book_order", titleAr: "طلب كتاب جديد", role: "admin", descriptionAr: "إشعار الإدارة عند قيام طالب بطلب كتاب ورقي" },
};

export default function AdminWhatsappSettings() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Form State
  const [settings, setSettings] = useState<WhatsappSettings>({
    rate_limit_min_seconds: 240,
    rate_limit_max_seconds: 360,
  });
  const [secrets, setSecrets] = useState<WhatsappSecrets>({
    api_key: "",
    webhook_secret: "",
  });

  // Instances State
  const [instances, setInstances] = useState<WhatsappInstance[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newInstanceLabel, setNewInstanceLabel] = useState("");
  const [newInstanceId, setNewInstanceId] = useState("");
  const [newInstancePhone, setNewInstancePhone] = useState("");
  const [addingInstance, setAddingInstance] = useState(false);

  // Test Message State
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testInstance, setTestInstance] = useState<WhatsappInstance | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessageBody, setTestMessageBody] = useState("هذه رسالة اختبار من المنصة التعليمية.");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ uuid: string; status: string; recipient_number: string } | null>(null);

  // Channels State
  const [channels, setChannels] = useState<NotificationTypeChannel[]>([]);
  const [channelSearch, setChannelSearch] = useState("");
  const [selectedRoleCategory, setSelectedRoleCategory] = useState<RoleCategory>("all");

  // Templates State
  const [templates, setTemplates] = useState<WhatsappMessageTemplate[]>([]);
  const [selectedTypeForTemplate, setSelectedTypeForTemplate] = useState<string>("course_published");
  const [editingTemplateVariant, setEditingTemplateVariant] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, insts, chs, tmpls] = await Promise.all([
        fetchWhatsappSettings(),
        fetchWhatsappInstances(),
        fetchNotificationChannels(),
        fetchMessageTemplates(),
      ]);
      setSettings(s.settings);
      setSecrets(s.secrets);
      setInstances(insts);
      setChannels(chs);
      setTemplates(tmpls);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل إعدادات واتساب");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await saveWhatsappSettings(settings, secrets);
      toast.success("تم حفظ إعدادات المفاتيح ومعدل الإرسال بنجاح");
    } catch (e: any) {
      toast.error(e?.message || "فشل حفظ الإعدادات");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddInstance = async () => {
    if (!newInstanceId.trim() || !newInstanceLabel.trim() || !newInstancePhone.trim()) {
      toast.error("يرجى ملء جميع الحقول المطلوب إدخالها");
      return;
    }
    setAddingInstance(true);
    try {
      const created = await addWhatsappInstance({
        rasvio_instance_id: newInstanceId,
        label: newInstanceLabel,
        phone_number: newInstancePhone,
      });
      setInstances((prev) => [created, ...prev]);
      toast.success("تم إضافة رقم واتساب بنجاح");
      setNewInstanceId("");
      setNewInstanceLabel("");
      setNewInstancePhone("");
      setAddModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر إضافة الرقم");
    } finally {
      setAddingInstance(false);
    }
  };

  const handleToggleInstance = async (id: string, current: boolean) => {
    try {
      await toggleWhatsappInstanceActive(id, !current);
      setInstances((prev) =>
        prev.map((ins) => (ins.id === id ? { ...ins, is_active: !current } : ins))
      );
      toast.success(current ? "تم إيقاف تفعيل الرقم" : "تم تفعيل الرقم للإرسال");
    } catch {
      toast.error("فشل تغيير حالة الرقم");
    }
  };

  const handleDeleteInstance = async (id: string) => {
    if (!confirm("هل أنت أصل من حذف هذا الرقم من المنصة؟")) return;
    try {
      await deleteWhatsappInstance(id);
      setInstances((prev) => prev.filter((i) => i.id !== id));
      toast.success("تم حذف الرقم بنجاح");
    } catch {
      toast.error("فشل حذف الرقم");
    }
  };

  const handleToggleChannel = async (type: string, current: boolean) => {
    try {
      await toggleChannelWhatsapp(type, !current);
      setChannels((prev) =>
        prev.map((c) => (c.notification_type === type ? { ...c, whatsapp_enabled: !current } : c))
      );
      toast.success("تم تحديث حالة القناة");
    } catch {
      toast.error("فشل تحديث القناة");
    }
  };

  const handleBulkToggleRoleChannels = async (targetRole: RoleCategory, enable: boolean) => {
    const targets = channels.filter((c) => {
      const meta = CHANNEL_META_MAP[c.notification_type];
      const roleMatch = targetRole === "all" || meta?.role === targetRole;
      return roleMatch && c.whatsapp_enabled !== enable;
    });

    if (targets.length === 0) {
      toast.info("جميع القنوات المحددة بالحالة المطلوبة بالفعل");
      return;
    }

    try {
      await Promise.all(targets.map((t) => toggleChannelWhatsapp(t.notification_type, enable)));
      setChannels((prev) =>
        prev.map((c) => {
          const meta = CHANNEL_META_MAP[c.notification_type];
          if (targetRole === "all" || meta?.role === targetRole) {
            return { ...c, whatsapp_enabled: enable };
          }
          return c;
        })
      );
      toast.success(`تم ${enable ? "تفعيل" : "تعطيل"} جميع قنوات الإشعارات الفئة المحددة`);
    } catch {
      toast.error("حدث خطأ أثناء تحديث القنوات بالجملة");
    }
  };

  const handleSaveTemplateVariant = async (type: string, variant: number) => {
    try {
      await updateMessageTemplate(type, variant, editingText);
      setTemplates((prev) =>
        prev.map((t) =>
          t.notification_type === type && t.variant_index === variant
            ? { ...t, template_text: editingText }
            : t
        )
      );
      toast.success("تم حفظ نموذج الرسالة بنجاح");
      setEditingTemplateVariant(null);
    } catch {
      toast.error("فشل حفظ النموذج");
    }
  };

  const handleManualDispatch = async () => {
    try {
      const res = await triggerWhatsappDispatcher();
      toast.success(
        `تم تشغيل المعالجة: تم إرسال ${res.sent}، وتخطي ${res.skipped}`
      );
    } catch (e: any) {
      toast.error(e?.message || "فشل تشغيل المعالجة");
    }
  };

  const filteredChannels = channels.filter((ch) => {
    const meta = CHANNEL_META_MAP[ch.notification_type];
    const matchesSearch =
      ch.notification_type.toLowerCase().includes(channelSearch.toLowerCase()) ||
      (meta?.titleAr || "").toLowerCase().includes(channelSearch.toLowerCase()) ||
      (meta?.descriptionAr || "").toLowerCase().includes(channelSearch.toLowerCase());

    const matchesRole =
      selectedRoleCategory === "all" || meta?.role === selectedRoleCategory;

    return matchesSearch && matchesRole;
  });

  const countByRole = (role: "student" | "parent" | "admin") => {
    return channels.filter((c) => CHANNEL_META_MAP[c.notification_type]?.role === role).length;
  };

  const getRoleBadge = (role?: "student" | "parent" | "admin") => {
    switch (role) {
      case "student":
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-[10px] gap-1">
            <User className="w-3 h-3" /> إشعار طالب
          </Badge>
        );
      case "parent":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] gap-1">
            <Users className="w-3 h-3" /> إشعار ولي أمر
          </Badge>
        );
      case "admin":
        return (
          <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30 text-[10px] gap-1">
            <ShieldAlert className="w-3 h-3" /> إشعار إداري
          </Badge>
        );
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30 gap-1 text-[11px]">
            <CheckCircle2 className="w-3 h-3" /> متصل
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="secondary" className="gap-1 text-[11px]">
            <XCircle className="w-3 h-3 text-muted-foreground" /> غير متصل
          </Badge>
        );
      case "auth_failed":
        return (
          <Badge variant="destructive" className="gap-1 text-[11px]">
            <AlertCircle className="w-3 h-3" /> فشل المصادقة
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <Clock className="w-3 h-3" /> غير محدد
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-border/80 bg-card p-6 md:p-8 shadow-xl flex flex-wrap items-center justify-between gap-4"
      >
        <EightPointStar
          size={140}
          className="absolute -top-10 -left-10 text-emerald-600/[0.04] pointer-events-none"
        />

        <div className="flex items-center gap-3 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black">إعدادات إرسال واتساب (Rasvio)</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              ربط الأرقام، تفعيل إشعارات الطلاب وأولياء الأمور والإدارة، وتخصيص النماذج.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualDispatch}
            className="gap-1.5 text-xs"
          >
            <RotateCw className="w-4 h-4 text-emerald-600" />
            تشغيل المعالجة الآن
          </Button>
          <Button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            size="sm"
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="w-4 h-4" />
            حفظ التغييرات
          </Button>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="instances" className="space-y-6">
        <TabsList className="bg-card border border-border rounded-2xl p-1 w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="instances" className="gap-2 text-xs font-bold rounded-xl">
            <Radio className="w-4 h-4 text-emerald-600" />
            الأرقام المتصلة ({instances.length})
          </TabsTrigger>
          <TabsTrigger value="channels" className="gap-2 text-xs font-bold rounded-xl">
            <Sliders className="w-4 h-4 text-emerald-600" />
            قنوات الإشعارات (الطلاب / الأبناء / الأدمن)
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 text-xs font-bold rounded-xl">
            <FileText className="w-4 h-4 text-emerald-600" />
            نماذج الرسائل
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2 text-xs font-bold rounded-xl">
            <Key className="w-4 h-4 text-emerald-600" />
            المفاتيح ومعدل الإرسال
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Instances */}
        <TabsContent value="instances" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">أرقام واتساب المربوطة</h2>
              <p className="text-xs text-muted-foreground">
                يتم توزيع رسائل الإشعارات على جميع الأرقام المفعلة تلقائياً.
              </p>
            </div>
            <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Plus className="w-4 h-4" /> إضافة رقم جديد
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md" dir="rtl">
                <DialogHeader>
                  <DialogTitle className="text-lg font-bold">إضافة رقم واتساب جديد</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2 text-xs">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">معرف الرقم في Rasvio (Instance ID)</Label>
                    <Input
                      placeholder="مثال: A8F9C2B1"
                      value={newInstanceId}
                      onChange={(e) => setNewInstanceId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">اسم تعريف الرقم (مسمى إداري)</Label>
                    <Input
                      placeholder="مثال: الرقم الرئيسي للأدمن"
                      value={newInstanceLabel}
                      onChange={(e) => setNewInstanceLabel(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">رقم الهاتف المصاحب (للتوثيق)</Label>
                    <Input
                      placeholder="01012345678"
                      value={newInstancePhone}
                      onChange={(e) => setNewInstancePhone(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setAddModalOpen(false)}>
                    إلغاء
                  </Button>
                  <Button
                    onClick={handleAddInstance}
                    disabled={addingInstance}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    حفظ وتأكيد
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {instances.map((ins) => (
              <motion.div
                key={ins.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-border/80 bg-card p-5 space-y-4 shadow-sm relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-base">{ins.label}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {ins.phone_number}
                    </div>
                  </div>
                  {getStatusBadge(ins.connection_status)}
                </div>

                <div className="text-[11px] text-muted-foreground font-mono bg-secondary/40 rounded-xl p-2 flex items-center justify-between">
                  <span>Instance ID:</span>
                  <span className="font-bold text-foreground">{ins.rasvio_instance_id}</span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={ins.is_active}
                      onCheckedChange={() => handleToggleInstance(ins.id, ins.is_active)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {ins.is_active ? "مفعل للإرسال" : "متوقف"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTestInstance(ins);
                        setTestResult(null);
                        setTestRecipient("");
                        setTestMessageBody("هذه رسالة اختبار من المنصة التعليمية.");
                        setTestModalOpen(true);
                      }}
                      className="h-8 px-2 text-xs text-emerald-600 hover:bg-emerald-500/10 gap-1"
                      title="إرسال رسالة اختبار"
                    >
                      <SendHorizontal className="w-3.5 h-3.5" />
                      اختبار
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteInstance(ins.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}

            {instances.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-3xl space-y-2">
                <Radio className="w-8 h-8 mx-auto opacity-30" />
                <div className="font-bold">لا توجد أرقام متصلة حالياً</div>
                <p className="text-xs">اضغط على "إضافة رقم جديد" لربط أول رقم واتساب عبر Rasvio.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Test Message Dialog */}
        <Dialog open={testModalOpen} onOpenChange={(o) => { setTestModalOpen(o); if (!o) setTestResult(null); }}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <SendHorizontal className="w-4 h-4 text-emerald-600" />
                إرسال رسالة اختبار عبر واتساب
              </DialogTitle>
            </DialogHeader>

            {testInstance && (
              <div className="space-y-4 py-2 text-xs">
                {/* Instance Info */}
                <div className="bg-secondary/40 rounded-2xl p-3 space-y-1">
                  <div className="font-bold text-sm">{testInstance.label}</div>
                  <div className="font-mono text-muted-foreground">
                    Instance ID: <span className="text-foreground font-bold">{testInstance.rasvio_instance_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(testInstance.connection_status)}
                  </div>
                </div>

                {/* Recipient */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">رقم المستلم (E.164 مثل: +201012345678)</Label>
                  <Input
                    placeholder="+201012345678"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    className="font-mono text-xs"
                    disabled={sendingTest}
                  />
                </div>

                {/* Message Body */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">نص الرسالة</Label>
                  <textarea
                    rows={3}
                    value={testMessageBody}
                    onChange={(e) => setTestMessageBody(e.target.value)}
                    disabled={sendingTest}
                    className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:ring-1 focus:ring-primary outline-none resize-none"
                  />
                </div>

                {/* Result */}
                {testResult && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                    <div className="font-bold text-emerald-600 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> تم إرسال الرسالة بنجاح
                    </div>
                    <div className="text-muted-foreground font-mono text-[11px] space-y-0.5">
                      <div>UUID: <span className="text-foreground">{testResult.uuid}</span></div>
                      <div>الحالة: <span className="text-foreground">{testResult.status}</span></div>
                      <div>المستلم: <span className="text-foreground">{testResult.recipient_number}</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setTestModalOpen(false)} disabled={sendingTest}>
                إغلاق
              </Button>
              <Button
                disabled={sendingTest || !testRecipient.trim() || !testMessageBody.trim()}
                onClick={async () => {
                  if (!testInstance) return;
                  setSendingTest(true);
                  setTestResult(null);
                  try {
                    const result = await sendWhatsappTestMessage({
                      instance_id: testInstance.rasvio_instance_id,
                      recipient: testRecipient.trim(),
                      message_body: testMessageBody.trim(),
                    });
                    setTestResult(result);
                    toast.success("تم إرسال رسالة الاختبار بنجاح");
                  } catch (e: any) {
                    toast.error(e?.message || "فشل إرسال الرسالة");
                  } finally {
                    setSendingTest(false);
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {sendingTest ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جاري الإرسال...</>
                ) : (
                  <><SendHorizontal className="w-4 h-4" /> إرسال الآن</>               
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tab 2: Channels (Student, Parent, Admin Categories) */}
        <TabsContent value="channels" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">إدارة تيار إشعارات واتساب حسب الأدوار</h2>
              <p className="text-xs text-muted-foreground">
                قم بالتحكم في تفعيل أو إيقاف إرسال واتساب لكل فئة من مستخدمي المنصة (الطلاب، أولياء الأمور، والإدارة).
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="بحث باسم الإشعار..."
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                className="pr-9 text-xs"
              />
            </div>
          </div>

          {/* Role Filter Buttons Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant={selectedRoleCategory === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedRoleCategory("all")}
                className="text-xs rounded-xl"
              >
                جميع القنوات ({channels.length})
              </Button>
              <Button
                variant={selectedRoleCategory === "student" ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedRoleCategory("student")}
                className="text-xs rounded-xl gap-1.5"
              >
                <User className="w-3.5 h-3.5" />
                إشعارات الطلاب ({countByRole("student")})
              </Button>
              <Button
                variant={selectedRoleCategory === "parent" ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedRoleCategory("parent")}
                className="text-xs rounded-xl gap-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                إشعارات أولياء الأمور ({countByRole("parent")})
              </Button>
              <Button
                variant={selectedRoleCategory === "admin" ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedRoleCategory("admin")}
                className="text-xs rounded-xl gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                إشعارات الإدارة ({countByRole("admin")})
              </Button>
            </div>

            {/* Bulk Action Buttons for active category */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkToggleRoleChannels(selectedRoleCategory, true)}
                className="gap-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30"
              >
                <CheckCheck className="w-3.5 h-3.5" /> تفعيل الكل
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkToggleRoleChannels(selectedRoleCategory, false)}
                className="gap-1 text-xs text-destructive hover:bg-destructive/10"
              >
                <Power className="w-3.5 h-3.5" /> تعطيل الكل
              </Button>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredChannels.map((ch) => {
              const meta = CHANNEL_META_MAP[ch.notification_type] || {
                type: ch.notification_type,
                titleAr: ch.notification_type,
                role: "student",
                descriptionAr: "إرسال واتساب تلقائي",
              };

              return (
                <div
                  key={ch.notification_type}
                  className={`p-4 rounded-2xl border transition-all shadow-sm space-y-3 ${
                    ch.whatsapp_enabled
                      ? "border-emerald-500/30 bg-card hover:border-emerald-500/60"
                      : "border-border/70 bg-card/60 opacity-80 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="font-bold text-sm text-foreground">
                        {meta.titleAr}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getRoleBadge(meta.role)}
                        <span className="text-[10px] font-mono text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                          {ch.notification_type}
                        </span>
                      </div>
                    </div>

                    <Switch
                      checked={ch.whatsapp_enabled}
                      onCheckedChange={() => handleToggleChannel(ch.notification_type, ch.whatsapp_enabled)}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {meta.descriptionAr}
                  </p>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 3: Templates */}
        <TabsContent value="templates" className="space-y-4">
          <div>
            <h2 className="text-lg font-bold">نماذج الرسائل المتعددة (Anti-Spam Variants)</h2>
            <p className="text-xs text-muted-foreground">
              لكل نوع إشعار توجد 4 صيغ مختلفة يتم الاختيار بينها عشوائياً عند الإرسال لمنع حظر الرقم.
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {channels.map((c) => (
              <Button
                key={c.notification_type}
                variant={selectedTypeForTemplate === c.notification_type ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTypeForTemplate(c.notification_type)}
                className="text-xs shrink-0 font-mono"
              >
                {CHANNEL_META_MAP[c.notification_type]?.titleAr || c.notification_type}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => {
              const tmpl = templates.find(
                (t) => t.notification_type === selectedTypeForTemplate && t.variant_index === idx
              );
              const isEditing = editingTemplateVariant === idx;

              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[11px] font-bold">
                      الصيغة #{idx + 1}
                    </Badge>
                    {!isEditing ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingTemplateVariant(idx);
                          setEditingText(tmpl?.template_text || "");
                        }}
                        className="text-xs h-7"
                      >
                        تعديل
                      </Button>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingTemplateVariant(null)}
                          className="text-xs h-7"
                        >
                          إلغاء
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveTemplateVariant(selectedTypeForTemplate, idx)}
                          className="text-xs h-7 bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          حفظ
                        </Button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <textarea
                      rows={3}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  ) : (
                    <p className="text-xs leading-relaxed text-foreground bg-secondary/30 p-3 rounded-xl min-h-[4rem]">
                      {tmpl?.template_text || "لا يوجد نموذج معرف لهذه الصيغة بعد."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 4: Config & Rate Limit */}
        <TabsContent value="config" className="space-y-6 max-w-2xl">
          <div className="rounded-3xl border border-border bg-card p-6 space-y-6 shadow-sm">
            <div className="space-y-1">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-600" /> مفاتيح الربط ورأس الهيدر (Rasvio API Keys)
              </h3>
              <p className="text-xs text-muted-foreground">
                المفاتيح السرية الحساسة للمصادقة وتأكيد التوقيع الترددي (Webhook HMAC).
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">مفتاح API الخاص بـ Rasvio (API Key)</Label>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={secrets.api_key}
                    onChange={(e) => setSecrets((prev) => ({ ...prev, api_key: e.target.value }))}
                    placeholder="أدخل API Key الخارجي"
                    className="pr-10 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">مفتاح توقيع الويب هوك (Webhook Signing Secret)</Label>
                <Input
                  type="password"
                  value={secrets.webhook_secret}
                  onChange={(e) => setSecrets((prev) => ({ ...prev, webhook_secret: e.target.value }))}
                  placeholder="أدخل Webhook Secret المخصص لتأكيد التوقيع"
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-border/60 space-y-4">
              <div className="space-y-1">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" /> مهلة الأمان والتبريد الترددي (Randomized Cooldown)
                </h3>
                <p className="text-xs text-muted-foreground">
                  تحديد الحد الأدنى والأقصى بالثواني للفاصل الزمني العشوائي بين الرسائل المتتالية لنفس رقم المستلم.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">الحد الأدنى للمهلة (ثواني)</Label>
                  <Input
                    type="number"
                    value={settings.rate_limit_min_seconds}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, rate_limit_min_seconds: Number(e.target.value) }))
                    }
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">الحد الأقصى للمهلة (ثواني)</Label>
                  <Input
                    type="number"
                    value={settings.rate_limit_max_seconds}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, rate_limit_max_seconds: Number(e.target.value) }))
                    }
                    className="text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              <Save className="w-4 h-4" /> حفظ الإعدادات السرية والمعدل
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
