import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  usePlatformSettings,
  invalidatePlatformSettingsCache,
  notifyPlatformSettingsListeners,
} from "@/hooks/use-platform-settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChatbotAnalytics from "@/components/admin/ChatbotAnalytics";
import {
  MessageCircle,
  Plug,
  ListChecks,
  FlaskConical,
  Loader2,
  CheckCircle2,
  XCircle,
  BarChart3,
  Settings2,
  Gauge,
} from "lucide-react";
import {
  saveChatbotSettings,
  getChatbotSettings,
  fetchChatbotModels,
  testChatbotModel,
} from "@/lib/chat-api";

const AdminChatbotSettings = () => {
  const { settings } = usePlatformSettings();

  const [chatbotEnabled, setChatbotEnabled] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);

  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);

  const [siteUrl, setSiteUrl] = useState("https://motivai-edu.online");
  const [rateMessages, setRateMessages] = useState("50");
  const [rateHours, setRateHours] = useState("3");
  const [guestRateMessages, setGuestRateMessages] = useState("50");
  const [guestRateHours, setGuestRateHours] = useState("3");

  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setChatbotEnabled(settings.chatbot_enabled === true);
  }, [settings.chatbot_enabled]);

  useEffect(() => {
    getChatbotSettings()
      .then((s) => {
        if (s) {
          setProviderName(s.provider_name || "");
          setBaseUrl(s.base_url);
          setModel(s.model);
          setHasApiKey(s.has_api_key);
          setMaskedKey(s.api_key_masked);
          setSiteUrl(s.site_url || "https://motivai-edu.online");
          setRateMessages(String(s.rate_limit_messages ?? 50));
          setRateHours(String(s.rate_limit_hours ?? 3));
          setGuestRateMessages(String(s.rate_limit_guest_messages ?? 50));
          setGuestRateHours(String(s.rate_limit_guest_hours ?? 3));
        }
      })
      .catch((e) => toast.error(e?.message || "تعذر تحميل إعدادات الشات"));
  }, []);

  const handleToggle = async (next: boolean) => {
    try {
      const { error } = await (supabase as any)
        .from("platform_settings")
        .update({ chatbot_enabled: next })
        .eq("id", 1);
      if (error) throw error;
      setChatbotEnabled(next);
      toast.success(next ? "تم تشغيل الشات" : "تم إيقاف الشات");
    } catch (e: any) {
      toast.error(e?.message || "تعذر الحفظ");
    }
  };

  const handleFetchModels = async () => {
    if (!baseUrl.trim()) {
      toast.error("اكتب الـ Base URL الأول");
      return;
    }
    setFetchingModels(true);
    try {
      const list = await fetchChatbotModels(baseUrl.trim(), apiKey.trim() || undefined);
      setModels(list);
      if (!list.length) toast.error("المزود رجع قايمة موديلات فاضية");
      else toast.success(`تم جلب ${list.length} موديل`);
    } catch (e: any) {
      toast.error(e?.message || "تعذر جلب الموديلات");
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testChatbotModel();
      if (res.ok) {
        setTestResult({
          ok: true,
          text: `الموديل شغال — زمن الاستجابة ${res.latency_ms ?? 0} ملي ثانية`,
        });
      } else {
        setTestResult({ ok: false, text: res.error || "فشلت التجربة" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, text: e?.message || "تعذر تجربة الموديل" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      toast.error("الـ Base URL والموديل مطلوبين");
      return;
    }
    setSaving(true);
    try {
      await saveChatbotSettings({
        provider_name: providerName.trim(),
        base_url: baseUrl.trim(),
        model: model.trim(),
        site_url: siteUrl.trim(),
        rate_limit_messages: Number(rateMessages) || 50,
        rate_limit_hours: Number(rateHours) || 3,
        rate_limit_guest_messages: Number(guestRateMessages) || 50,
        rate_limit_guest_hours: Number(guestRateHours) || 3,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      toast.success("تم حفظ إعدادات المساعد");
    } catch (e: any) {
      toast.error(e?.message || "تعذر حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">مساعد المنصة (موتيفيا بوت)</h1>
        <p className="text-muted-foreground mt-1">
          ربط المساعد بمزود ذكاء اصطناعي واحد، اختيار الموديل، حدود الاستخدام، ومتابعة الاستهلاك والتحليلات.
        </p>
      </div>

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="settings" className="gap-2">
            <Settings2 className="h-4 w-4" />
            الإعدادات
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            الاستهلاك والتحليلات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-4 space-y-6">
          {/* Master switch */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="w-5 h-5 text-primary" />
                تشغيل الشات
              </CardTitle>
              <CardDescription>
                عند التفعيل تظهر أيقونة موتيفيا بوت لكل مستخدمي المنصة في أسفل يمين الشاشة (فوق شريط
                التنقل في الموبايل).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
                <span className="text-sm font-bold">تشغيل المساعد</span>
                <Switch checked={chatbotEnabled} disabled={savingToggle} onCheckedChange={handleToggle} />
              </label>
            </CardContent>
          </Card>

      {/* Provider settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="w-5 h-5 text-primary" />
            المزود
          </CardTitle>
          <CardDescription>
            أي مزود متوافق مع OpenAI API (زي OpenAI وOpenRouter وGroq وDeepSeek). المفتاح بيتخزن
            على السيرفر فقط ومينفعش يُقرأ مرة تانية.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-bold">اسم المزود (اختياري)</span>
            <Input
              dir="ltr"
              placeholder="OpenRouter / Groq / ..."
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-bold">Base URL</span>
            <Input
              dir="ltr"
              placeholder="https://api.example.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-bold">API Key</span>
            {hasApiKey && (
              <p className="text-xs text-muted-foreground">
                مفتاح محفوظ ({maskedKey}) — اتركه فارغًا للاحتفاظ به.
              </p>
            )}
            <Input
              dir="ltr"
              type="password"
              placeholder={hasApiKey ? "مخفي — اكتب مفتاح جديد للتغيير" : "sk-..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-bold">الموديل</span>
            {models.length > 0 ? (
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger dir="ltr" className="w-full">
                  <SelectValue placeholder="اختر الموديل" />
                </SelectTrigger>
                <SelectContent dir="ltr" className="max-h-72">
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                dir="ltr"
                placeholder="اكتب اسم الموديل أو اجلبه بزرار الجلب"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleFetchModels} disabled={fetchingModels}>
              {fetchingModels ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ListChecks className="h-4 w-4" />
              )}
              جلب الموديلات
            </Button>
            <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4" />
              )}
              تجربة الموديل
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              حفظ الإعدادات
            </Button>
          </div>

          {testResult && (
            <div
              className={
                testResult.ok
                  ? "flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400"
                  : "flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              }
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              <span className="flex-1">{testResult.text}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            المفتاح بيتخزن في السيرفر ومش بيظهر تاني بعد الحفظ — لو عايز تغيّره اكتب مفتاح جديد واحفظ.
          </p>
        </CardContent>
      </Card>

      {/* Usage limits + site url */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="w-5 h-5 text-primary" />
            حدود الاستخدام ورابط المنصة
          </CardTitle>
          <CardDescription>
            حد الرسائل بيُحسب من قاعدة البيانات لكل مستخدم مسجل ولكل IP للزوار، وبيتجدد كل فترة محددة.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-bold">رابط الموقع (للروابط اللي البوت بيديها)</span>
            <Input
              dir="ltr"
              placeholder="https://motivai-edu.online"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-border/60 p-4">
              <div className="text-sm font-bold">المستخدمون المسجلون</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">رسائل</span>
                  <Input
                    dir="ltr"
                    type="number"
                    min={1}
                    value={rateMessages}
                    onChange={(e) => setRateMessages(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">كل (ساعات)</span>
                  <Input
                    dir="ltr"
                    type="number"
                    min={1}
                    value={rateHours}
                    onChange={(e) => setRateHours(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border/60 p-4">
              <div className="text-sm font-bold">الزوار (غير المسجلين)</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">رسائل لكل IP</span>
                  <Input
                    dir="ltr"
                    type="number"
                    min={1}
                    value={guestRateMessages}
                    onChange={(e) => setGuestRateMessages(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">كل (ساعات)</span>
                  <Input
                    dir="ltr"
                    type="number"
                    min={1}
                    value={guestRateHours}
                    onChange={(e) => setGuestRateHours(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            حفظ الإعدادات
          </Button>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <ChatbotAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminChatbotSettings;
