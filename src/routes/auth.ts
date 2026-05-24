import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { getDb } from '../db';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { password: string } }>(
    '/auth/login',
    { schema: { body: { type: 'object', required: ['password'], properties: { password: { type: 'string' } } } } },
    async (req, reply) => {
      if (!config.ownerPasswordHash) {
        return reply.status(500).send({ error: 'OWNER_PASSWORD_HASH not configured' });
      }
      // Once a passkey is registered, password login is permanently disabled.
      const db = getDb();
      const { n } = db.prepare('SELECT COUNT(*) as n FROM passkey_credentials').get() as { n: number };
      if (n > 0) {
        return reply.status(403).send({ error: 'Password login is disabled — use your passkey' });
      }
      const ok = await bcrypt.compare(req.body.password, config.ownerPasswordHash);
      if (!ok) return reply.status(400).send({ error: 'Invalid password' });
      req.session.set('authenticated', true);
      await req.session.save();
      return { ok: true };
    },
  );

  app.post('/auth/logout', async (req, reply) => {
    await req.session.destroy();
    return reply.send({ ok: true });
  });
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.session.get('authenticated')) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

export async function requireBookmarkletToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization;
  if (!config.bookmarkletToken || auth !== `Bearer ${config.bookmarkletToken}`) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
