import { ReviewsAPI, Review } from '../api/reviews';
import { PostsAPI, LocalPost } from '../api/posts';
import { RestClient, RestRequest } from '../api/gbp-rest';
import { IdempotencyGuard } from './guards';
import {
  replyToReviewOp,
  deleteReviewReplyOp,
  createPostOp,
  deletePostOp,
  writeEnabled,
} from './write-ops';

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

const REVIEW_A = 'accounts/1/locations/A/reviews/r1';
const REVIEW_B = 'accounts/1/locations/B/reviews/r2';
const POST_A = 'accounts/1/locations/A/localPosts/p1';
const POST_B = 'accounts/1/locations/B/localPosts/p2';

describe('writeEnabled (gate global)', () => {
  it('fail closed: sin env no hay escrituras', () => {
    expect(writeEnabled({})).toBe(false);
    expect(writeEnabled({ GBP_ENABLE_WRITE_TOOLS: 'true' })).toBe(true);
  });
});

describe('replyToReviewOp', () => {
  it('ejecuta la escritura cuando todo coincide', async () => {
    const rest = fakeRest(() => ({ comment: 'ok', updateTime: 't' }));
    const api = new ReviewsAPI(rest);
    const result = await replyToReviewOp(api, new IdempotencyGuard(), {
      accountId: '1',
      locationId: 'A',
      reviewName: REVIEW_A,
      comment: 'Gracias',
    });
    expect(result.success).toBe(true);
    expect(rest.calls).toHaveLength(1);
  });

  it('AISLAMIENTO: nunca escribe sobre la ubicación B si la reseña pertenece a A', async () => {
    const rest = fakeRest(() => ({ comment: 'ok', updateTime: 't' }));
    const api = new ReviewsAPI(rest);

    // Atacante/bug: declara ubicación B pero la reseña es de A.
    const result = await replyToReviewOp(api, new IdempotencyGuard(), {
      accountId: '1',
      locationId: 'B',
      reviewName: REVIEW_A,
      comment: 'Gracias',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('confusión de ubicaciones');
    expect(rest.calls).toHaveLength(0); // ni una sola llamada a la API
  });

  it('AISLAMIENTO: tampoco entre cuentas', async () => {
    const rest = fakeRest(() => ({ comment: 'ok', updateTime: 't' }));
    const api = new ReviewsAPI(rest);
    const result = await replyToReviewOp(api, new IdempotencyGuard(), {
      accountId: '999',
      locationId: 'A',
      reviewName: REVIEW_A,
      comment: 'Gracias',
    });
    expect(result.success).toBe(false);
    expect(rest.calls).toHaveLength(0);
  });

  it('idempotencia: el mismo comentario sobre la misma reseña solo se envía una vez', async () => {
    const rest = fakeRest(() => ({ comment: 'ok', updateTime: 't' }));
    const api = new ReviewsAPI(rest);
    const idem = new IdempotencyGuard();
    const args = { accountId: '1', locationId: 'A', reviewName: REVIEW_A, comment: 'Gracias' };

    expect((await replyToReviewOp(api, idem, args)).success).toBe(true);
    const second = await replyToReviewOp(api, idem, args);
    expect(second.success).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(rest.calls).toHaveLength(1);
  });

  it('comentarios distintos sobre la misma reseña sí se permiten', async () => {
    const rest = fakeRest(() => ({ comment: 'ok', updateTime: 't' }));
    const api = new ReviewsAPI(rest);
    const idem = new IdempotencyGuard();
    await replyToReviewOp(api, idem, { accountId: '1', locationId: 'A', reviewName: REVIEW_A, comment: 'Uno' });
    await replyToReviewOp(api, idem, { accountId: '1', locationId: 'A', reviewName: REVIEW_A, comment: 'Dos' });
    expect(rest.calls).toHaveLength(2);
  });
});

describe('deleteReviewReplyOp', () => {
  it('rechaza nombres de otra ubicación sin llamar a la API', async () => {
    const rest = fakeRest(() => undefined);
    const api = new ReviewsAPI(rest);
    const result = await deleteReviewReplyOp(api, {
      accountId: '1',
      locationId: 'A',
      reviewName: REVIEW_B,
    });
    expect(result.success).toBe(false);
    expect(rest.calls).toHaveLength(0);
  });

  it('borra cuando el nombre coincide', async () => {
    const rest = fakeRest(() => undefined);
    const api = new ReviewsAPI(rest);
    const result = await deleteReviewReplyOp(api, {
      accountId: '1',
      locationId: 'A',
      reviewName: REVIEW_A,
    });
    expect(result.success).toBe(true);
    expect(rest.calls[0].method).toBe('DELETE');
  });
});

describe('createPostOp', () => {
  const post = { topicType: 'STANDARD' as const, summary: 'Hola' };

  it('idempotencia: el mismo payload solo crea una publicación', async () => {
    const rest = fakeRest(() => ({ name: POST_A, state: 'LIVE' } as Partial<LocalPost>));
    const api = new PostsAPI(rest);
    const idem = new IdempotencyGuard();

    expect((await createPostOp(api, idem, { accountId: '1', locationId: 'A', post })).success).toBe(true);
    const second = await createPostOp(api, idem, { accountId: '1', locationId: 'A', post });
    expect(second.duplicate).toBe(true);
    expect(rest.calls).toHaveLength(1);
  });

  it('cambia la clave si cambia la ubicación (post idéntico en B no se bloquea)', async () => {
    const rest = fakeRest(() => ({ name: POST_B, state: 'LIVE' } as Partial<LocalPost>));
    const api = new PostsAPI(rest);
    const idem = new IdempotencyGuard();

    await createPostOp(api, idem, { accountId: '1', locationId: 'A', post });
    const inB = await createPostOp(api, idem, { accountId: '1', locationId: 'B', post });
    expect(inB.success).toBe(true);
    expect(rest.calls[1].url).toBe('/accounts/1/locations/B/localPosts');
  });
});

describe('deletePostOp', () => {
  it('rechaza borrar un post de otra ubicación', async () => {
    const rest = fakeRest(() => undefined);
    const api = new PostsAPI(rest);
    const result = await deletePostOp(api, { accountId: '1', locationId: 'A', postName: POST_B });
    expect(result.success).toBe(false);
    expect(rest.calls).toHaveLength(0);
  });
});

describe('Revisión de tipos de reseña (sanity)', () => {
  it('los fixtures de Review son compatibles con la API', () => {
    const r: Review = {
      name: REVIEW_A,
      reviewId: 'r1',
      reviewer: { displayName: 'X' },
      starRating: 'THREE',
      createTime: '',
      updateTime: '',
    };
    expect(r.starRating).toBe('THREE');
  });
});
