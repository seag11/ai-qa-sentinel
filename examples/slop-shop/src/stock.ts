import type { DatabaseSync } from 'node:sqlite';

export interface LineItem {
  productId: number;
  quantity: number;
}

export class OutOfStockError extends Error {
  constructor(productId: number) {
    super(`Product ${productId} is out of stock`);
  }
}

/** Reserves stock for one product. Async so it can move to the warehouse API later. */
export async function reserve(db: DatabaseSync, item: LineItem): Promise<void> {
  const row = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.productId) as
    | { stock: number }
    | undefined;
  if (!row || row.stock < item.quantity) {
    throw new OutOfStockError(item.productId);
  }
  db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.productId);
}

/** Reserves stock for every item in an order. */
export function reserveAll(db: DatabaseSync, items: LineItem[]): void {
  for (const item of items) {
    reserve(db, item);
  }
}
