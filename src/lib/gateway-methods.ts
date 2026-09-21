import { supabase } from "@/integrations/supabase/client";

export type GatewayKey = "kashier" | "paymob" | "fawaterak";

export interface GatewayMethodRow {
  id: string;
  gateway_id: string;
  method_key: string;
  display_name: string;
  description: string | null;
  is_enabled: boolean;
  order_index: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getGatewayIdByKey(key: GatewayKey): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("payment_gateways")
    .select("id")
    .eq("gateway_key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function listGatewayMethods(gatewayId: string): Promise<GatewayMethodRow[]> {
  const { data, error } = await (supabase as any)
    .from("payment_gateway_methods")
    .select("*")
    .eq("gateway_id", gatewayId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GatewayMethodRow[];
}

export async function listEnabledGatewayMethodsByKey(
  key: GatewayKey,
): Promise<GatewayMethodRow[]> {
  const gid = await getGatewayIdByKey(key);
  if (!gid) return [];
  const rows = await listGatewayMethods(gid);
  return rows.filter((r) => r.is_enabled);
}

export async function addGatewayMethod(args: {
  gatewayId: string;
  methodKey: string;
  displayName: string;
  orderIndex?: number;
}): Promise<GatewayMethodRow> {
  const { data, error } = await (supabase as any)
    .from("payment_gateway_methods")
    .insert({
      gateway_id: args.gatewayId,
      method_key: args.methodKey.trim(),
      display_name: args.displayName.trim(),
      order_index: args.orderIndex ?? 0,
      is_enabled: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as GatewayMethodRow;
}

export async function updateGatewayMethod(
  id: string,
  patch: Partial<Pick<GatewayMethodRow, "display_name" | "description" | "is_enabled" | "order_index">>,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("payment_gateway_methods")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGatewayMethod(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("payment_gateway_methods")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function syncFawaterakMethods(): Promise<{ synced: number; total: number }> {
  const { data, error } = await supabase.functions.invoke("fawaterak-methods", {
    body: { sync: true },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return {
    synced: Number((data as any)?.synced ?? 0),
    total: Number((data as any)?.total ?? 0),
  };
}
