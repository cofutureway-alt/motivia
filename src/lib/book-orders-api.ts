import { supabase } from "@/integrations/supabase/client";

export interface ShippingAddress {
  full_name: string;
  phone: string;
  street: string;
  city: string;
  notes?: string;
}

export type BookGatewayKey = "wallet" | "manual" | "cod" | "kashier" | "paymob" | "fawaterak";

export interface CreateBookOrderResult {
  success: boolean;
  order_id: string;
  order_number: string;
  total_piastres: number;
  status: "pending_payment" | "confirmed";
  payment_transaction_id: string;
  reference_number: string;
  requires_gateway_redirect: boolean;
  gateway_key: BookGatewayKey;
  new_wallet_balance_piastres: number | null;
}

export async function createBookOrder(args: {
  gatewayKey: BookGatewayKey;
  shippingZoneId?: string | null;
  shippingAddress?: ShippingAddress | null;
  manualMethodId?: string | null;
  manualSenderNumber?: string | null;
  manualProofPath?: string | null;
}): Promise<CreateBookOrderResult> {
  const { data, error } = await (supabase as any).rpc("create_book_order", {
    p_gateway_key: args.gatewayKey,
    p_shipping_zone_id: args.shippingZoneId ?? null,
    p_shipping_address: args.shippingAddress ?? null,
    p_manual_method_id: args.manualMethodId ?? null,
    p_manual_sender_number: args.manualSenderNumber ?? null,
    p_manual_proof_path: args.manualProofPath ?? null,
  });
  if (error) throw error;
  return data as CreateBookOrderResult;
}

export interface BookOrderDetail {
  id: string;
  order_number: string;
  status: string;
  has_physical_items: boolean;
  shipping_address: ShippingAddress | null;
  shipping_zone_name: string | null;
  shipping_cost_piastres: number;
  items_subtotal_piastres: number;
  total_piastres: number;
  gateway_key: string;
  gateway_display_name: string;
  created_at: string;
  confirmed_at: string | null;
  items: Array<{
    id: string;
    book_id: string;
    book_type: "digital" | "physical";
    quantity: number;
    unit_price_piastres: number;
    title: string;
    author: string | null;
    cover_image_url: string | null;
  }>;
}

export async function getBookOrderDetail(orderId: string): Promise<BookOrderDetail | null> {
  const { data, error } = await (supabase as any).rpc("get_book_order_detail", {
    p_order_id: orderId,
  });
  if (error) throw error;
  return (data as BookOrderDetail | null) ?? null;
}
