import type { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { config } from '../config';
import { requireAuth } from './auth';

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/status', { preHandler: requireAuth }, async () => {
    const db = getDb();
    const auth = db.prepare(
      'SELECT expires_at, member_urn FROM linkedin_auth WHERE id = 1',
    ).get() as { expires_at: string; member_urn: string } | undefined;

    if (!auth) return { connected: false };

    const expiresAt = new Date(auth.expires_at);
    const now = new Date();
    const msLeft = expiresAt.getTime() - now.getTime();
    const daysLeft = Math.floor(msLeft / 86_400_000);

    return {
      connected: true,
      member_urn: auth.member_urn,
      expires_at: auth.expires_at,
      days_left: daysLeft,
      expired: now > expiresAt,
      reconnect_needed: daysLeft < 7,
    };
  });

  // Returns the URL the bookmarklet loader should inject — keeps the token server-side
  app.get('/api/bookmarklet-url', { preHandler: requireAuth }, async () => {
    if (!config.bookmarkletToken) {
      return { url: null, note: 'BOOKMARKLET_TOKEN not configured' };
    }
    return { url: `${config.appBaseUrl}/bookmarklet/${config.bookmarkletToken}` };
  });
}
