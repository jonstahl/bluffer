import type { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { requireAuth } from './auth';
import { nextSlotDateTime } from '../lib/timezone';

type Post = {
  id: number;
  kind: 'original' | 'repost';
  commentary: string;
  source_url: string | null;
  source_urn: string | null;
  status: 'draft' | 'queued' | 'scheduled' | 'publishing' | 'published' | 'failed';
  scheduled_for: string | null;
  slot_id: number | null;
  published_urn: string | null;
  published_at: string | null;
  error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

type Slot = {
  id: number;
  day_of_week: number;
  time_local: string;
  timezone: string;
  enabled: number;
};

type CreateBody = {
  kind?: 'original' | 'repost';
  commentary?: string;
  source_url?: string;
  source_urn?: string;
  scheduled_for?: string;
  slot_id?: number;
};

type PatchBody = Partial<
  Pick<Post, 'commentary' | 'status' | 'scheduled_for' | 'slot_id' | 'source_url' | 'source_urn'>
>;

export async function postRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { status?: string } }>(
    '/api/posts',
    { preHandler: requireAuth },
    async (req) => {
      const db = getDb();
      const { status } = req.query;
      if (status) {
        return db.prepare(
          'SELECT * FROM posts WHERE status = ? ORDER BY scheduled_for ASC NULLS LAST, created_at ASC',
        ).all(status);
      }
      return db.prepare(
        'SELECT * FROM posts ORDER BY scheduled_for ASC NULLS LAST, created_at ASC',
      ).all();
    },
  );

  app.post<{ Body: CreateBody }>(
    '/api/posts',
    { preHandler: requireAuth },
    async (req, reply) => {
      const db = getDb();
      const {
        kind = 'original',
        commentary = '',
        source_url,
        source_urn,
        scheduled_for,
        slot_id,
      } = req.body;

      let status: Post['status'] = 'draft';
      let resolvedScheduledFor: string | null = scheduled_for ?? null;

      if (slot_id) {
        const slot = db.prepare('SELECT * FROM schedule_slots WHERE id = ? AND enabled = 1').get(slot_id) as Slot | undefined;
        if (slot && !resolvedScheduledFor) {
          const next = nextSlotDateTime(slot.day_of_week, slot.time_local, slot.timezone);
          resolvedScheduledFor = next ? next.toISOString() : null;
        }
        status = resolvedScheduledFor ? 'queued' : 'draft';
      } else if (scheduled_for) {
        status = 'scheduled';
      }

      const result = db.prepare(`
        INSERT INTO posts (kind, commentary, source_url, source_urn, status, scheduled_for, slot_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        kind, commentary,
        source_url ?? null, source_urn ?? null,
        status, resolvedScheduledFor,
        slot_id ?? null,
      );

      return reply.status(201).send(
        db.prepare('SELECT * FROM posts WHERE id = ?').get(result.lastInsertRowid),
      );
    },
  );

  app.patch<{ Params: { id: string }; Body: PatchBody }>(
    '/api/posts/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const db = getDb();
      const id = parseInt(req.params.id, 10);
      const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;
      if (!post) return reply.status(404).send({ error: 'Not found' });

      const allowed: (keyof PatchBody)[] = [
        'commentary', 'status', 'scheduled_for', 'slot_id', 'source_url', 'source_urn',
      ];
      const updates: Record<string, unknown> = {};
      for (const k of allowed) {
        if (k in req.body) updates[k] = req.body[k as keyof PatchBody];
      }

      if (Object.keys(updates).length > 0) {
        const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        db.prepare(`UPDATE posts SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
      }

      return db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/posts/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const db = getDb();
      const id = parseInt(req.params.id, 10);
      if (!db.prepare('SELECT id FROM posts WHERE id = ?').get(id)) {
        return reply.status(404).send({ error: 'Not found' });
      }
      db.prepare('DELETE FROM posts WHERE id = ?').run(id);
      return reply.status(204).send();
    },
  );
}
