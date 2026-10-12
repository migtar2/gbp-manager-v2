import { ReviewsAPI, extractReviewReply, hasVisibleReply, Review } from './reviews';
import { PostsAPI, buildUpdatePayload } from './posts';
import { RestClient, RestRequest, clampPageSize } from './gbp-rest';

/** RestClient falso que registra las llamadas y responde con fixtures. */
function fakeRest(handler: (req: RestRequest) => unknown): RestClient & { calls: RestRequest[] } {
  const calls: RestRequest[] = [];
  return {
    calls,
    async request<T>(req: RestRequest): Promise<T> {
      calls.push(req);
      return handler(req) as T;
    },
  };
}

function reviewFixture(overrides: Partial<Review> = {}): Review {
  return {
    name: 'accounts/1/locations/A/reviews/r1',
    reviewId: 'r1',
    reviewer: { displayName: 'María' },
    starRating: 'FIVE',
    comment: 'Muy bueno',
    createTime: '2026-01-01T00:00:00Z',
    updateTime: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('clampPageSize', () => {
  it('aplica fallback y máximo', () => {
    expect(clampPageSize(undefined, 50, 50)).toBe(50);
    expect(clampPageSize(500, 50, 50)).toBe(50);
    expect(clampPageSize(10, 50, 50)).toBe(10);
    expect(clampPageSize(0, 50, 50)).toBe(1);
  });
});

describe('ReviewsAPI', () => {
  it('listReviews construye la URL correcta y limita pageSize a 50', async () => {
    const rest = fakeRest(() => ({ reviews: [], totalReviewCount: 0, averageRating: 0 }));
    const api = new ReviewsAPI(rest);
    await api.listReviews('1', 'A', { pageSize: 500 });

    expect(rest.calls).toHaveLength(1);
    expect(rest.calls[0].url).toBe('/accounts/1/locations/A/reviews');
    expect(rest.calls[0].params?.pageSize).toBe(50);
  });

  it('listAllReviews pagina hasta el final', async () => {
    let page = 0;
    const rest = fakeRest(() => {
      page++;
      return page < 3
        ? { reviews: [reviewFixture({ reviewId: `r${page}` })], nextPageToken: `t${page}` }
        : { reviews: [reviewFixture({ reviewId: 'r3' })] };
    });
    const api = new ReviewsAPI(rest);

    const reviews = await api.listAllReviews('1', 'A');
    expect(reviews).toHaveLength(3);
    expect(rest.calls).toHaveLength(3);
    expect(rest.calls[1].params?.pageToken).toBe('t1');
    expect(rest.calls[2].params?.pageToken).toBe('t2');
  });

  it('listAllReviews respeta maxPages (límite de seguridad)', async () => {
    const rest = fakeRest(() => ({ reviews: [], nextPageToken: 'siempre' }));
    const api = new ReviewsAPI(rest);
    await api.listAllReviews('1', 'A', { maxPages: 4 });
    expect(rest.calls).toHaveLength(4);
  });

  describe('hasVisibleReply / getUnrepliedReviews (pitfall reviewReply:{})', () => {
    it('reviewReply vacío NO cuenta como respondida', () => {
      expect(hasVisibleReply(reviewFixture({ reviewReply: {} as never }))).toBe(false);
      expect(hasVisibleReply(reviewFixture({ reviewReply: { comment: '   ', updateTime: '' } }))).toBe(false);
      expect(hasVisibleReply(reviewFixture())).toBe(false);
      expect(
        hasVisibleReply(reviewFixture({ reviewReply: { comment: 'Gracias', updateTime: '' } }))
      ).toBe(true);
    });

    it('getUnrepliedReviews incluye vacías y rechazadas, excluye contestadas', async () => {
      const rest = fakeRest(() => ({
        reviews: [
          reviewFixture({ reviewId: 'sin-reply' }),
          reviewFixture({ reviewId: 'reply-vacio', reviewReply: {} as never }),
          reviewFixture({
            reviewId: 'contestada',
            reviewReply: { comment: 'Gracias!', updateTime: '', reviewReplyState: 'APPROVED' },
          }),
          reviewFixture({
            reviewId: 'rechazada',
            reviewReply: { comment: 'Borrada', updateTime: '', reviewReplyState: 'REJECTED' },
          }),
        ],
      }));
      const api = new ReviewsAPI(rest);
      const unreplied = await api.getUnrepliedReviews('1', 'A');
      expect(unreplied.map((r) => r.reviewId).sort()).toEqual(['rechazada', 'reply-vacio', 'sin-reply']);
    });
  });

  describe('replyToReview (contrato updateReply)', () => {
    it('normaliza respuesta plana (ReviewReply directo)', async () => {
      const rest = fakeRest(() => ({ comment: 'Hola', updateTime: 't', reviewReplyState: 'PENDING' }));
      const api = new ReviewsAPI(rest);

      const result = await api.replyToReview('accounts/1/locations/A/reviews/r1', 'Hola');
      expect(rest.calls[0].method).toBe('PUT');
      expect(rest.calls[0].url).toBe('/accounts/1/locations/A/reviews/r1/reply');
      expect(rest.calls[0].data).toEqual({ comment: 'Hola' });
      expect(result.reviewReply.comment).toBe('Hola');
      expect(result.reviewReply.reviewReplyState).toBe('PENDING');
    });

    it('normaliza respuesta anidada ({reviewReply: {...}})', async () => {
      const rest = fakeRest(() => ({ reviewReply: { comment: 'Hola', updateTime: 't' } }));
      const api = new ReviewsAPI(rest);
      const result = await api.replyToReview('accounts/1/locations/A/reviews/r1', 'Hola');
      expect(result.reviewReply.comment).toBe('Hola');
    });

    it('P2-02: {reviewReply:{}} sin comment NO se acepta como respuesta', async () => {
      const rest = fakeRest(() => ({ reviewReply: {} }));
      const api = new ReviewsAPI(rest);
      await expect(api.replyToReview('accounts/1/locations/A/reviews/r1', 'x')).rejects.toThrow(
        'sin ReviewReply'
      );
    });

    it('falla explícitamente con estructura desconocida', async () => {
      const rest = fakeRest(() => ({ unexpected: true }));
      const api = new ReviewsAPI(rest);
      await expect(api.replyToReview('accounts/1/locations/A/reviews/r1', 'x')).rejects.toThrow(
        'sin ReviewReply'
      );
    });

    it('extractReviewReply rechaza null/primitivos', () => {
      expect(() => extractReviewReply(null)).toThrow();
      expect(() => extractReviewReply('texto')).toThrow();
    });
  });

  it('deleteReply llama a DELETE sobre .../reply', async () => {
    const rest = fakeRest(() => undefined);
    const api = new ReviewsAPI(rest);
    await api.deleteReply('accounts/1/locations/A/reviews/r1');
    expect(rest.calls[0].method).toBe('DELETE');
    expect(rest.calls[0].url).toBe('/accounts/1/locations/A/reviews/r1/reply');
  });

  it('aislamiento: cada operación usa SIEMPRE la ubicación declarada', async () => {
    const rest = fakeRest(() => ({ reviews: [] }));
    const api = new ReviewsAPI(rest);
    await api.listReviews('1', 'A');
    await api.listReviews('1', 'B');
    expect(rest.calls[0].url).toContain('/locations/A/');
    expect(rest.calls[1].url).toContain('/locations/B/');
    expect(rest.calls[0].url).not.toContain('/locations/B/');
    expect(rest.calls[1].url).not.toContain('/locations/A/');
  });
});

describe('PostsAPI', () => {
  it('buildUpdatePayload solo incluye campos válidos y genera updateMask (P2-001)', () => {
    const { body, updateMask } = buildUpdatePayload({
      summary: 'Nuevo resumen',
      callToAction: { actionType: 'BOOK', url: 'https://example.com' },
      // @ts-expect-error — campo inexistente debe ignorarse
      campoInventado: 'x',
    });
    expect(Object.keys(body).sort()).toEqual(['callToAction', 'summary']);
    expect(updateMask.split(',').sort()).toEqual(['callToAction', 'summary']);
  });

  it('updatePost sin campos válidos lanza error', async () => {
    const rest = fakeRest(() => ({}));
    const api = new PostsAPI(rest);
    await expect(api.updatePost('accounts/1/locations/A/localPosts/p1', {})).rejects.toThrow(
      'no hay campos'
    );
    expect(rest.calls).toHaveLength(0);
  });

  it('updatePost usa PATCH con updateMask como query', async () => {
    const rest = fakeRest(() => ({ name: 'accounts/1/locations/A/localPosts/p1' }));
    const api = new PostsAPI(rest);
    await api.updatePost('accounts/1/locations/A/localPosts/p1', { summary: 'x' });
    expect(rest.calls[0].method).toBe('PATCH');
    expect(rest.calls[0].params?.updateMask).toBe('summary');
  });

  it('createPost envía el body con idioma por defecto es', async () => {
    const rest = fakeRest(() => ({ name: 'p', state: 'LIVE' }));
    const api = new PostsAPI(rest);
    await api.createPost('1', 'A', { topicType: 'STANDARD', summary: 'Hola' });
    expect(rest.calls[0].method).toBe('POST');
    expect(rest.calls[0].url).toBe('/accounts/1/locations/A/localPosts');
    expect(rest.calls[0].data).toMatchObject({ languageCode: 'es', topicType: 'STANDARD', summary: 'Hola' });
  });

  it('listPosts lee el campo localPosts', async () => {
    const rest = fakeRest(() => ({ localPosts: [{ name: 'p1' }] }));
    const api = new PostsAPI(rest);
    const result = await api.listPosts('1', 'A');
    expect(result.posts).toHaveLength(1);
  });

  it('deletePost llama a DELETE sobre el nombre dado', async () => {
    const rest = fakeRest(() => undefined);
    const api = new PostsAPI(rest);
    await api.deletePost('accounts/1/locations/A/localPosts/p1');
    expect(rest.calls[0].method).toBe('DELETE');
    expect(rest.calls[0].url).toBe('/accounts/1/locations/A/localPosts/p1');
  });
});
