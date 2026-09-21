import { supabase } from "@/integrations/supabase/client";

export type RefundStatus = "pending" | "approved" | "rejected" | "processing" | "completed";
export type RefundMethod =
  | "wallet_credit"
  | "kashier_api"
  | "paymob_api"
  | "fawaterak_manual"
  | "manual_external"
  | null;

export interface RefundRequestRow {
  id: string;
  order_id: string;
  order_number: string;
  status: RefundStatus;
  refund_method: RefundMethod;
  reason: string;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  review_notes: string | null;
  processed_at: string | null;
  gateway_refund_reference: string | null;
  processing_error: string | null;
  total_piastres: number;
  order_status: string;
  gateway_key: string;
  gateway_display_name: string;
  student_id: string;
  student_name: string | null;
  student_phone: string | null;
  student_id_code: string | null;
}

export interface RefundListResult {
  rows: RefundRequestRow[];
  counts: Record<RefundStatus | "total", number>;
}

export async function adminListRefundRequests(
  status: RefundStatus | null,
  search: string | null,
): Promise<RefundListResult> {
  const { data, error } = await (supabase as any).rpc("admin_list_refund_requests", {
    p_status: status,
    p_search: search,
  });
  if (error) throw error;
  return (data as RefundListResult) ?? { rows: [], counts: {} as any };
}

export async function adminRejectRefund(requestId: string, notes: string) {
  const { data, error } = await (supabase as any).rpc("admin_reject_refund_request", {
    p_request_id: requestId,
    p_notes: notes,
  });
  if (error) throw error;
  return data;
}

export interface ApproveRefundResult {
  success: boolean;
  method: string;
  completed?: boolean;
  needs_manual_confirm?: boolean;
  needs_dashboard_action?: boolean;
  needs_gateway_call?: boolean;
  gateway_key?: string;
}

export async function adminApproveRefund(requestId: string): Promise<ApproveRefundResult> {
  const { data, error } = await (supabase as any).rpc("admin_approve_refund_request", {
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as ApproveRefundResult;
}

export async function adminManuallyCompleteRefund(
  requestId: string,
  gatewayReference: string,
  notes: string,
) {
  const { data, error } = await (supabase as any).rpc("admin_complete_refund_request", {
    p_request_id: requestId,
    p_gateway_reference: gatewayReference || null,
    p_notes: notes || null,
  });
  if (error) throw error;
  return data;
}

export async function processKashierRefund(requestId: string) {
  const { data, error } = await supabase.functions.invoke("kashier-refund", {
    body: { request_id: requestId },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export async function processPaymobRefund(requestId: string) {
  const { data, error } = await supabase.functions.invoke("paymob-refund", {
    body: { request_id: requestId },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}
