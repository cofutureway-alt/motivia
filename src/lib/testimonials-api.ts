import { supabase } from "@/integrations/supabase/client";

export interface TestimonialRow {
  id: string;
  image_url: string;
  student_name: string | null;
  order_index: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchPublicTestimonials(): Promise<TestimonialRow[]> {
  const { data, error } = await (supabase as any)
    .from("testimonials")
    .select("*")
    .eq("is_visible", true)
    .order("order_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TestimonialRow[];
}

export async function adminFetchTestimonials(): Promise<TestimonialRow[]> {
  const { data, error } = await (supabase as any)
    .from("testimonials")
    .select("*")
    .order("order_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TestimonialRow[];
}

export async function uploadTestimonialImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
  const { error } = await supabase.storage
    .from("testimonial-images")
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) throw error;

  const { data } = supabase.storage.from("testimonial-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function adminCreateTestimonial(testimonial: {
  image_url: string;
  student_name?: string | null;
  is_visible?: boolean;
  order_index?: number;
}): Promise<TestimonialRow> {
  const { data, error } = await (supabase as any)
    .from("testimonials")
    .insert([
      {
        image_url: testimonial.image_url,
        student_name: testimonial.student_name ? testimonial.student_name.trim() : null,
        is_visible: testimonial.is_visible ?? true,
        order_index: testimonial.order_index ?? 0,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as TestimonialRow;
}

export async function adminUpdateTestimonial(
  id: string,
  updates: Partial<Omit<TestimonialRow, "id" | "created_at" | "updated_at">>
): Promise<TestimonialRow> {
  const { data, error } = await (supabase as any)
    .from("testimonials")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as TestimonialRow;
}

export async function adminDeleteTestimonial(id: string, imageUrl?: string): Promise<void> {
  const { error } = await (supabase as any).from("testimonials").delete().eq("id", id);
  if (error) throw error;

  if (imageUrl && imageUrl.includes("/testimonial-images/")) {
    const path = imageUrl.split("/testimonial-images/").pop()?.split("?")[0];
    if (path) {
      await supabase.storage.from("testimonial-images").remove([path]);
    }
  }
}

export async function adminReorderTestimonials(
  orderedItems: { id: string; order_index: number }[]
): Promise<void> {
  for (const item of orderedItems) {
    const { error } = await (supabase as any)
      .from("testimonials")
      .update({ order_index: item.order_index })
      .eq("id", item.id);
    if (error) throw error;
  }
}
