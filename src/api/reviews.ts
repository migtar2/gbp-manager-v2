/**
 * Google Business Profile Reviews API
 *
 * Endpoints REST verificados (2026-10-12):
 *   GET    /accounts/{a}/locations/{l}/reviews
 *   GET    /accounts/{a}/locations/{l}/reviews/{r}
 *   PUT    /accounts/{a}/locations/{l}/reviews/{r}/reply
 *   DELETE /accounts/{a}/locations/{l}/reviews/{r}/reply
 *
 * NOTA: el método batchGetReviews NO existe (404 en probe) y se eliminó.
 * El contrato de updateReply se normaliza porque la API puede devolver un
 * ReviewReply plano o una estructura anidada (P1-005 del Reality Audit).
 */

import { RestClient, clampPageSize } from './gbp-rest';

export type StarRatingEnum = 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';

export interface ReviewReply {
  comment: string;
  updateTime: string;
  reviewReplyState?: 'REVIEW_REPLY_STATE_UNSPECIFIED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  /**
   * Enum PolicyViolation (output only, añadido 2026-07): p. ej.
   * ACCOUNT_RESTRICTED_AND_SUSPENDED, LOCATION_SUSPENDED, EDITING_RESTRICTION...
   * Solo se rellena si reviewReplyState = REJECTED. Se modela como string
   * libre para tolerar valores nuevos (la API pide prepararse para ellos).
   */
  policyViolation?: string;
}

export interface Review {
  name: string;
  reviewId: string;
  reviewer: {
    displayName: string;
    profilePhotoUrl?: string;
  };
  starRating: StarRatingEnum;
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: ReviewReply;
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

const MAX_REVIEWS_PAGE_SIZE = 50;

/**
 * ¿Tiene la reseña una respuesta publicada realmente?
 * PITFALL documentado: `reviewReply: {}` (objeto vacío) es truthy pero NO
 * es una respuesta — hay que comprobar comment no vacío.
 */
export function hasVisibleReply(review: Review): boolean {
  const comment = review.reviewReply?.comment;
  return typeof comment === 'string' && comment.trim().length > 0;
}

/** Normaliza la respuesta de updateReply (plana o anidada). */
export function extractReviewReply(data: unknown): ReviewReply {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (obj.reviewReply && typeof obj.reviewReply === 'object') {
      const nested = obj.reviewReply as Record<string, unknown>;
      // Pitfall P2-02: un `{reviewReply:{}}` vacío NO es una respuesta.
      if (typeof nested.comment === 'string') return nested as unknown as ReviewReply;
    }
    if (typeof obj.comment === 'string') {
      return data as ReviewReply;
    }
  }
  throw new Error('Respuesta inesperada de reviews.updateReply: sin ReviewReply');
}

export class ReviewsAPI {
  constructor(private readonly rest: RestClient) {}

  /** Lista una página de reseñas de una ubicación. */
  async listReviews(
    accountId: string,
    locationId: string,
    options: {
      pageSize?: number;
      pageToken?: string;
      orderBy?: string;
    } = {}
  ): Promise<ReviewsListResponse> {
    const response = await this.rest.request<{
      reviews?: Review[];
      nextPageToken?: string;
      totalReviewCount?: number;
      averageRating?: number;
    }>({
      method: 'GET',
      url: `/accounts/${accountId}/locations/${locationId}/reviews`,
      params: {
        pageSize: clampPageSize(options.pageSize, MAX_REVIEWS_PAGE_SIZE, MAX_REVIEWS_PAGE_SIZE),
        pageToken: options.pageToken,
        orderBy: options.orderBy || 'updateTime desc',
      },
    });

    return {
      reviews: response.reviews || [],
      nextPageToken: response.nextPageToken,
      totalReviewCount: response.totalReviewCount || 0,
      averageRating: response.averageRating || 0,
    };
  }

  /** Recorre TODAS las páginas (límite de seguridad: maxPages). */
  async listAllReviews(
    accountId: string,
    locationId: string,
    options: { pageSize?: number; maxPages?: number; orderBy?: string } = {}
  ): Promise<Review[]> {
    const maxPages = options.maxPages ?? 20;
    const all: Review[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const response = await this.listReviews(accountId, locationId, {
        pageSize: options.pageSize,
        pageToken,
        orderBy: options.orderBy,
      });
      all.push(...response.reviews);
      pageToken = response.nextPageToken;
      if (!pageToken) break;
    }

    return all;
  }

  /** Obtiene una reseña individual. */
  async getReview(reviewName: string): Promise<Review> {
    return this.rest.request<Review>({ method: 'GET', url: `/${reviewName}` });
  }

  /**
   * Responde a una reseña. Devuelve el ReviewReply normalizado, comprobando
   * el estado devuelto por Google (PENDING/APPROVED/REJECTED cuando existe).
   */
  async replyToReview(reviewName: string, comment: string): Promise<{ reviewReply: ReviewReply }> {
    const data = await this.rest.request<unknown>({
      method: 'PUT',
      url: `/${reviewName}/reply`,
      data: { comment },
    });
    return { reviewReply: extractReviewReply(data) };
  }

  /** Elimina la respuesta del negocio a una reseña. */
  async deleteReply(reviewName: string): Promise<void> {
    await this.rest.request<void>({ method: 'DELETE', url: `/${reviewName}/reply` });
  }

  /**
   * Reseñas pendientes de respuesta: sin reply, con reply vacío (objeto
   * `{}` — pitfall) o con reply rechazado por moderación.
   */
  async getUnrepliedReviews(
    accountId: string,
    locationId: string,
    options: { maxPages?: number } = {}
  ): Promise<Review[]> {
    const all = await this.listAllReviews(accountId, locationId, {
      pageSize: MAX_REVIEWS_PAGE_SIZE,
      maxPages: options.maxPages,
    });

    return all.filter((r) => {
      if (!hasVisibleReply(r)) return true;
      return r.reviewReply?.reviewReplyState === 'REJECTED';
    });
  }
}
