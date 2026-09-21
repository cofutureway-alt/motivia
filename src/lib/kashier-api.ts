import { supabase } from "@/integrations/supabase/client";

export interface KashierInitiateResponse {
  redirect_url: string;
  reference_number: string;
  amount_piastres: number;
  mode: "test" | "live";
}

export interface KashierConfig {
  merchant_id: string;
  api_key: string;
  secret_key: string;
  mode: "test" | "live";
}

export function kashierReturnUrl(): string {
  return `${window.location.origin}/payment/kashier/return`;
}

export async function initiateKashierPayment(args: {
  purpose: "course_purchase" | "wallet_topup";
  courseId?: string;
  topupAmountPiastres?: number;
}): Promise<KashierInitiateResponse> {
  const { data, error } = await supabase.functions.invoke("kashier-initiate", {
    body: {
      purpose: args.purpose,
      course_id: args.courseId ?? null,
      topup_amount_piastres: args.topupAmountPiastres ?? null,
      return_url: kashierReturnUrl(),
    },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as KashierInitiateResponse;
}

export interface OwnTransactionStatus {
  id: string;
  reference_number: string;
  status: "pending_gateway" | "success" | "failed" | "pending_review";
  purpose: "course_purchase" | "wallet_topup";
  course_id: string | null;
  amount_piastres: number;
  topup_amount_piastres: number | null;
  failure_reason: string | null;
}

export async function getOwnTransactionStatus(
  reference: string,
): Promise<OwnTransactionStatus | null> {
  const { data, error } = await (supabase as any).rpc(
    "get_own_payment_transaction_status",
    { p_reference: reference },
  );
  if (error) throw error;
  return (data as OwnTransactionStatus | null) ?? null;
}

export async function adminGetKashierConfig(): Promise<KashierConfig | null> {
  const { data: gw, error: gwErr } = await (supabase as any)
    .from("payment_gateways")
    .select("id")
    .eq("gateway_key", "kashier")
    .maybeSingle();
  if (gwErr) throw gwErr;
  if (!gw) return null;
  const { data, error } = await (supabase as any)
    .from("payment_gateway_secrets")
    .select("config")
    .eq("gateway_id", gw.id)
    .maybeSingle();
  if (error) throw error;
  const cfg = (data?.config ?? {}) as Partial<KashierConfig>;
  return {
    merchant_id: cfg.merchant_id ?? "",
    api_key: cfg.api_key ?? "",
    secret_key: cfg.secret_key ?? "",
    mode: cfg.mode === "live" ? "live" : "test",
  };
}

export async function adminSaveKashierConfig(cfg: KashierConfig): Promise<void> {
  const { data: gw, error: gwErr } = await (supabase as any)
    .from("payment_gateways")
    .select("id")
    .eq("gateway_key", "kashier")
    .maybeSingle();
  if (gwErr) throw gwErr;
  if (!gw) throw new Error("Kashier gateway row missing");
  const { error } = await (supabase as any)
    .from("payment_gateway_secrets")
    .upsert(
      { gateway_id: gw.id, config: cfg, updated_at: new Date().toISOString() },
      { onConflict: "gateway_id" },
    );
  if (error) throw error;
}
