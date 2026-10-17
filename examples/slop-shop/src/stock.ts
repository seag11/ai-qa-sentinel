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

/** Stand-in for the warehouse API, which will confirm stock levels remotely. */
function confirmWithWarehouse(item: LineItem): Promise<LineItem> {
  return Promise.resolve(item);
}

/** Reserves stock for one product. */
export async function reserve(db: DatabaseSync, item: LineItem): Promise<void> {
  await confirmWithWarehouse(item);
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
