import { supabase } from "@/integrations/supabase/client";

export interface FawaterakMethod {
  payment_id: number;
  name_ar: string;
  name_en: string;
  logo: string;
  redirect: boolean;
}

export interface FawaterakInitiateResponse {
  redirect_url: string | null;
  reference_number: string;
  amount_piastres: number;
  inline?: {
    code: string | null;
    expire_at: string | null;
    raw: Record<string, unknown>;
  };
}

export interface FawaterakConfig {
  api_token: string;
  vendor_key: string;
  mode: "staging" | "production";
}

export function fawaterakReturnUrl(): string {
  return `${window.location.origin}/payment/fawaterak/return`;
}

export async function listFawaterakMethods(): Promise<FawaterakMethod[]> {
  const { data, error } = await supabase.functions.invoke("fawaterak-methods", { body: {} });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return ((data as any)?.methods ?? []) as FawaterakMethod[];
}

export async function initiateFawaterakPayment(args: {
  purpose: "course_purchase" | "wallet_topup";
  courseId?: string;
  topupAmountPiastres?: number;
  paymentMethodId: number;
}): Promise<FawaterakInitiateResponse> {
  const { data, error } = await supabase.functions.invoke("fawaterak-initiate", {
    body: {
      purpose: args.purpose,
      course_id: args.courseId ?? null,
      topup_amount_piastres: args.topupAmountPiastres ?? null,
      payment_method_id: args.paymentMethodId,
      return_url: fawaterakReturnUrl(),
    },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as FawaterakInitiateResponse;
}

export async function expireStaleFawaterakPending(): Promise<number> {
  const { data, error } = await (supabase as any).rpc("expire_stale_fawaterak_pending");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function adminGetFawaterakConfig(): Promise<FawaterakConfig | null> {
  const { data: gw, error: gwErr } = await (supabase as any)
    .from("payment_gateways")
    .select("id")
    .eq("gateway_key", "fawaterak")
    .maybeSingle();
  if (gwErr) throw gwErr;
  if (!gw) return null;
  const { data, error } = await (supabase as any)
    .from("payment_gateway_secrets")
    .select("config")
    .eq("gateway_id", gw.id)
    .maybeSingle();
  if (error) throw error;
  const cfg = (data?.config ?? {}) as Partial<FawaterakConfig>;
  return {
    api_token: cfg.api_token ?? "",
    vendor_key: cfg.vendor_key ?? "",
    mode: cfg.mode === "production" ? "production" : "staging",
  };
}

export async function adminSaveFawaterakConfig(cfg: FawaterakConfig): Promise<void> {
  const { data: gw, error: gwErr } = await (supabase as any)
    .from("payment_gateways")
    .select("id")
    .eq("gateway_key", "fawaterak")
    .maybeSingle();
  if (gwErr) throw gwErr;
  if (!gw) throw new Error("Fawaterak gateway row missing");
  const { error } = await (supabase as any)
    .from("payment_gateway_secrets")
    .upsert(
      { gateway_id: gw.id, config: cfg, updated_at: new Date().toISOString() },
      { onConflict: "gateway_id" },
    );
  if (error) throw error;
}
