import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { config } from '../config';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { password: string } }>(
    '/auth/login',
    { schema: { body: { type: 'object', required: ['password'], properties: { password: { type: 'string' } } } } },
    async (req, reply) => {
      if (!config.ownerPasswordHash) {
        return reply.status(500).send({ error: 'OWNER_PASSWORD_HASH not configured' });
      }
      const ok = await bcrypt.compare(req.body.password, config.ownerPasswordHash);
      if (!ok) return reply.status(400).send({ error: 'Invalid password' });
      req.session.authenticated = true;
      return { ok: true };
    },
  );

  app.post('/auth/logout', async (req, reply) => {
    await req.session.destroy();
    return reply.send({ ok: true });
  });
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.session.authenticated) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

export async function requireBookmarkletToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization;
  if (!config.bookmarkletToken || auth !== `Bearer ${config.bookmarkletToken}`) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
