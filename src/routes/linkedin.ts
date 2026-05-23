import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { getDb } from '../db';
import { encrypt } from '../lib/crypto';
import { requireAuth } from './auth';

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

export async function linkedinRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auth/linkedin', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const state = randomUUID();
    req.session.set('oauth_state', state);
    await req.session.save();

    const redirectUri = `${config.appBaseUrl}/auth/linkedin/callback`;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.linkedinClientId,
      redirect_uri: redirectUri,
      state,
      scope: 'openid profile w_member_social',
    });

    return reply.redirect(`${AUTH_URL}?${params}`);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>(
    '/auth/linkedin/callback',
    async (req, reply) => {
      const { code, state, error, error_description } = req.query;

      if (error) {
        return reply.redirect(`/?li_error=${encodeURIComponent(error_description ?? error)}`);
      }

      if (!state || state !== req.session.get('oauth_state')) {
        return reply.status(400).send({ error: 'Invalid OAuth state — possible CSRF' });
      }
      req.session.set('oauth_state', undefined);

      if (!code) return reply.status(400).send({ error: 'Missing code' });

      const redirectUri = `${config.appBaseUrl}/auth/linkedin/callback`;

      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: config.linkedinClientId,
          client_secret: config.linkedinClientSecret,
        }),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        app.log.error({ status: tokenRes.status, body }, 'LinkedIn token exchange failed');
        return reply.status(502).send({ error: 'Token exchange failed' });
      }

      const tokens = await tokenRes.json() as {
        access_token: string;
        expires_in: number;
        refresh_token?: string;
      };

      const profileRes = await fetch(USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'LinkedIn-Version': config.linkedinApiVersion,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (!profileRes.ok) {
        app.log.error({ status: profileRes.status }, 'LinkedIn userinfo fetch failed');
        return reply.status(502).send({ error: 'Failed to fetch LinkedIn profile' });
      }

      const profile = await profileRes.json() as { sub: string };
      const memberUrn = `urn:li:person:${profile.sub}`;
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      const db = getDb();
      db.prepare(`
        INSERT INTO linkedin_auth (id, access_token, refresh_token, expires_at, member_urn)
        VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          access_token  = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_at    = excluded.expires_at,
          member_urn    = excluded.member_urn
      `).run(
        encrypt(tokens.access_token),
        tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        expiresAt,
        memberUrn,
      );

      req.session.set('authenticated', true);
      await req.session.save();
      return reply.redirect('/?connected=1');
    },
  );
}
