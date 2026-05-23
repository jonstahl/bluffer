import type { FastifyInstance } from 'fastify';
import { getDb } from '../db';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    getDb().prepare('SELECT 1').get();
    return { ok: true };
  });
}
