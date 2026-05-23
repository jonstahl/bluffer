import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getDb } from '../db';
import { requireAuth } from './auth';

type SlotBody = {
  day_of_week: number;
  time_local: string;
  timezone: string;
};

type SlotPatch = Partial<SlotBody & { enabled: boolean }>;

export async function slotRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/slots', { preHandler: requireAuth }, async () =>
    getDb().prepare('SELECT * FROM schedule_slots ORDER BY day_of_week, time_local').all(),
  );

  app.post<{ Body: SlotBody }>(
    '/api/slots',
    { preHandler: requireAuth },
    async (req, reply) => {
      const db = getDb();
      const { day_of_week, time_local, timezone } = req.body;
      const result = db.prepare(
        'INSERT INTO schedule_slots (day_of_week, time_local, timezone) VALUES (?, ?, ?)',
      ).run(day_of_week, time_local, timezone);
      return reply.status(201).send(
        db.prepare('SELECT * FROM schedule_slots WHERE id = ?').get(result.lastInsertRowid),
      );
    },
  );

  app.patch<{ Params: { id: string }; Body: SlotPatch }>(
    '/api/slots/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const db = getDb();
      const id = parseInt(req.params.id, 10);
      if (!db.prepare('SELECT id FROM schedule_slots WHERE id = ?').get(id)) {
        return reply.status(404).send({ error: 'Not found' });
      }

      const allowed: (keyof SlotPatch)[] = ['day_of_week', 'time_local', 'timezone', 'enabled'];
      const updates: Record<string, unknown> = {};
      for (const k of allowed) {
        if (k in req.body) updates[k] = k === 'enabled' ? (req.body[k] ? 1 : 0) : req.body[k];
      }

      if (Object.keys(updates).length > 0) {
        const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        db.prepare(`UPDATE schedule_slots SET ${sets} WHERE id = ?`).run(...Object.values(updates), id);
      }

      return db.prepare('SELECT * FROM schedule_slots WHERE id = ?').get(id);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/slots/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      getDb().prepare('DELETE FROM schedule_slots WHERE id = ?').run(parseInt(req.params.id, 10));
      return reply.status(204).send();
    },
  );
}
