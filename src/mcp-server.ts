/**
 * MCP Server for Google Business Profile
 *
 * Exposes GBP management tools via Model Context Protocol.
 * Compatible with Claude Code, Cursor, Hermes and other MCP clients.
 *
 * Endurecimiento (Fase P03):
 * - Herramientas READ ONLY siempre disponibles.
 * - Herramientas WRITE CONTROLLED solo se registran con
 *   GBP_ENABLE_WRITE_TOOLS=true (fail closed).
 * - Validación estricta de nombres y protección de confusión de
 *   cuentas/ubicaciones (src/mcp/guards.ts).
 * - Idempotencia en operaciones de escritura.
 * - El contenido de reseñas de Google se trata como datos externos
 *   no confiables (prompt injection) y se sanea antes de devolverlo.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GoogleAuth } from './auth/google-oauth';
import { GoogleRestClient } from './api/gbp-rest';
import { ReviewsAPI, Review } from './api/reviews';
import { PostsAPI } from './api/posts';
import { AccountsAPI } from './api/accounts';
import { LocationsAPI } from './api/locations';
import {
  validateReviewName,
  validatePostName,
  isWriteEnabled,
  IdempotencyGuard,
  sanitizeExternalText,
} from './mcp/guards';
import { normalizeStarRating } from './ai/star-rating';

const auth = new GoogleAuth();

if (!auth.loadTokens()) {
  console.error('❌ No token found. Run `npm run auth` first.');
  process.exit(1);
}

const client = auth.getClient();
const rest = new GoogleRestClient(client);
const reviewsApi = new ReviewsAPI(rest);
const postsApi = new PostsAPI(rest);
const accountsApi = new AccountsAPI(client);
const locationsApi = new LocationsAPI(client);
const idempotency = new IdempotencyGuard();

// ============ Helpers ============

function ok(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: message }) }],
    isError: true,
  };
}

function reviewSummary(r: Review) {
  return {
    name: r.name,
    id: r.reviewId,
    reviewer: sanitizeExternalText(r.reviewer?.displayName || '', 120),
    stars: normalizeStarRating(r.starRating),
    comment: r.comment ? sanitizeExternalText(r.comment) : null,
    date: r.createTime,
    reply: r.reviewReply?.comment ? sanitizeExternalText(r.reviewReply.comment) : null,
    replyState: r.reviewReply?.reviewReplyState || null,
    hasMedia: (r.reviewMediaItems?.length || 0) > 0,
  };
}

const server = new McpServer({
  name: 'gbp-manager',
  version: '2.1.0',
});

// ============ READ ONLY Tools ============

(server.tool as any)(
  'gbp_list_accounts',
  'List all Google Business Profile accounts accessible by the authenticated user',
  {},
  async () => {
    try {
      const accounts = await accountsApi.listAccounts();
      return ok(
        accounts.map((a) => ({
          name: a.name,
          accountName: a.accountName,
          type: a.type,
          role: a.role,
        }))
      );
    } catch (error) {
      return fail(error);
    }
  }
);

const LIST_LOCATIONS_SHAPE: z.ZodRawShape = {
  accountId: z.string().describe('The GBP account ID (without "accounts/" prefix)'),
};

// Workaround TS2589 (inferencia zod + @modelcontextprotocol/sdk): la
// validación real la hace Zod en runtime; el cast solo evita la explosión
// de tipos en compilación.
(server.tool as any)(
  'gbp_list_locations',
  'List business locations for a GBP account (paginated automatically)',
  LIST_LOCATIONS_SHAPE,
  async ({ accountId }: { accountId: string }) => {
    try {
      const locations = await locationsApi.listAllLocations(accountId);
      return ok(
        locations.map((l) => ({
          name: l.name,
          title: l.title,
          storeCode: l.storeCode,
          address: l.address,
          verificationState: l.verificationState,
          profileState: l.profileState,
        }))
      );
    } catch (error) {
      return fail(error);
    }
  }
);

(server.tool as any)(
  'gbp_list_reviews',
  'List reviews for a business location (all pages, up to maxPages)',
  {
    accountId: z.string().describe('GBP account ID'),
    locationId: z.string().describe('Location ID'),
    pageSize: z.number().optional().describe('Reviews per page (max 50)'),
    maxPages: z.number().optional().describe('Max pages to fetch (default 20)'),
  },
  async ({
    accountId,
    locationId,
    pageSize,
    maxPages,
  }: {
    accountId: string;
    locationId: string;
    pageSize?: number;
    maxPages?: number;
  }) => {
    try {
      const reviews = await reviewsApi.listAllReviews(accountId, locationId, {
        pageSize,
        maxPages,
      });
      return ok({ count: reviews.length, reviews: reviews.map(reviewSummary) });
    } catch (error) {
      return fail(error);
    }
  }
);

(server.tool as any)(
  'gbp_get_unreplied_reviews',
  'Get reviews that need replies (no reply, empty reply, or rejected by moderation)',
  {
    accountId: z.string().describe('GBP account ID'),
    locationId: z.string().describe('Location ID'),
  },
  async ({ accountId, locationId }: { accountId: string; locationId: string }) => {
    try {
      const reviews = await reviewsApi.getUnrepliedReviews(accountId, locationId);
      return ok({ count: reviews.length, reviews: reviews.map(reviewSummary) });
    } catch (error) {
      return fail(error);
    }
  }
);

(server.tool as any)(
  'gbp_list_posts',
  'List local posts for a business location',
  {
    accountId: z.string().describe('GBP account ID'),
    locationId: z.string().describe('Location ID'),
  },
  async ({ accountId, locationId }: { accountId: string; locationId: string }) => {
    try {
      const result = await postsApi.listPosts(accountId, locationId);
      return ok({
        count: result.posts.length,
        posts: result.posts.map((p) => ({
          name: p.name,
          type: p.topicType,
          summary: p.summary ? sanitizeExternalText(p.summary, 500) : '',
          state: p.state,
          createTime: p.createTime,
          searchUrl: p.searchUrl,
        })),
      });
    } catch (error) {
      return fail(error);
    }
  }
);

// ============ WRITE CONTROLLED Tools ============
// Solo se registran con GBP_ENABLE_WRITE_TOOLS=true. Toda escritura exige
// accountId + locationId y se valida contra el nombre del recurso para
// impedir operaciones sobre el establecimiento equivocado.

if (isWriteEnabled()) {
  (server.tool as any)(
    'gbp_reply_review',
    'Reply to a Google Business Profile review (WRITE — requires GBP_ENABLE_WRITE_TOOLS)',
    {
      accountId: z.string().describe('GBP account ID the review belongs to'),
      locationId: z.string().describe('Location ID the review belongs to'),
      reviewName: z.string().describe('Full review name (accounts/x/locations/y/reviews/z)'),
      comment: z.string().describe('Reply text'),
    },
    async ({
      accountId,
      locationId,
      reviewName,
      comment,
    }: {
      accountId: string;
      locationId: string;
      reviewName: string;
      comment: string;
    }) => {
      try {
        const nameCheck = validateReviewName(reviewName, { accountId, locationId });
        if (!nameCheck.ok) return fail(new Error(nameCheck.reason));

        const key = IdempotencyGuard.keyFor('reply_review', { reviewName, comment });
        if (!idempotency.checkAndRemember(key)) {
          return ok({ success: false, duplicate: true, message: 'Operación duplicada ignorada' });
        }

        const result = await reviewsApi.replyToReview(reviewName, comment);
        return ok({
          success: true,
          reply: {
            comment: sanitizeExternalText(result.reviewReply.comment),
            updateTime: result.reviewReply.updateTime,
            reviewReplyState: result.reviewReply.reviewReplyState || 'UNKNOWN',
            policyViolation: result.reviewReply.policyViolation || null,
          },
        });
      } catch (error) {
        return fail(error);
      }
    }
  );

  (server.tool as any)(
    'gbp_delete_review_reply',
    'Delete a business reply to a review (WRITE — requires GBP_ENABLE_WRITE_TOOLS)',
    {
      accountId: z.string().describe('GBP account ID the review belongs to'),
      locationId: z.string().describe('Location ID the review belongs to'),
      reviewName: z.string().describe('Full review name'),
    },
    async ({
      accountId,
      locationId,
      reviewName,
    }: {
      accountId: string;
      locationId: string;
      reviewName: string;
    }) => {
      try {
        const nameCheck = validateReviewName(reviewName, { accountId, locationId });
        if (!nameCheck.ok) return fail(new Error(nameCheck.reason));
        await reviewsApi.deleteReply(reviewName);
        return ok({ success: true, message: 'Reply deleted' });
      } catch (error) {
        return fail(error);
      }
    }
  );

const CREATE_POST_SHAPE: z.ZodRawShape = {
  accountId: z.string().describe('GBP account ID'),
  locationId: z.string().describe('Location ID'),
  text: z.string().describe('Post content text'),
  postType: z.enum(['STANDARD', 'EVENT', 'OFFER']).optional().describe('Post type'),
  ctaType: z.enum(['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL']).optional(),
  ctaUrl: z.string().optional().describe('CTA URL'),
};

(server.tool as any)(
    'gbp_create_post',
    'Create a new local post on Google Business Profile (WRITE — requires GBP_ENABLE_WRITE_TOOLS)',
    CREATE_POST_SHAPE,
    async ({
      accountId,
      locationId,
      text,
      postType,
      ctaType,
      ctaUrl,
    }: {
      accountId: string;
      locationId: string;
      text: string;
      postType?: 'STANDARD' | 'EVENT' | 'OFFER';
      ctaType?: 'LEARN_MORE' | 'BOOK' | 'ORDER' | 'SHOP' | 'SIGN_UP' | 'CALL';
      ctaUrl?: string;
    }) => {
      try {
        const key = IdempotencyGuard.keyFor('create_post', {
          accountId,
          locationId,
          text,
          postType,
          ctaType,
          ctaUrl,
        });
        if (!idempotency.checkAndRemember(key)) {
          return ok({ success: false, duplicate: true, message: 'Operación duplicada ignorada' });
        }

        const post = await postsApi.createPost(accountId, locationId, {
          topicType: postType || 'STANDARD',
          summary: text,
          callToAction:
            ctaType && ctaUrl ? { actionType: ctaType, url: ctaUrl } : undefined,
        });

        return ok({
          success: true,
          post: { name: post.name, state: post.state, searchUrl: post.searchUrl },
        });
      } catch (error) {
        return fail(error);
      }
    }
  );

  (server.tool as any)(
    'gbp_delete_post',
    'Delete a local post (WRITE — requires GBP_ENABLE_WRITE_TOOLS)',
    {
      accountId: z.string().describe('GBP account ID the post belongs to'),
      locationId: z.string().describe('Location ID the post belongs to'),
      postName: z.string().describe('Full post name (accounts/x/locations/y/localPosts/z)'),
    },
    async ({
      accountId,
      locationId,
      postName,
    }: {
      accountId: string;
      locationId: string;
      postName: string;
    }) => {
      try {
        const nameCheck = validatePostName(postName, { accountId, locationId });
        if (!nameCheck.ok) return fail(new Error(nameCheck.reason));
        await postsApi.deletePost(postName);
        return ok({ success: true, message: 'Post deleted' });
      } catch (error) {
        return fail(error);
      }
    }
  );
} else {
  console.error('ℹ️ Herramientas de escritura DESACTIVADAS (GBP_ENABLE_WRITE_TOOLS != true).');
}

// ============ Start Server ============

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 GBP Manager MCP Server running');
}

main().catch(console.error);
