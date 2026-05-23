import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { fastifySession } from '@fastify/session';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyFormbody from '@fastify/formbody';
import path from 'path';
import { config } from './config';
import { getDb } from './db';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { linkedinRoutes } from './routes/linkedin';
import { statusRoutes } from './routes/status';
import { postRoutes } from './routes/posts';
import { slotRoutes } from './routes/slots';
import { captureRoutes } from './routes/capture';
import { startScheduler } from './scheduler';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    ...(config.nodeEnv !== 'production' && { transport: { target: 'pino-pretty' } }),
  },
});

// CORS: allow same-origin + linkedin.com (bookmarklet POSTs from LinkedIn pages)
app.register(fastifyCors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / server-to-server
    const allowed = new Set([config.appBaseUrl, 'https://www.linkedin.com']);
    cb(null, allowed.has(origin));
  },
  credentials: true,
});

app.register(fastifyCookie);
app.register(fastifySession, {
  secret: config.sessionSecret,
  cookieName: 'bluffer_sid',
  cookie: {
    secure: config.nodeEnv === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  saveUninitialized: true,
});
app.register(fastifyFormbody);

// Serve PWA frontend from /frontend at project root
app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'frontend'),
  prefix: '/',
  decorateReply: false,
});

// Routes
app.register(healthRoutes);
app.register(authRoutes);
app.register(linkedinRoutes);
app.register(statusRoutes);
app.register(postRoutes);
app.register(slotRoutes);
app.register(captureRoutes);

// Initialize DB (runs migrations) before accepting traffic
getDb();

// Start scheduler (catches up on any missed posts immediately)
startScheduler();

app.listen({ port: config.port, host: config.host }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
