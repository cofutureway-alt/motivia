/**
 * Public build-time defaults for VITE_* env vars.
 *
 * VITE_ variables are public by nature — Vite bakes them into the client bundle,
 * and the Supabase publishable/anon key is designed to be public. These fallbacks
 * let the app build & run on hosting platforms (Vercel/Netlify/...) that pull the
 * repo WITHOUT a .env file. Any real env var on the hosting platform overrides these.
 *
 * ملاحظة أمنية: مفتاح R2 السرّي مستخدم من المتصفح في التصميم الحالي وهو بالفعل
 * مكشوف في حزم JS المنشورة. يُنصح مستقبلاً بنقل عمليات الرفع إلى Edge Function.
 */
const FALLBACK_ENV: Record<string, string> = {
  VITE_SUPABASE_URL: "https://itzinndvggtghztpdnhc.supabase.co",
  VITE_SUPABASE_PROJECT_ID: "itzinndvggtghztpdnhc",
  VITE_SUPABASE_PUBLISHABLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0emlubmR2Z2d0Z2h6dHBkbmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjE4MDYsImV4cCI6MjEwNTI5NzgwNn0.-7CvAUKUKmtympM4Myg2i9awzoP3fohKjZpxQ_41Zy8",
  VITE_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0emlubmR2Z2d0Z2h6dHBkbmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjE4MDYsImV4cCI6MjEwNTI5NzgwNn0.-7CvAUKUKmtympM4Myg2i9awzoP3fohKjZpxQ_41Zy8",
  VITE_SITE_URL: "https://www.motivai-edu.online",
  VITE_R2_PUBLIC_URL: "https://pub-967c88b59d404675979d065d3889a9ea.r2.dev",
  VITE_R2_ACCOUNT_ID: "c2fb45e42a8bbc6f1868b14bbac3ecfd",
  VITE_R2_ACCESS_KEY_ID: "ac16e6922a98564816203402ef226f14",
  VITE_R2_SECRET_ACCESS_KEY:
    "0905b05f8a7bc1d3c7571826e4348e3e790b28dcd7764cc3939d06067524581d",
  VITE_R2_BUCKET_NAME: "fullmark",
};

/** Reads a VITE_* variable with a committed public fallback. */
export function publicEnv(name: string): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[name] || FALLBACK_ENV[name] || undefined;
}