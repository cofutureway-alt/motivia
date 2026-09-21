import { supabase } from "@/integrations/supabase/client";

export interface PaymobInitiateResponse {
  redirect_url: string;
  reference_number: string;
  amount_piastres: number;
}

export interface PaymobConfig {
  secret_key: string;
  public_key: string;
  hmac_secret: string;
  /**
   * PayMob classic (Accept) API key. Required for refund processing because
   * the refund endpoint authenticates via /api/auth/tokens with this key.
   */
  classic_api_key?: string;
}

export function paymobReturnUrl(): string {
  return `${window.location.origin}/payment/paymob/return`;
}

export async function initiatePaymobPayment(args: {
  purpose: "course_purchase" | "wallet_topup";
  courseId?: string;
  topupAmountPiastres?: number;
}): Promise<PaymobInitiateResponse> {
  const { data, error } = await supabase.functions.invoke("paymob-initiate", {
    body: {
      purpose: args.purpose,
      course_id: args.courseId ?? null,
      topup_amount_piastres: args.topupAmountPiastres ?? null,
      return_url: paymobReturnUrl(),
    },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as PaymobInitiateResponse;
}

export async function adminGetPaymobConfig(): Promise<PaymobConfig | null> {
  const { data: gw, error: gwErr } = await (supabase as any)
    .from("payment_gateways")
    .select("id")
    .eq("gateway_key", "paymob")
    .maybeSingle();
  if (gwErr) throw gwErr;
  if (!gw) return null;
  const { data, error } = await (supabase as any)
    .from("payment_gateway_secrets")
    .select("config")
    .eq("gateway_id", gw.id)
    .maybeSingle();
  if (error) throw error;
  const cfg = (data?.config ?? {}) as Partial<PaymobConfig>;
  return {
    secret_key: cfg.secret_key ?? "",
    public_key: cfg.public_key ?? "",
    hmac_secret: cfg.hmac_secret ?? "",
    classic_api_key: cfg.classic_api_key ?? "",
  };
}

export async function adminSavePaymobConfig(cfg: PaymobConfig): Promise<void> {
  const { data: gw, error: gwErr } = await (supabase as any)
    .from("payment_gateways")
    .select("id")
    .eq("gateway_key", "paymob")
    .maybeSingle();
  if (gwErr) throw gwErr;
  if (!gw) throw new Error("PayMob gateway row missing");
  // Preserve any other keys already in config (e.g. legacy integration_ids stays but is ignored).
  const { data: existing } = await (supabase as any)
    .from("payment_gateway_secrets")
    .select("config")
    .eq("gateway_id", gw.id)
    .maybeSingle();
  const merged = { ...(existing?.config ?? {}), ...cfg };
  const { error } = await (supabase as any)
    .from("payment_gateway_secrets")
    .upsert(
      { gateway_id: gw.id, config: merged, updated_at: new Date().toISOString() },
      { onConflict: "gateway_id" },
    );
  if (error) throw error;
}
