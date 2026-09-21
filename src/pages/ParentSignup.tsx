import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";
import { isValidEgPhone, normalizeEgPhone, syntheticAuthEmail } from "@/lib/phone";
import { getArabicAuthErrorMessage } from "@/lib/auth-errors";

const ParentSignup = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("أدخل الاسم بالكامل");
    if (!isValidEgPhone(phone)) return toast.error("رقم هاتف غير صالح");
    if (password.length < 6) return toast.error("كلمة المرور يجب ألا تقل عن 6 أحرف");
    const canonical = normalizeEgPhone(phone);
    const realEmail = email.trim().toLowerCase();
    const authEmail = syntheticAuthEmail(canonical);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          intended_role: "parent",
          full_name: fullName.trim(),
          phone_number: canonical,
          real_email: realEmail || null,
        },
      },
    });
    if (error) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (!signInErr) {
        setLoading(false);
        toast.success("تم تسجيل الدخول بنجاح");
        navigate("/parent", { replace: true });
        return;
      }
      setLoading(false);
      toast.error(getArabicAuthErrorMessage(error));
      return;
    }
    await supabase.auth.signInWithPassword({ email: authEmail, password });
    setLoading(false);
    toast.success("تم إنشاء حساب ولي الأمر");
    navigate("/parent", { replace: true });
  };

  return (
    <AuthLayout
      title="تسجيل حساب ولي أمر"
      subtitle="تابع تقدّم أبنائك واشترِ لهم الدورات"
      footer={
        <>
          لديك حساب؟{" "}
          <Link to="/login" className="text-primary font-bold hover:underline">سجّل الدخول</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-bold">الاسم بالكامل</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-bold">رقم الهاتف</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="01012345678" disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-bold">البريد الإلكتروني (اختياري)</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-bold">كلمة المرور</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
        </div>
        <Button type="submit" size="lg" className="w-full gap-2 font-bold" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>إنشاء الحساب<ArrowLeft className="w-4 h-4" /></>}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default ParentSignup;
