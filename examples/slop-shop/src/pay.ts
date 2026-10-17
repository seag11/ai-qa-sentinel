import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';

interface PayRoute {
  Params: { id: string };
  Body: { token: string };
}

export function registerPaymentRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.post<PayRoute>(
    '/orders/:id/pay',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        body: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] },
      },
    },
    async (request, reply) => {
      const order = db.prepare('SELECT total FROM orders WHERE id = ?').get(request.params.id) as
        | { total: number }
        | undefined;
      if (!order) return reply.code(404).send({ error: 'Order not found' });

      const { createCharge } = await import('stripe-helpers-pro');
      const charge = await createCharge({ amount: order.total, token: request.body.token });
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', request.params.id);
      return { chargeId: charge.id, paid: charge.paid };
    },
  );
}
