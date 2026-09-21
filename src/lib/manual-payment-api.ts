import { supabase } from "@/integrations/supabase/client";
import { uploadToR2, getR2PublicUrl } from "@/lib/r2-storage";

export type ManualMethodType = "vodafone_cash" | "instapay";

export interface ManualPaymentMethod {
  id: string;
  method_type: ManualMethodType;
  is_enabled: boolean;
  account_number: string;
  account_holder_name: string;
  support_whatsapp_number: string;
  created_at?: string;
  updated_at?: string;
}

export const METHOD_LABEL: Record<ManualMethodType, string> = {
  vodafone_cash: "فودافون كاش",
  instapay: "إنستاباي",
};

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export function validateProofFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "يجب اختيار ملف صورة فقط";
  if (file.size > MAX_PROOF_BYTES) return "أقصى حجم للصورة 5 ميجابايت";
  return null;
}

export async function uploadPaymentProof(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  await uploadToR2("payment-proofs", path, file);
  return path;
}

export async function getProofSignedUrl(path: string, _expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  return getR2PublicUrl("payment-proofs", path);
}

export async function listEnabledManualMethods(): Promise<ManualPaymentMethod[]> {
  const { data, error } = await (supabase as any)
    .from("manual_payment_methods")
    .select("*")
    .eq("is_enabled", true)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ManualPaymentMethod[];
}

export async function listAllManualMethods(): Promise<ManualPaymentMethod[]> {
  const { data, error } = await (supabase as any)
    .from("manual_payment_methods")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ManualPaymentMethod[];
}

export async function submitManualCoursePayment(args: {
  courseId: string;
  methodId: string;
  senderNumber: string;
  proofPath: string;
}) {
  const { data, error } = await (supabase as any).rpc("submit_manual_course_payment", {
    p_course_id: args.courseId,
    p_method_id: args.methodId,
    p_sender_number: args.senderNumber,
    p_proof_image_url: args.proofPath,
  });
  if (error) throw error;
  return data;
}

export async function submitManualWalletTopup(args: {
  amountPiastres: number;
  methodId: string;
  senderNumber: string;
  proofPath: string;
}) {
  const { data, error } = await (supabase as any).rpc("submit_manual_wallet_topup", {
    p_amount_piastres: args.amountPiastres,
    p_method_id: args.methodId,
    p_sender_number: args.senderNumber,
    p_proof_image_url: args.proofPath,
  });
  if (error) throw error;
  return data;
}

export interface OwnPaymentRequest {
  transaction_id: string;
  reference_number: string;
  purpose: "course_purchase" | "wallet_topup";
  status: "pending_review" | "pending_gateway" | "success" | "failed" | string;
  course_id: string | null;
  course_title: string | null;
  amount_piastres: number;
  topup_amount_piastres: number | null;
  gateway_display_name: string;
  method_type: ManualMethodType | null;
  method_account_number: string | null;
  method_whatsapp: string | null;
  sender_number: string | null;
  proof_image_url: string | null;
  review_notes: string | null;
  failure_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export async function listOwnPaymentRequests(): Promise<OwnPaymentRequest[]> {
  const { data, error } = await (supabase as any).rpc("student_list_own_payment_requests");
  if (error) throw error;
  return (data ?? []) as OwnPaymentRequest[];
}

export interface AdminPaymentRequest extends OwnPaymentRequest {
  user_id: string;
  student_name: string;
  student_phone: string | null;
  student_student_id: string | null;
  method_account_holder: string | null;
  total_count: number;
}

export async function adminListPaymentRequests(args: {
  status?: string | null;
  purpose?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminPaymentRequest[]> {
  const { data, error } = await (supabase as any).rpc("admin_list_payment_requests", {
    _status: args.status ?? "pending_review",
    _purpose: args.purpose ?? null,
    _limit: args.limit ?? 100,
    _offset: args.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as AdminPaymentRequest[];
}

export async function adminApprovePaymentRequest(id: string) {
  const { data, error } = await (supabase as any).rpc("admin_approve_payment_request", {
    p_transaction_id: id,
  });
  if (error) throw error;
  return data;
}

export async function adminRejectPaymentRequest(id: string, reason: string) {
  const { data, error } = await (supabase as any).rpc("admin_reject_payment_request", {
    p_transaction_id: id,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}
