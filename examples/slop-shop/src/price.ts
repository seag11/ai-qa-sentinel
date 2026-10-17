/**
 * Applies a discount rate to a price.
 * @param rate fraction off, e.g. 0.1 for 10% off
 */
export function applyDiscount(price: number, rate: number): number {
  return Math.round(price * (1 - rate) * 100) / 100;
}
