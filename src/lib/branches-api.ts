import { supabase } from "@/integrations/supabase/client";

export interface BranchRow {
  id: string;
  governorate: string;
  branch_name: string;
  address_details: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchPublicBranches(): Promise<BranchRow[]> {
  const { data, error } = await (supabase as any)
    .from("branches")
    .select("*")
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BranchRow[];
}

export async function adminFetchBranches(): Promise<BranchRow[]> {
  const { data, error } = await (supabase as any)
    .from("branches")
    .select("*")
    .order("order_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BranchRow[];
}

export async function adminCreateBranch(branch: {
  governorate: string;
  branch_name: string;
  address_details: string;
  is_active?: boolean;
  order_index?: number;
}): Promise<BranchRow> {
  const { data, error } = await (supabase as any)
    .from("branches")
    .insert([
      {
        governorate: branch.governorate.trim(),
        branch_name: branch.branch_name.trim(),
        address_details: branch.address_details.trim(),
        is_active: branch.is_active ?? true,
        order_index: branch.order_index ?? 0,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as BranchRow;
}

export async function adminUpdateBranch(
  id: string,
  updates: Partial<Omit<BranchRow, "id" | "created_at" | "updated_at">>
): Promise<BranchRow> {
  const { data, error } = await (supabase as any)
    .from("branches")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as BranchRow;
}

export async function adminDeleteBranch(id: string): Promise<void> {
  const { error } = await (supabase as any).from("branches").delete().eq("id", id);
  if (error) throw error;
}

export async function adminReorderBranches(
  orderedItems: { id: string; order_index: number }[]
): Promise<void> {
  for (const item of orderedItems) {
    const { error } = await (supabase as any)
      .from("branches")
      .update({ order_index: item.order_index })
      .eq("id", item.id);
    if (error) throw error;
  }
}
