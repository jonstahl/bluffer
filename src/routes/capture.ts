import type { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { config } from '../config';
import { requireBookmarkletToken } from './auth';
import { nextSlotDateTime } from '../lib/timezone';

type Slot = {
  day_of_week: number;
  time_local: string;
  timezone: string;
  enabled: number;
};

type CaptureBody = {
  source_url: string;
  source_urn?: string;
  commentary?: string;
  slot_id?: number;
  scheduled_for?: string;
};

export async function captureRoutes(app: FastifyInstance): Promise<void> {
  // Preflight for cross-origin requests from linkedin.com
  app.options('/api/capture', async (req, reply) => {
    reply
      .header('Access-Control-Allow-Origin', 'https://www.linkedin.com')
      .header('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      .status(204)
      .send();
  });

  app.post<{ Body: CaptureBody }>(
    '/api/capture',
    { preHandler: requireBookmarkletToken },
    async (req, reply) => {
      reply.header('Access-Control-Allow-Origin', 'https://www.linkedin.com');

      const { source_url, source_urn, commentary = '', slot_id, scheduled_for } = req.body;

      const db = getDb();
      let status: 'draft' | 'queued' | 'scheduled' = 'draft';
      let resolvedScheduledFor: string | null = scheduled_for ?? null;

      if (slot_id) {
        const slot = db.prepare(
          'SELECT * FROM schedule_slots WHERE id = ? AND enabled = 1',
        ).get(slot_id) as Slot | undefined;
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
        VALUES ('repost', ?, ?, ?, ?, ?, ?)
      `).run(
        commentary, source_url, source_urn ?? null,
        status, resolvedScheduledFor, slot_id ?? null,
      );

      return reply.status(201).send({ id: result.lastInsertRowid, status });
    },
  );

  // Serve the bookmarklet overlay script — only to the owner (bearer token in path)
  app.get<{ Params: { token: string } }>(
    '/bookmarklet/:token',
    async (req, reply) => {
      if (!config.bookmarkletToken || req.params.token !== config.bookmarkletToken) {
        return reply.status(404).send('Not found');
      }
      const script = buildOverlayScript(config.appBaseUrl, config.bookmarkletToken);
      return reply
        .header('Content-Type', 'application/javascript')
        .header('Cache-Control', 'no-store')
        .send(script);
    },
  );
}

function buildOverlayScript(appBaseUrl: string, token: string): string {
  return `
(function() {
  if (document.getElementById('bluffer-overlay')) return;

  var BASE = ${JSON.stringify(appBaseUrl)};
  var TOKEN = ${JSON.stringify(token)};

  // Extract post URL — works for /feed/update/ and /posts/ LinkedIn URLs
  var postUrl = window.location.href.split('?')[0];
  var urnMatch = postUrl.match(/urn:li:(share|ugcPost|activity):[0-9]+/);
  var postUrn = urnMatch ? urnMatch[0] : null;

  // Build overlay UI
  var overlay = document.createElement('div');
  overlay.id = 'bluffer-overlay';
  overlay.style.cssText = [
    'position:fixed', 'top:20px', 'right:20px', 'z-index:999999',
    'background:#fff', 'border:2px solid #0a66c2', 'border-radius:8px',
    'padding:16px', 'width:340px', 'box-shadow:0 4px 20px rgba(0,0,0,.25)',
    'font-family:system-ui,sans-serif', 'font-size:14px',
  ].join(';');

  overlay.innerHTML = [
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
    '  <strong style="color:#0a66c2">📤 Bluffer</strong>',
    '  <button id="bluffer-close" style="background:none;border:none;cursor:pointer;font-size:18px">✕</button>',
    '</div>',
    postUrn
      ? '<div style="font-size:12px;color:#666;margin-bottom:8px">Post URN: ' + postUrn + '</div>'
      : '<div style="font-size:12px;color:#c00;margin-bottom:8px">⚠ No post URN found — add URL only</div>',
    '<textarea id="bluffer-commentary" placeholder="Add your commentary…"',
    '  style="width:100%;height:80px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;padding:8px;resize:vertical;margin-bottom:8px"></textarea>',
    '<div style="margin-bottom:8px">',
    '  <label style="display:block;margin-bottom:4px">Schedule:</label>',
    '  <select id="bluffer-schedule" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px">',
    '    <option value="draft">Save as draft</option>',
    '  </select>',
    '</div>',
    '<button id="bluffer-submit"',
    '  style="background:#0a66c2;color:#fff;border:none;border-radius:4px;padding:8px 16px;cursor:pointer;width:100%">',
    '  Queue Post',
    '</button>',
    '<div id="bluffer-msg" style="margin-top:8px;font-size:12px;text-align:center"></div>',
  ].join('');

  document.body.appendChild(overlay);

  document.getElementById('bluffer-close').onclick = function() { overlay.remove(); };

  // Load slots
  fetch(BASE + '/api/slots', {
    headers: { Authorization: 'Bearer ' + TOKEN }
  }).then(function(r) { return r.json(); }).then(function(slots) {
    var sel = document.getElementById('bluffer-schedule');
    slots.forEach(function(s) {
      var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      var opt = document.createElement('option');
      opt.value = 'slot:' + s.id;
      opt.textContent = days[s.day_of_week] + ' ' + s.time_local + ' (' + s.timezone + ')';
      sel.appendChild(opt);
    });
    var customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Specific date/time…';
    sel.appendChild(customOpt);
  }).catch(function() {});

  document.getElementById('bluffer-submit').onclick = function() {
    var commentary = document.getElementById('bluffer-commentary').value.trim();
    var schedVal = document.getElementById('bluffer-schedule').value;
    var msg = document.getElementById('bluffer-msg');

    var body = {
      source_url: postUrl,
      source_urn: postUrn || undefined,
      commentary: commentary,
    };

    if (schedVal.startsWith('slot:')) {
      body.slot_id = parseInt(schedVal.split(':')[1]);
    } else if (schedVal === 'draft') {
      // no extra fields
    }

    msg.textContent = 'Saving…';
    msg.style.color = '#666';

    fetch(BASE + '/api/capture', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + TOKEN,
      },
      body: JSON.stringify(body),
    }).then(function(r) {
      if (r.ok) {
        msg.textContent = '✓ Saved!';
        msg.style.color = 'green';
        setTimeout(function() { overlay.remove(); }, 1500);
      } else {
        return r.text().then(function(t) { throw new Error(t); });
      }
    }).catch(function(e) {
      msg.textContent = '✗ Error: ' + e.message;
      msg.style.color = 'red';
    });
  };
})();
`.trim();
}
