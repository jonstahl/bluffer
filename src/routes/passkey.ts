import type { FastifyInstance } from 'fastify';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { getDb } from '../db';
import { requireAuth } from './auth';
import { config } from '../config';

const rpName = 'Bluffer';
const rpID = new URL(config.appBaseUrl).hostname;
const origin = config.appBaseUrl;

type CredentialRow = {
  id: string;
  public_key: Buffer;
  counter: number;
  transports: string | null;
};

export async function passkeyRoutes(app: FastifyInstance): Promise<void> {
  // Unauthenticated — login page needs to know whether to show the passkey button
  app.get('/auth/passkey/available', async () => {
    const db = getDb();
    const { n } = db.prepare('SELECT COUNT(*) as n FROM passkey_credentials').get() as { n: number };
    return { hasPasskey: n > 0 };
  });

  // ── Registration (must be logged in via password) ────────────────────────

  app.get('/auth/passkey/register/options', { preHandler: requireAuth }, async (req) => {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM passkey_credentials').all() as { id: string }[];

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode('owner'),
      userName: 'owner',
      userDisplayName: 'Bluffer Owner',
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: existing.map(c => ({ id: c.id })),
    });

    req.session.set('passkeyChallenge', options.challenge);
    await req.session.save();
    return options;
  });

  app.post<{ Body: RegistrationResponseJSON }>(
    '/auth/passkey/register/verify',
    { preHandler: requireAuth },
    async (req, reply) => {
      const challenge = req.session.get('passkeyChallenge') as string | undefined;
      if (!challenge) return reply.status(400).send({ error: 'No challenge — request options first' });

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: req.body,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
        });
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
      }

      if (!verification.verified || !verification.registrationInfo) {
        return reply.status(400).send({ error: 'Verification failed' });
      }

      const { credential } = verification.registrationInfo;
      const db = getDb();
      db.prepare(`
        INSERT OR REPLACE INTO passkey_credentials (id, public_key, counter, transports)
        VALUES (?, ?, ?, ?)
      `).run(
        credential.id,
        Buffer.from(credential.publicKey),
        credential.counter,
        credential.transports ? JSON.stringify(credential.transports) : null,
      );

      req.session.set('passkeyChallenge', undefined);
      await req.session.save();
      return { ok: true };
    },
  );

  // ── Authentication ───────────────────────────────────────────────────────

  app.get('/auth/passkey/login/options', async (req) => {
    const db = getDb();
    const credentials = db
      .prepare('SELECT id, transports FROM passkey_credentials')
      .all() as { id: string; transports: string | null }[];

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map(c => ({
        id: c.id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      userVerification: 'preferred',
    });

    req.session.set('passkeyChallenge', options.challenge);
    await req.session.save();
    return options;
  });

  app.post<{ Body: AuthenticationResponseJSON }>(
    '/auth/passkey/login/verify',
    async (req, reply) => {
      const challenge = req.session.get('passkeyChallenge') as string | undefined;
      if (!challenge) return reply.status(400).send({ error: 'No challenge — request options first' });

      const db = getDb();
      const credRow = db
        .prepare('SELECT * FROM passkey_credentials WHERE id = ?')
        .get(req.body.id) as CredentialRow | undefined;

      if (!credRow) return reply.status(400).send({ error: 'Unknown credential' });

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: req.body,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          credential: {
            id: credRow.id,
            publicKey: new Uint8Array(credRow.public_key),
            counter: credRow.counter,
            transports: credRow.transports ? JSON.parse(credRow.transports) : undefined,
          },
        });
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
      }

      if (!verification.verified) {
        return reply.status(400).send({ error: 'Authentication failed' });
      }

      db.prepare('UPDATE passkey_credentials SET counter = ? WHERE id = ?')
        .run(verification.authenticationInfo.newCounter, credRow.id);

      req.session.set('passkeyChallenge', undefined);
      req.session.set('authenticated', true);
      await req.session.save();
      return { ok: true };
    },
  );
}
