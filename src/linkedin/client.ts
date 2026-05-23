/**
 * LinkedIn Posts API client.
 *
 * Request shapes verified against live docs (learn.microsoft.com/linkedin/marketing/…/posts-api)
 * on 2026-05-22. API version: 202605.
 *
 * Text post:   author + commentary + visibility + distribution + lifecycleState + isReshareDisabledByAuthor
 * Reshare:     same fields + reshareContext.parent = URN of post being reshared
 * Author URN:  urn:li:person:{id}  (from /v2/userinfo `sub` field)
 * Response:    HTTP 201, post URN in x-restli-id response header
 */

import { config } from '../config';

const POSTS_URL = 'https://api.linkedin.com/rest/posts';

type PostRow = {
  kind: 'original' | 'repost';
  commentary: string;
  source_urn: string | null;
};

export async function postToLinkedIn(
  accessToken: string,
  memberUrn: string,
  post: PostRow,
): Promise<string> {
  const body: Record<string, unknown> = {
    author: memberUrn,
    commentary: post.commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  if (post.kind === 'repost' && post.source_urn) {
    body.reshareContext = { parent: post.source_urn };
  }

  const res = await fetch(POSTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': config.linkedinApiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${text}`);
  }

  const urn = res.headers.get('x-restli-id');
  if (!urn) throw new Error('LinkedIn API returned 201 but no x-restli-id header');
  return urn;
}

export async function deleteFromLinkedIn(
  accessToken: string,
  postUrn: string,
): Promise<void> {
  const res = await fetch(`${POSTS_URL}/${encodeURIComponent(postUrn)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': config.linkedinApiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${text}`);
  }
}
