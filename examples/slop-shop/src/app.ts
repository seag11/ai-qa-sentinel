import Fastify, { type FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './db.js';
import { registerOrderRoutes } from './orders.js';
import { registerPaymentRoutes } from './pay.js';

export function buildApp(db: DatabaseSync = openDatabase()): FastifyInstance {
  const app = Fastify();
  app.get('/health', (_request, reply) => reply.send({ ok: true }));
  registerOrderRoutes(app, db);
  registerPaymentRoutes(app, db);
  return app;
}
