/**
 * Helper module to format and translate Supabase Auth errors into Arabic messages.
 */

export function getArabicAuthErrorMessage(error: any): string {
  if (!error) return "حدث خطأ غير متوقع";
  const msg = (error.message || String(error)).toLowerCase();
  const status = error.status;

  if (
    status === 429 ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("exceeded") ||
    msg.includes("too many requests") ||
    msg.includes("over_email_send_rate_limit")
  ) {
    return "تم تجاوز حد المحاولات المسموح به مؤقتاً من السيرفر. يرجى الانتظار بضع دقائق ثم المحاولة مجدداً.";
  }

  if (
    msg.includes("already") ||
    msg.includes("registered") ||
    msg.includes("exists") ||
    msg.includes("user_already_exists")
  ) {
    return "هذا الحساب مسجّل بالفعل. يمكنك تسجيل الدخول مباشرة.";
  }

  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid_credentials")
  ) {
    return "بيانات الدخول غير صحيحة.";
  }

  if (msg.includes("invalid") && msg.includes("email")) {
    return "البريد الإلكتروني غير صالح.";
  }

  if (
    msg.includes("weak") ||
    (msg.includes("password") && (msg.includes("at least") || msg.includes("short")))
  ) {
    return "كلمة المرور ضعيفة، يرجى اختيار كلمة مرور لا تقل عن 6 أحرف.";
  }

  if (msg.includes("signup_disabled") || msg.includes("signup is disabled")) {
    return "إنشاء الحسابات الجديدة مغلق حالياً.";
  }

  return error.message || "حدث خطأ أثناء الاتصال بالنظام، حاول مجدداً.";
}
