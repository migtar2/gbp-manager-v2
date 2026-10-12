/**
 * Google Business Profile Posts API
 * 
 * Handles local post creation, management, and scheduling.
 * Supports Standard, Event, Offer, and Alert post types.
 * Includes RecurrenceInfo for recurring posts (API v4.9).
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface LocalPost {
  name: string;
  topicType: 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT';
  languageCode: string;
  summary: string;
  callToAction?: {
    actionType: 'LEARN_MORE' | 'BOOK' | 'ORDER' | 'SHOP' | 'SIGN_UP' | 'CALL';
    url: string;
  };
  media?: Array<{
    name: string;
    sourceUrl: string;
    contentType: string;
  }>;
  event?: {
    title: string;
    schedule: {
      startDate: { year: number; month: number; day: number };
      startTime?: { hours: number; minutes: number };
      endDate: { year: number; month: number; day: number };
      endTime?: { hours: number; minutes: number };
    };
  };
  offer?: {
    couponCode?: string;
    redeemOnlineUrl?: string;
    termsConditions?: string;
  };
  recurrenceInfo?: {
    recurrenceType: 'WEEKLY' | 'MONTHLY';
    interval: number;
  };
  state: 'LIVE' | 'FINAL';
  createTime: string;
  updateTime: string;
  searchUrl: string;
}

export interface CreatePostRequest {
  topicType: LocalPost['topicType'];
  languageCode?: string;
  summary: string;
  callToAction?: LocalPost['callToAction'];
  media?: LocalPost['media'];
  event?: LocalPost['event'];
  offer?: LocalPost['offer'];
  recurrenceInfo?: LocalPost['recurrenceInfo'];
}

export class PostsAPI {
  private mybusiness: any;

  constructor(auth: OAuth2Client) {
    this.mybusiness = google.mybusiness({
      version: 'v4',
      auth,
    });
  }

  /**
   * List local posts for a location
   */
  async listPosts(
    accountId: string,
    locationId: string,
    options: {
      pageSize?: number;
      pageToken?: string;
      filter?: string;
    } = {}
  ): Promise<{ posts: LocalPost[]; nextPageToken?: string }> {
    const response = await this.mybusiness.accounts.locations.localPosts.list({
      parent: `accounts/${accountId}/locations/${locationId}`,
      pageSize: options.pageSize || 100,
      pageToken: options.pageToken,
      filter: options.filter,
    });

    return {
      posts: response.data.localPosts || [],
      nextPageToken: response.data.nextPageToken,
    };
  }

  /**
   * Create a new local post
   */
  async createPost(
    accountId: string,
    locationId: string,
    post: CreatePostRequest
  ): Promise<LocalPost> {
    const response = await this.mybusiness.accounts.locations.localPosts.create({
      parent: `accounts/${accountId}/locations/${locationId}`,
      requestBody: {
        languageCode: post.languageCode || 'es',
        topicType: post.topicType,
        summary: post.summary,
        callToAction: post.callToAction,
        media: post.media,
        event: post.event,
        offer: post.offer,
        recurrenceInfo: post.recurrenceInfo,
      },
    });

    return response.data;
  }

  /**
   * Get a specific post
   */
  async getPost(postName: string): Promise<LocalPost> {
    const response = await this.mybusiness.accounts.locations.localPosts.get({
      name: postName,
    });
    return response.data;
  }

  /**
   * Update an existing post
   */
  async updatePost(
    postName: string,
    updates: Partial<CreatePostRequest>
  ): Promise<LocalPost> {
    const response = await this.mybusiness.accounts.locations.localPosts.patch({
      name: postName,
      requestBody: updates,
      updateMask: Object.keys(updates).join(','),
    });
    return response.data;
  }

  /**
   * Delete a post
   */
  async deletePost(postName: string): Promise<void> {
    await this.mybusiness.accounts.locations.localPosts.delete({
      name: postName,
    });
  }

  /**
   * Create a standard post with CTA
   */
  async createStandardPost(
    accountId: string,
    locationId: string,
    text: string,
    options: {
      ctaType?: LocalPost['callToAction']['actionType'];
      ctaUrl?: string;
      imageUrl?: string;
    } = {}
  ): Promise<LocalPost> {
    return this.createPost(accountId, locationId, {
      topicType: 'STANDARD',
      summary: text,
      callToAction: options.ctaType && options.ctaUrl ? {
        actionType: options.ctaType,
        url: options.ctaUrl,
      } : undefined,
      media: options.imageUrl ? [{
        name: `accounts/${accountId}/locations/${locationId}/media/${Date.now()}`,
        sourceUrl: options.imageUrl,
        contentType: 'PHOTO',
      }] : undefined,
    });
  }

  /**
   * Create an event post
   */
  async createEventPost(
    accountId: string,
    locationId: string,
    eventData: {
      title: string;
      summary: string;
      startDate: { year: number; month: number; day: number };
      endDate: { year: number; month: number; day: number };
      startTime?: { hours: number; minutes: number };
      endTime?: { hours: number; minutes: number };
      ctaType?: LocalPost['callToAction']['actionType'];
      ctaUrl?: string;
    }
  ): Promise<LocalPost> {
    return this.createPost(accountId, locationId, {
      topicType: 'EVENT',
      summary: eventData.summary,
      event: {
        title: eventData.title,
        schedule: {
          startDate: eventData.startDate,
          startTime: eventData.startTime,
          endDate: eventData.endDate,
          endTime: eventData.endTime,
        },
      },
      callToAction: eventData.ctaType && eventData.ctaUrl ? {
        actionType: eventData.ctaType,
        url: eventData.ctaUrl,
      } : undefined,
    });
  }

  /**
   * Create an offer post
   */
  async createOfferPost(
    accountId: string,
    locationId: string,
    offerData: {
      summary: string;
      couponCode?: string;
      redeemOnlineUrl?: string;
      termsConditions?: string;
      ctaType?: LocalPost['callToAction']['actionType'];
      ctaUrl?: string;
    }
  ): Promise<LocalPost> {
    return this.createPost(accountId, locationId, {
      topicType: 'OFFER',
      summary: offerData.summary,
      offer: {
        couponCode: offerData.couponCode,
        redeemOnlineUrl: offerData.redeemOnlineUrl,
        termsConditions: offerData.termsConditions,
      },
      callToAction: offerData.ctaType && offerData.ctaUrl ? {
        actionType: offerData.ctaType,
        url: offerData.ctaUrl,
      } : undefined,
    });
  }
}
