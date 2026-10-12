/**
 * Google Business Profile Posts API (localPosts)
 *
 * Endpoints REST verificados (2026-10-12):
 *   GET    /accounts/{a}/locations/{l}/localPosts
 *   GET    /accounts/{a}/locations/{l}/localPosts/{p}
 *   POST   /accounts/{a}/locations/{l}/localPosts
 *   PATCH  /accounts/{a}/locations/{l}/localPosts/{p}
 *   DELETE /accounts/{a}/locations/{l}/localPosts/{p}
 */

import { RestClient } from './gbp-rest';

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

/** Campos de actualización admitidos -> nombres de campo de la API. */
const UPDATABLE_FIELDS: Array<keyof CreatePostRequest> = [
  'topicType',
  'languageCode',
  'summary',
  'callToAction',
  'media',
  'event',
  'offer',
  'recurrenceInfo',
];

export type CtaActionType = 'LEARN_MORE' | 'BOOK' | 'ORDER' | 'SHOP' | 'SIGN_UP' | 'CALL';

/** Construye el cuerpo y el updateMask de un PATCH de localPosts. */
export function buildUpdatePayload(
  updates: Partial<CreatePostRequest>
): { body: Record<string, unknown>; updateMask: string } {
  const body: Record<string, unknown> = {};
  for (const field of UPDATABLE_FIELDS) {
    if (updates[field] !== undefined) body[field] = updates[field];
  }
  return { body, updateMask: Object.keys(body).join(',') };
}

export class PostsAPI {
  constructor(private readonly rest: RestClient) {}

  /** Lista publicaciones locales de una ubicación. */
  async listPosts(
    accountId: string,
    locationId: string,
    options: { pageSize?: number; pageToken?: string } = {}
  ): Promise<{ posts: LocalPost[]; nextPageToken?: string }> {
    const response = await this.rest.request<{
      localPosts?: LocalPost[];
      nextPageToken?: string;
    }>({
      method: 'GET',
      url: `/accounts/${accountId}/locations/${locationId}/localPosts`,
      params: {
        pageSize: options.pageSize || 100,
        pageToken: options.pageToken,
      },
    });

    return {
      posts: response.localPosts || [],
      nextPageToken: response.nextPageToken,
    };
  }

  /** Crea una publicación local. */
  async createPost(
    accountId: string,
    locationId: string,
    post: CreatePostRequest
  ): Promise<LocalPost> {
    return this.rest.request<LocalPost>({
      method: 'POST',
      url: `/accounts/${accountId}/locations/${locationId}/localPosts`,
      data: {
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
  }

  /** Obtiene una publicación concreta. */
  async getPost(postName: string): Promise<LocalPost> {
    return this.rest.request<LocalPost>({ method: 'GET', url: `/${postName}` });
  }

  /** Actualiza campos concretos de una publicación (updateMask explícito). */
  async updatePost(
    postName: string,
    updates: Partial<CreatePostRequest>
  ): Promise<LocalPost> {
    const { body, updateMask } = buildUpdatePayload(updates);
    if (!updateMask) {
      throw new Error('updatePost: no hay campos válidos para actualizar');
    }
    return this.rest.request<LocalPost>({
      method: 'PATCH',
      url: `/${postName}`,
      params: { updateMask },
      data: body,
    });
  }

  /** Elimina una publicación local. */
  async deletePost(postName: string): Promise<void> {
    await this.rest.request<void>({ method: 'DELETE', url: `/${postName}` });
  }

  /** Crea una publicación estándar con CTA opcional. */
  async createStandardPost(
    accountId: string,
    locationId: string,
    text: string,
    options: {
      ctaType?: CtaActionType;
      ctaUrl?: string;
      imageUrl?: string;
    } = {}
  ): Promise<LocalPost> {
    return this.createPost(accountId, locationId, {
      topicType: 'STANDARD',
      summary: text,
      callToAction:
        options.ctaType && options.ctaUrl
          ? { actionType: options.ctaType, url: options.ctaUrl }
          : undefined,
      media: options.imageUrl
        ? [
            {
              name: `accounts/${accountId}/locations/${locationId}/media/${Date.now()}`,
              sourceUrl: options.imageUrl,
              contentType: 'PHOTO',
            },
          ]
        : undefined,
    });
  }

  /** Crea una publicación de evento. */
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
      ctaType?: 'LEARN_MORE' | 'BOOK' | 'ORDER' | 'SHOP' | 'SIGN_UP' | 'CALL';
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
      callToAction:
        eventData.ctaType && eventData.ctaUrl
          ? { actionType: eventData.ctaType, url: eventData.ctaUrl }
          : undefined,
    });
  }

  /** Crea una publicación de oferta. */
  async createOfferPost(
    accountId: string,
    locationId: string,
    offerData: {
      summary: string;
      couponCode?: string;
      redeemOnlineUrl?: string;
      termsConditions?: string;
      ctaType?: 'LEARN_MORE' | 'BOOK' | 'ORDER' | 'SHOP' | 'SIGN_UP' | 'CALL';
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
      callToAction:
        offerData.ctaType && offerData.ctaUrl
          ? { actionType: offerData.ctaType, url: offerData.ctaUrl }
          : undefined,
    });
  }
}
