import 'fastify';

declare module 'fastify' {
  interface Session {
    authenticated?: boolean;
    oauth_state?: string;
    passkeyChallenge?: string;
  }
}
