/**
 * MONEY STORAGE CONVENTION (Phase 33+):
 * All monetary values in the database are stored as integer PIASTRES.
 * 1 EGP = 100 piastres. Never store or compute business logic in floating-point EGP.
 * Convert to/from EGP only at the UI boundary through these helpers.
 */

export function formatPiastres(
  value: number | null | undefined,
  opts: { withSuffix?: boolean } = { withSuffix: true },
): string {
  const v = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const egp = v / 100;
  // Show up to 2 decimals but drop trailing zeros; use Arabic-Egyptian locale for grouping.
  const str = egp.toLocaleString("ar-EG", {
    minimumFractionDigits: egp % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return opts.withSuffix === false ? str : `${str} ج.م`;
}

/** Parse an EGP admin input (string or number) to integer piastres, rounded. */
export function parseEgpToPiastres(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Convert piastres to an EGP number for form inputs. */
export function piastresToEgpNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return (value / 100).toString();
}

export interface CoursePricing {
  is_paid: boolean | null;
  price_piastres: number | null;
  discount_price_piastres: number | null;
  discount_expires_at: string | null;
}

export interface EffectivePrice {
  /** effective price in piastres (0 if free) */
  amount: number;
  isFree: boolean;
  /** true when a discount is currently active */
  discountActive: boolean;
  /** original price when a discount is active, otherwise null */
  originalAmount: number | null;
  /** discount expiry as Date if applicable and in future */
  discountExpiresAt: Date | null;
}

/**
 * Pure computed effective price. Recompute on every render — no cron needed.
 * A discount naturally "expires" simply because the very next read stops returning it.
 */
export function getEffectiveCoursePrice(
  course: CoursePricing | null | undefined,
  now: Date = new Date(),
): EffectivePrice {
  if (!course || !course.is_paid || course.price_piastres === null || course.price_piastres === undefined) {
    return { amount: 0, isFree: true, discountActive: false, originalAmount: null, discountExpiresAt: null };
  }
  const price = course.price_piastres;
  const discount = course.discount_price_piastres;
  if (discount !== null && discount !== undefined) {
    const expiresAt = course.discount_expires_at ? new Date(course.discount_expires_at) : null;
    const active = !expiresAt || now.getTime() < expiresAt.getTime();
    if (active) {
      return {
        amount: discount,
        isFree: discount === 0,
        discountActive: true,
        originalAmount: price,
        discountExpiresAt: expiresAt,
      };
    }
  }
  return { amount: price, isFree: price === 0, discountActive: false, originalAmount: null, discountExpiresAt: null };
}

/**
 * Generalized effective-price computation used by courses, bundles, and books.
 * Books are never free, so `isFree` may still be true only if a base price of 0 is passed.
 */
export function getEffectivePrice(
  basePricePiastres: number | null | undefined,
  discountPricePiastres: number | null | undefined,
  discountExpiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): EffectivePrice {
  if (basePricePiastres === null || basePricePiastres === undefined) {
    return { amount: 0, isFree: true, discountActive: false, originalAmount: null, discountExpiresAt: null };
  }
  const price = basePricePiastres;
  if (discountPricePiastres !== null && discountPricePiastres !== undefined) {
    const expiresAt = discountExpiresAt
      ? (discountExpiresAt instanceof Date ? discountExpiresAt : new Date(discountExpiresAt))
      : null;
    const active = !expiresAt || now.getTime() < expiresAt.getTime();
    if (active) {
      return {
        amount: discountPricePiastres,
        isFree: discountPricePiastres === 0,
        discountActive: true,
        originalAmount: price,
        discountExpiresAt: expiresAt,
      };
    }
  }
  return { amount: price, isFree: price === 0, discountActive: false, originalAmount: null, discountExpiresAt: null };
}
