export interface ShippingZoneLike {
  shipping_price_piastres: number | null;
}

/**
 * Returns the effective shipping price for a zone: the zone's own price when set,
 * otherwise the platform default. Purely computed on read — mirrors the discount
 * price pattern so changing the default cascades to every inheriting zone automatically.
 */
export function getEffectiveShippingPrice(
  zone: ShippingZoneLike | null | undefined,
  defaultPricePiastres: number,
): number {
  if (!zone || zone.shipping_price_piastres === null || zone.shipping_price_piastres === undefined) {
    return defaultPricePiastres;
  }
  return zone.shipping_price_piastres;
}
