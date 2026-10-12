/**
 * Operaciones de escritura del MCP (Fase P03), separadas del transporte
 * para poder testearlas: validación de nombres, aislamiento de
 * cuentas/ubicaciones, idempotencia y gate de escritura.
 */

import { ReviewsAPI, ReviewReply } from '../api/reviews';
import { PostsAPI, CreatePostRequest, LocalPost } from '../api/posts';
import {
  validateReviewName,
  validatePostName,
  isWriteEnabled,
  IdempotencyGuard,
} from './guards';

export interface WriteOpResult<T = unknown> {
  success: boolean;
  duplicate?: boolean;
  error?: string;
  data?: T;
}

function denied<T = unknown>(reason: string): WriteOpResult<T> {
  return { success: false, error: reason };
}

/** Gate global de escritura (fail closed). */
export function writeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isWriteEnabled(env);
}

/** Responde a una reseña con validación de pertenencia e idempotencia. */
export async function replyToReviewOp(
  api: ReviewsAPI,
  idem: IdempotencyGuard,
  args: { accountId: string; locationId: string; reviewName: string; comment: string }
): Promise<WriteOpResult<{ reviewReply: ReviewReply }>> {
  const nameCheck = validateReviewName(args.reviewName, {
    accountId: args.accountId,
    locationId: args.locationId,
  });
  if (!nameCheck.ok) return denied(nameCheck.reason || 'nombre inválido');

  const key = IdempotencyGuard.keyFor('reply_review', {
    reviewName: args.reviewName,
    comment: args.comment,
  });
  // pending/commit: la clave se confirma SOLO si la escritura tiene éxito.
  if (!idem.begin(key)) {
    return { success: false, duplicate: true, error: 'Operación duplicada ignorada' };
  }

  try {
    const result = await api.replyToReview(args.reviewName, args.comment);
    idem.commit(key);
    return { success: true, data: result };
  } catch (error) {
    idem.release(key);
    throw error;
  }
}

/** Borra la respuesta de una reseña con validación de pertenencia. */
export async function deleteReviewReplyOp(
  api: ReviewsAPI,
  args: { accountId: string; locationId: string; reviewName: string }
): Promise<WriteOpResult> {
  const nameCheck = validateReviewName(args.reviewName, {
    accountId: args.accountId,
    locationId: args.locationId,
  });
  if (!nameCheck.ok) return denied(nameCheck.reason || 'nombre inválido');

  await api.deleteReply(args.reviewName);
  return { success: true };
}

/** Crea una publicación con idempotencia. */
export async function createPostOp(
  api: PostsAPI,
  idem: IdempotencyGuard,
  args: { accountId: string; locationId: string; post: CreatePostRequest }
): Promise<WriteOpResult<LocalPost>> {
  const key = IdempotencyGuard.keyFor('create_post', {
    accountId: args.accountId,
    locationId: args.locationId,
    post: args.post,
  });
  // pending/commit: la clave se confirma SOLO si la escritura tiene éxito.
  if (!idem.begin(key)) {
    return { success: false, duplicate: true, error: 'Operación duplicada ignorada' };
  }

  try {
    const post = await api.createPost(args.accountId, args.locationId, args.post);
    idem.commit(key);
    return { success: true, data: post };
  } catch (error) {
    idem.release(key);
    throw error;
  }
}

/** Borra una publicación con validación de pertenencia. */
export async function deletePostOp(
  api: PostsAPI,
  args: { accountId: string; locationId: string; postName: string }
): Promise<WriteOpResult> {
  const nameCheck = validatePostName(args.postName, {
    accountId: args.accountId,
    locationId: args.locationId,
  });
  if (!nameCheck.ok) return denied(nameCheck.reason || 'nombre inválido');

  await api.deletePost(args.postName);
  return { success: true };
}
