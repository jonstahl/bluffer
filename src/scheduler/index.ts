import cron from 'node-cron';
import { getDb } from '../db';
import { postToLinkedIn } from '../linkedin/client';
import { decrypt } from '../lib/crypto';

type PostRow = {
  id: number;
  kind: 'original' | 'repost';
  commentary: string;
  source_urn: string | null;
  retry_count: number;
};

type AuthRow = {
  access_token: string;
  expires_at: string;
  member_urn: string;
};

export function startScheduler(): void {
  // Catch up immediately on boot (covers machine restarts / missed windows)
  void processScheduled();

  // Tick every 60 seconds
  cron.schedule('* * * * *', () => { void processScheduled(); });
}

export async function processScheduled(): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  // Atomically claim all due posts in one transaction — prevents double-send on overlapping ticks
  const claimedIds = db.transaction((): number[] => {
    const due = db.prepare(`
      SELECT id FROM posts
      WHERE status IN ('scheduled', 'queued')
        AND scheduled_for <= ?
    `).all(now) as { id: number }[];

    const ids: number[] = [];
    for (const { id } of due) {
      const changed = db.prepare(`
        UPDATE posts SET status = 'publishing'
        WHERE id = ? AND status IN ('scheduled', 'queued')
      `).run(id).changes;
      if (changed > 0) ids.push(id);
    }
    return ids;
  })();

  for (const id of claimedIds) {
    await publishPost(id);
  }
}

async function publishPost(id: number): Promise<void> {
  const db = getDb();

  const post = db.prepare('SELECT id, kind, commentary, source_urn, retry_count FROM posts WHERE id = ?')
    .get(id) as PostRow | undefined;
  if (!post) return;

  const auth = db.prepare('SELECT access_token, expires_at, member_urn FROM linkedin_auth WHERE id = 1')
    .get() as AuthRow | undefined;

  if (!auth) {
    db.prepare(`UPDATE posts SET status = 'failed', error = ? WHERE id = ?`)
      .run('No LinkedIn account connected — reconnect at /auth/linkedin', id);
    return;
  }

  if (new Date(auth.expires_at) <= new Date()) {
    db.prepare(`UPDATE posts SET status = 'failed', error = ? WHERE id = ?`)
      .run('LinkedIn token expired — reconnect at /auth/linkedin', id);
    return;
  }

  try {
    const accessToken = decrypt(auth.access_token);
    const publishedUrn = await postToLinkedIn(accessToken, auth.member_urn, post);

    db.prepare(`
      UPDATE posts
      SET status = 'published', published_urn = ?, published_at = ?, error = NULL
      WHERE id = ?
    `).run(publishedUrn, new Date().toISOString(), id);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retryCount = post.retry_count + 1;

    if (retryCount >= 3) {
      db.prepare(`
        UPDATE posts SET status = 'failed', error = ?, retry_count = ? WHERE id = ?
      `).run(error, retryCount, id);
    } else {
      // Exponential-ish backoff: 5 min, 10 min
      const retryAt = new Date(Date.now() + retryCount * 5 * 60_000).toISOString();
      db.prepare(`
        UPDATE posts SET status = 'scheduled', scheduled_for = ?, error = ?, retry_count = ? WHERE id = ?
      `).run(retryAt, error, retryCount, id);
    }
  }
}
