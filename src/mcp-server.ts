/**
 * MCP Server for Google Business Profile
 * 
 * Exposes GBP management tools via Model Context Protocol.
 * Compatible with Claude Code, Cursor, and other MCP clients.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GoogleAuth } from './auth/google-oauth';
import { ReviewsAPI } from './api/reviews';
import { PostsAPI } from './api/posts';

const auth = new GoogleAuth();

if (!auth.loadTokens()) {
  console.error('❌ No token found. Run `npm run auth` first.');
  process.exit(1);
}

const client = auth.getClient();
const reviewsApi = new ReviewsAPI(client);
const postsApi = new PostsAPI(client);

const server = new McpServer({
  name: 'gbp-manager',
  version: '2.0.0',
});

// ============ Account Tools ============

server.tool(
  'gbp_list_accounts',
  'List all Google Business Profile accounts accessible by the authenticated user',
  {},
  async () => {
    const { google } = await import('googleapis');
    const mybusinessaccount = google.mybusinessaccountmanagement({ version: 'v1', auth: client });
    const response = await mybusinessaccount.accounts.list();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data.accounts || [], null, 2),
      }],
    };
  }
);

// ============ Location Tools ============

server.tool(
  'gbp_list_locations',
  'List business locations for a GBP account',
  {
    accountId: z.string().describe('The GBP account ID'),
  },
  async ({ accountId }) => {
    const { google } = await import('googleapis');
    const mybusiness = google.mybusiness({ version: 'v4', auth: client });
    const response = await mybusiness.accounts.locations.list({
      parent: `accounts/${accountId}`,
      pageSize: 100,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data.locations || [], null, 2),
      }],
    };
  }
);

// ============ Review Tools ============

server.tool(
  'gbp_list_reviews',
  'List reviews for a business location',
  {
    accountId: z.string().describe('GBP account ID'),
    locationId: z.string().describe('Location ID'),
    pageSize: z.number().optional().describe('Number of reviews to return (max 50)'),
  },
  async ({ accountId, locationId, pageSize }) => {
    const result = await reviewsApi.listReviews(accountId, locationId, {
      pageSize: pageSize || 20,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalReviewCount: result.totalReviewCount,
          averageRating: result.averageRating,
          reviews: result.reviews.map(r => ({
            id: r.reviewId,
            reviewer: r.reviewer.displayName,
            stars: r.starRating,
            comment: r.comment,
            date: r.createTime,
            reply: r.reviewReply?.comment || null,
            replyState: r.reviewReply?.reviewReplyState || null,
            hasMedia: (r.reviewMediaItems?.length || 0) > 0,
          })),
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'gbp_get_unreplied_reviews',
  'Get reviews that need replies (no reply or rejected reply)',
  {
    accountId: z.string().describe('GBP account ID'),
    locationId: z.string().describe('Location ID'),
  },
  async ({ accountId, locationId }) => {
    const reviews = await reviewsApi.getUnrepliedReviews(accountId, locationId);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: reviews.length,
          reviews: reviews.map(r => ({
            id: r.reviewId,
            reviewer: r.reviewer.displayName,
            stars: r.starRating,
            comment: r.comment,
            date: r.createTime,
          })),
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'gbp_reply_review',
  'Reply to a Google Business Profile review',
  {
    reviewName: z.string().describe('Full review name (accounts/xxx/locations/xxx/reviews/xxx)'),
    comment: z.string().describe('Reply text'),
  },
  async ({ reviewName, comment }) => {
    try {
      const result = await reviewsApi.replyToReview(reviewName, comment);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            reply: result.reviewReply,
          }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
          }),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'gbp_delete_review_reply',
  'Delete a business reply to a review',
  {
    reviewName: z.string().describe('Full review name'),
  },
  async ({ reviewName }) => {
    await reviewsApi.deleteReply(reviewName);
    return {
      content: [{ type: 'text', text: 'Reply deleted successfully' }],
    };
  }
);

// ============ Post Tools ============

server.tool(
  'gbp_list_posts',
  'List local posts for a business location',
  {
    accountId: z.string().describe('GBP account ID'),
    locationId: z.string().describe('Location ID'),
  },
  async ({ accountId, locationId }) => {
    const result = await postsApi.listPosts(accountId, locationId);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: result.posts.length,
          posts: result.posts.map(p => ({
            name: p.name,
            type: p.topicType,
            summary: p.summary,
            state: p.state,
            createTime: p.createTime,
            searchUrl: p.searchUrl,
          })),
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'gbp_create_post',
  'Create a new local post on Google Business Profile',
  {
    accountId: z.string().describe('GBP account ID'),
    locationId: z.string().describe('Location ID'),
    text: z.string().describe('Post content text'),
    postType: z.enum(['STANDARD', 'EVENT', 'OFFER']).optional().describe('Post type'),
    ctaType: z.enum(['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL']).optional(),
    ctaUrl: z.string().optional().describe('CTA URL'),
  },
  async ({ accountId, locationId, text, postType, ctaType, ctaUrl }) => {
    try {
      const post = await postsApi.createPost(accountId, locationId, {
        topicType: postType || 'STANDARD',
        summary: text,
        callToAction: ctaType && ctaUrl ? { actionType: ctaType, url: ctaUrl } : undefined,
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            post: {
              name: post.name,
              state: post.state,
              searchUrl: post.searchUrl,
            },
          }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'gbp_delete_post',
  'Delete a local post',
  {
    postName: z.string().describe('Full post name'),
  },
  async ({ postName }) => {
    await postsApi.deletePost(postName);
    return {
      content: [{ type: 'text', text: 'Post deleted successfully' }],
    };
  }
);

// ============ Start Server ============

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 GBP Manager MCP Server running');
}

main().catch(console.error);
