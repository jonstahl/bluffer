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
  queue?: boolean;   // true = find the earliest upcoming slot automatically
};

type PatchBody = Partial<
  Pick<Post, 'commentary' | 'status' | 'scheduled_for' | 'slot_id' | 'source_url' | 'source_urn'>
> & { queue?: boolean };

function takenScheduledTimes(db: ReturnType<typeof getDb>, excludeId?: number): Set<string> {
  const rows = db.prepare(
    "SELECT scheduled_for FROM posts WHERE status IN ('queued','scheduled','publishing') AND scheduled_for IS NOT NULL",
  ).all() as { scheduled_for: string }[];
  const taken = new Set(rows.map(r => r.scheduled_for.slice(0, 16)));
  if (excludeId != null) {
    const p = db.prepare('SELECT scheduled_for FROM posts WHERE id = ?').get(excludeId) as { scheduled_for: string | null } | undefined;
    if (p?.scheduled_for) taken.delete(p.scheduled_for.slice(0, 16));
  }
  return taken;
}

function findEarliestOpenSlot(
  slots: Slot[],
  taken: Set<string>,
): { date: Date; slotId: number } | null {
  let best: { date: Date; slotId: number } | null = null;
  for (const s of slots) {
    let after: Date | undefined;
    for (let i = 0; i < 60; i++) {
      const next = nextSlotDateTime(s.day_of_week, s.time_local, s.timezone, after);
      if (!next) break;
      const key = next.toISOString().slice(0, 16);
      if (!taken.has(key)) {
        if (!best || next < best.date) best = { date: next, slotId: s.id };
        break;
      }
      after = new Date(next.getTime() + 60_000);
    }
  }
  return best;
}

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
        queue,
      } = req.body;

      let status: Post['status'] = 'draft';
      let resolvedScheduledFor: string | null = scheduled_for ?? null;
      let resolvedSlotId: number | null = slot_id ?? null;

      if (queue) {
        const slots = db.prepare('SELECT * FROM schedule_slots WHERE enabled = 1').all() as Slot[];
        const taken = takenScheduledTimes(db);
        const open = findEarliestOpenSlot(slots, taken);
        resolvedScheduledFor = open ? open.date.toISOString() : null;
        resolvedSlotId = open ? open.slotId : null;
        status = resolvedScheduledFor ? 'queued' : 'draft';
      } else if (slot_id) {
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
        resolvedSlotId,
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

      const updates: Record<string, unknown> = {};

      // Always apply content edits regardless of scheduling choice
      const contentFields: (keyof Omit<PatchBody, 'queue' | 'status' | 'scheduled_for' | 'slot_id'>)[] = [
        'commentary', 'source_url', 'source_urn',
      ];
      for (const k of contentFields) {
        if (k in req.body) updates[k] = req.body[k as keyof PatchBody];
      }

      // Apply scheduling
      if (req.body.queue) {
        const slots = db.prepare('SELECT * FROM schedule_slots WHERE enabled = 1').all() as Slot[];
        const taken = takenScheduledTimes(db, id);
        const open = findEarliestOpenSlot(slots, taken);
        updates.status = open ? 'queued' : 'draft';
        updates.scheduled_for = open ? open.date.toISOString() : null;
        updates.slot_id = open ? open.slotId : null;
      } else {
        const schedFields: (keyof Omit<PatchBody, 'queue' | 'commentary' | 'source_url' | 'source_urn'>)[] = [
          'status', 'scheduled_for', 'slot_id',
        ];
        for (const k of schedFields) {
          if (k in req.body) updates[k] = req.body[k as keyof PatchBody];
        }
      }

      if (Object.keys(updates).length > 0) {
        const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        db.prepare(`UPDATE posts SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
      }

      return db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    },
  );

  // Reorder queued/scheduled posts by redistributing their scheduled_for times.
  // ids = full list of visible post IDs in desired order; only posts that have
  // a scheduled_for are affected — their times are reassigned to preserve the
  // slot sequence while matching the new position order.
  app.post<{ Body: { ids: number[] } }>(
    '/api/posts/reorder',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: 'ids must be a non-empty array' });
      }

      const db = getDb();
      const placeholders = ids.map(() => '?').join(',');

      // Fetch posts that have a scheduled_for, sorted by current time ascending
      const scheduled = db.prepare(
        `SELECT id, scheduled_for, slot_id FROM posts
         WHERE id IN (${placeholders}) AND scheduled_for IS NOT NULL
         ORDER BY scheduled_for ASC`,
      ).all(...ids) as { id: number; scheduled_for: string; slot_id: number | null }[];

      // The time slots in ascending order (what we'll redistribute)
      const times = scheduled.map(p => ({ scheduled_for: p.scheduled_for, slot_id: p.slot_id }));

      // Posts from `ids` that have a scheduled_for, in the user's requested order
      const scheduledIdSet = new Set(scheduled.map(p => p.id));
      const reorderedIds = ids.filter(id => scheduledIdSet.has(id));

      const update = db.prepare('UPDATE posts SET scheduled_for = ?, slot_id = ? WHERE id = ?');
      db.transaction(() => {
        reorderedIds.forEach((id, i) => {
          update.run(times[i].scheduled_for, times[i].slot_id, id);
        });
      })();

      return { ok: true };
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
