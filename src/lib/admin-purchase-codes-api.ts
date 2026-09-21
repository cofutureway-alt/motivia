import { supabase } from "@/integrations/supabase/client";

export interface PurchaseCodeRow {
  id: string;
  code: string;
  target_type: "course" | "bundle";
  target_id: string;
  target_title: string;
  max_uses: number;
  use_count: number;
  status: "active" | "used_up" | "expired";
  expires_at: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
  total_count: number;
}

export interface CharsetConfig {
  digitsOnly: boolean;
  digitsAndSymbols: boolean;
  digitsLettersSymbols: boolean;
}

export interface CreateBatchPayload {
  quantity: number;
  codeLength: number;
  charsetConfig: CharsetConfig;
  target_type: "course" | "bundle";
  target_id: string;
  target_title: string;
  max_uses: number;
  expires_at?: string | null;
}

// ── Build character pool based on the 3 checkboxes ────────────────────────────
export function buildCharPool(cfg: CharsetConfig): string {
  let pool = "0123456789"; // digits included in all options

  if (cfg.digitsAndSymbols) {
    pool += "-_";
  }
  if (cfg.digitsLettersSymbols) {
    pool += "ABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
  }

  // Ensure unique characters in pool
  return Array.from(new Set(pool.split(""))).join("");
}

// ── Generate random code string from pool ─────────────────────────────────────
export function generateRandomCode(length: number, pool: string): string {
  let res = "";
  const len = pool.length;
  for (let i = 0; i < length; i++) {
    res += pool.charAt(Math.floor(Math.random() * len));
  }
  return res;
}

// ── List codes with search & status filters ───────────────────────────────────
export async function listPurchaseCodes(opts: {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<PurchaseCodeRow[]> {
  const { data, error } = await (supabase as any).rpc("admin_list_purchase_codes", {
    _search: opts.search?.trim() || null,
    _status: opts.status?.trim() || null,
    _limit: opts.limit ?? 50,
    _offset: opts.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as PurchaseCodeRow[];
}

// ── Generate a batch of unique purchase codes ─────────────────────────────────
export async function generatePurchaseCodesBatch(payload: CreateBatchPayload): Promise<{
  batch_id: string;
  codes: { code: string; target_title: string; max_uses: number; expires_at: string | null }[];
}> {
  const pool = buildCharPool(payload.charsetConfig);
  if (!pool) throw new Error("اختر على الأقل خياراً واحداً لرموز الكود");

  const batch_id = crypto.randomUUID();
  const quantity = Math.min(Math.max(1, payload.quantity), 500); // capped at 500 per batch
  const length = Math.min(Math.max(4, payload.codeLength), 20);

  // Fetch existing codes to prevent collision
  const { data: existingData } = await (supabase as any)
    .from("purchase_codes")
    .select("code");
  const existingSet = new Set<string>((existingData ?? []).map((r: any) => r.code.toUpperCase()));

  const generatedCodes: string[] = [];
  const localSet = new Set<string>();

  let attempts = 0;
  const maxAttempts = quantity * 100;

  while (generatedCodes.length < quantity && attempts < maxAttempts) {
    attempts++;
    const candidate = generateRandomCode(length, pool);
    const upperCandidate = candidate.toUpperCase();
    if (!existingSet.has(upperCandidate) && !localSet.has(upperCandidate)) {
      localSet.add(upperCandidate);
      generatedCodes.push(candidate);
    }
  }

  if (generatedCodes.length < quantity) {
    throw new Error("تعذّر توليد هذا العدد من الأكواد الفريدة، يرجى زيادة طول الكود أو اختيار مجموعة رموز أوسع.");
  }

  // Insert rows in DB
  const rowsToInsert = generatedCodes.map((code) => ({
    code,
    target_type: payload.target_type,
    target_id: payload.target_id,
    max_uses: payload.max_uses,
    expires_at: payload.expires_at || null,
    batch_id,
  }));

  const { error } = await (supabase as any)
    .from("purchase_codes")
    .insert(rowsToInsert);

  if (error) throw error;

  return {
    batch_id,
    codes: generatedCodes.map((code) => ({
      code,
      target_title: payload.target_title,
      max_uses: payload.max_uses,
      expires_at: payload.expires_at || null,
    })),
  };
}

// ── Bulk delete selected IDs ──────────────────────────────────────────────────
export async function deletePurchaseCodes(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await (supabase as any)
    .from("purchase_codes")
    .delete()
    .in("id", ids);
  if (error) throw error;
}

// ── Quick Cleanup: Used-up codes ──────────────────────────────────────────────
export async function deleteUsedPurchaseCodes(): Promise<number> {
  const { data, error } = await (supabase as any).rpc("admin_delete_used_purchase_codes");
  if (error) throw error;
  return Number(data ?? 0);
}

// ── Quick Cleanup: Expired codes ──────────────────────────────────────────────
export async function deleteExpiredPurchaseCodes(): Promise<number> {
  const { data, error } = await (supabase as any).rpc("admin_delete_expired_purchase_codes");
  if (error) throw error;
  return Number(data ?? 0);
}

// ── Redeem a purchase code (Security Definer RPC) ─────────────────────────────
export interface RedeemResult {
  success: boolean;
  target_type?: "course" | "bundle";
  target_id?: string;
  target_title?: string;
  message?: string;
  error?: string;
}

export async function redeemPurchaseCode(code: string): Promise<RedeemResult> {
  const { data, error } = await (supabase as any).rpc("redeem_purchase_code", {
    p_code: code,
  });
  if (error) throw error;
  return data as RedeemResult;
}
