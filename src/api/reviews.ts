/**
 * Google Business Profile Reviews API
 * 
 * Handles review listing, reply management, and AI-powered reply generation.
 * Uses Google My Business API v4.9 with ReviewReplyState and PolicyViolation support.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface Review {
  name: string;
  reviewId: string;
  reviewer: {
    displayName: string;
    profilePhotoUrl?: string;
  };
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
    reviewReplyState?: 'PENDING' | 'APPROVED' | 'REJECTED';
    policyViolation?: {
      type: string;
      details: string;
    };
  };
  reviewMediaItems?: Array<{
    name: string;
    contentType: string;
    dimensions: { width: number; height: number };
    thumbnailUrl: string;
    mediaUrl: string;
  }>;
}

export interface ReviewsListResponse {
  reviews: Review[];
  nextPageToken?: string;
  totalReviewCount: number;
  averageRating: number;
}

export class ReviewsAPI {
  private mybusiness: any;

  constructor(auth: OAuth2Client) {
    this.mybusiness = google.mybusiness({
      version: 'v4',
      auth,
    });
  }

  /**
   * List reviews for a location
   */
  async listReviews(
    accountId: string,
    locationId: string,
    options: {
      pageSize?: number;
      pageToken?: string;
      orderBy?: string;
    } = {}
  ): Promise<ReviewsListResponse> {
    const response = await this.mybusiness.accounts.locations.reviews.list({
      parent: `accounts/${accountId}/locations/${locationId}`,
      pageSize: options.pageSize || 50,
      pageToken: options.pageToken,
      orderBy: options.orderBy || 'updateTime desc',
    });

    return {
      reviews: response.data.reviews || [],
      nextPageToken: response.data.nextPageToken,
      totalReviewCount: response.data.totalReviewCount || 0,
      averageRating: response.data.averageRating || 0,
    };
  }

  /**
   * Get a single review
   */
  async getReview(reviewName: string): Promise<Review> {
    const response = await this.mybusiness.accounts.locations.reviews.get({
      name: reviewName,
    });
    return response.data;
  }

  /**
   * Reply to a review
   */
  async replyToReview(
    reviewName: string,
    comment: string
  ): Promise<{ reviewReply: Review['reviewReply'] }> {
    const response = await this.mybusiness.accounts.locations.reviews.updateReply({
      name: `${reviewName}/reply`,
      requestBody: { comment },
    });
    return response.data;
  }

  /**
   * Delete a review reply
   */
  async deleteReply(reviewName: string): Promise<void> {
    await this.mybusiness.accounts.locations.reviews.deleteReply({
      name: `${reviewName}/reply`,
    });
  }

  /**
   * Batch get reviews for multiple locations
   */
  async batchGetReviews(
    accountId: string,
    locationNames: string[]
  ): Promise<Map<string, Review[]>> {
    const response = await this.mybusiness.accounts.locations.batchGetReviews({
      name: `accounts/${accountId}`,
      locationNames,
    });

    const result = new Map<string, Review[]>();
    for (const locationReviews of response.data.locationReviews || []) {
      result.set(locationReviews.locationName, locationReviews.reviews || []);
    }
    return result;
  }

  /**
   * Get unreplied reviews (for auto-reply processing)
   */
  async getUnrepliedReviews(
    accountId: string,
    locationId: string
  ): Promise<Review[]> {
    const allReviews: Review[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.listReviews(accountId, locationId, {
        pageSize: 50,
        pageToken,
      });

      // Filter for reviews without replies or with rejected replies
      const unreplied = response.reviews.filter(r => 
        !r.reviewReply || 
        r.reviewReply.reviewReplyState === 'REJECTED'
      );
      allReviews.push(...unreplied);

      pageToken = response.nextPageToken;
    } while (pageToken);

    return allReviews;
  }
}
