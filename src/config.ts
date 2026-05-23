export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? './bluffer.db',
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // Fly secrets (required in production)
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-session-secret-change-in-production',
  ownerPasswordHash: process.env.OWNER_PASSWORD_HASH ?? '',
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  bookmarkletToken: process.env.BOOKMARKLET_TOKEN ?? '',

  // LinkedIn OAuth app credentials
  linkedinClientId: process.env.LINKEDIN_CLIENT_ID ?? '',
  linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? '',

  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',

  ownerTimezone: process.env.OWNER_TIMEZONE ?? 'America/Chicago',

  // Verified against live docs 2026-05 — update when LinkedIn sunsets this version
  linkedinApiVersion: '202605',
} as const;
