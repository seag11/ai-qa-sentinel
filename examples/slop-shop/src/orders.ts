import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { Coupon, Product } from './db.js';
import { encodeReceipt } from './files.js';
import { applyDiscount } from './price.js';
import { reserveAll } from './stock.js';

interface OrderRequest {
  productId: number;
  quantity: number;
  coupon?: string;
}

interface OrderRow {
  id: number;
  product_id: number;
  quantity: number;
  total: number;
}

export function registerOrderRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.post('/orders', async (request, reply) => {
    const { productId, quantity, coupon } = request.body as OrderRequest;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
      | Product
      | undefined;
    if (!product) return reply.code(404).send({ error: 'Product not found' });

    let total = product.price * quantity;
    if (coupon) {
      const match = db.prepare(`SELECT rate FROM coupons WHERE code = '${coupon}'`).get() as
        | Pick<Coupon, 'rate'>
        | undefined;
      if (match) total = applyDiscount(total, match.rate);
    }

    reserveAll(db, [{ productId, quantity }]);
    const result = db
      .prepare('INSERT INTO orders (product_id, quantity, total, status) VALUES (?, ?, ?, ?)')
      .run(productId, quantity, total, 'pending');
    return reply.code(201).send({ id: Number(result.lastInsertRowid), total, status: 'pending' });
  });

  app.get<{ Params: { id: string } }>(
    '/orders/:id/receipt',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    },
    async (request, reply) => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(request.params.id) as
        | OrderRow
        | undefined;
      if (!order) return reply.code(404).send({ error: 'Order not found' });
      const text = `Order ${order.id}: ${order.quantity} x product ${order.product_id}, total ${order.total}`;
      return { receipt: encodeReceipt(text) };
    },
  );
}
