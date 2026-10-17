import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('orders API', () => {
  const app = buildApp();
  afterAll(() => app.close());

  it('creates an order at list price', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { productId: 1, quantity: 2 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ total: 240, status: 'pending' });
  });

  it('applies a coupon', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { productId: 2, quantity: 2, coupon: 'WELCOME10' },
    });
    expect(response.json()).toMatchObject({ total: 27 });
  });

  it('returns 404 for an unknown product', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { productId: 99, quantity: 1 },
    });
    expect(response.statusCode).toBe(404);
  });

  it('serves an encoded receipt', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { productId: 2, quantity: 1 },
    });
    const { id } = created.json<{ id: number }>();
    const response = await app.inject({ method: 'GET', url: `/orders/${id}/receipt` });
    const { receipt } = response.json<{ receipt: string }>();
    expect(Buffer.from(receipt, 'base64').toString()).toContain(`Order ${id}`);
  });
});
