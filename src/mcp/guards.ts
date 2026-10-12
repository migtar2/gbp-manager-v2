/**
 * Guards del servidor MCP (Fase P03).
 *
 * Reglas de endurecimiento aplicadas a TODA herramienta MCP:
 * - Herramientas de escritura desactivadas por defecto (GBP_ENABLE_WRITE_TOOLS=true para activar).
 * - Validación estricta de nombres cualificados de Google (accounts/x/locations/y/...).
 * - Protección de confusión de cuentas/ubicaciones: el nombre debe coincidir
 *   con los IDs declarados en los argumentos.
 * - Idempotencia: guard para no ejecutar la misma escritura dos veces.
 *
 * Todo puro y testeable: el servidor MCP solo orquesta.
 */

import { createHash } from 'crypto';

export interface NameValidationResult {
  ok: boolean;
  reason?: string;
}

const ACCOUNT_ID_RE = /^\d+$/;
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

export const REVIEW_NAME_RE = /^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/;
export const POST_NAME_RE = /^accounts\/[^/]+\/locations\/[^/]+\/localPosts\/[^/]+$/;

function parseName(name: string): Record<string, string> | null {
  const parts = name.split('/');
  if (parts.length % 2 !== 0) return null;
  const parsed: Record<string, string> = {};
  for (let i = 0; i < parts.length; i += 2) {
    const key = parts[i];
    const value = parts[i + 1];
    if (!key || !value || !SEGMENT_RE.test(value)) return null;
    parsed[key] = value;
  }
  return parsed;
}

/**
 * Valida un nombre cualificado de reseña y, si se indican accountId/locationId,
 * que pertenezcan efectivamente a esa cuenta y ubicación.
 */
export function validateReviewName(
  reviewName: string,
  expected?: { accountId?: string; locationId?: string }
): NameValidationResult {
  return validateQualifiedName(reviewName, REVIEW_NAME_RE, 'reviews', expected);
}

/** Igual que validateReviewName pero para publicaciones locales. */
export function validatePostName(
  postName: string,
  expected?: { accountId?: string; locationId?: string }
): NameValidationResult {
  return validateQualifiedName(postName, POST_NAME_RE, 'localPosts', expected);
}

function validateQualifiedName(
  name: string,
  pattern: RegExp,
  resource: string,
  expected?: { accountId?: string; locationId?: string }
): NameValidationResult {
  if (typeof name !== 'string' || !pattern.test(name)) {
    return { ok: false, reason: `nombre de ${resource} inválido: ${JSON.stringify(name)}` };
  }

  const parsed = parseName(name);
  if (!parsed || parsed.accounts === undefined || parsed.locations === undefined) {
    return { ok: false, reason: `estructura de nombre de ${resource} inválida` };
  }

  if (!ACCOUNT_ID_RE.test(parsed.accounts)) {
    return { ok: false, reason: `accountId inválido en el nombre: ${parsed.accounts}` };
  }

  if (expected?.accountId && parsed.accounts !== expected.accountId) {
    return {
      ok: false,
      reason: `confusión de cuentas: el nombre pertenece a accounts/${parsed.accounts}, no a accounts/${expected.accountId}`,
    };
  }

  if (expected?.locationId && parsed.locations !== expected.locationId) {
    return {
      ok: false,
      reason: `confusión de ubicaciones: el nombre pertenece a locations/${parsed.locations}, no a locations/${expected.locationId}`,
    };
  }

  return { ok: true };
}

/**
 * Herramientas de escritura activas solo con env explícito.
 * Cualquier valor distinto de 'true' ⇒ desactivadas (fail closed).
 */
export function isWriteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GBP_ENABLE_WRITE_TOOLS === 'true';
}

/**
 * Guard de idempotencia en memoria para operaciones de escritura.
 * `checkAndRemember(key)` devuelve true solo la primera vez que ve una clave
 * dentro de la ventana TTL. Evita duplicados por reintentos del cliente MCP.
 */
export class IdempotencyGuard {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number = 10 * 60 * 1000,
    private readonly maxEntries: number = 1000,
    private readonly now: () => number = Date.now
  ) {}

  checkAndRemember(key: string): boolean {
    this.evict();
    const at = this.seen.get(key);
    const current = this.now();
    if (at !== undefined && current - at < this.ttlMs) return false;
    this.seen.set(key, current);
    return true;
  }

  /** Clave estándar para escrituras: recurso + hash del payload. */
  static keyFor(resource: string, payload: unknown): string {
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return `${resource}:${digest}`;
  }

  private evict(): void {
    const current = this.now();
    for (const [key, at] of this.seen) {
      if (current - at >= this.ttlMs) this.seen.delete(key);
    }
    // Límite duro de memoria: se descartan las entradas más antiguas.
    while (this.seen.size > this.maxEntries) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
  }
}

/**
 * Saneado de datos externos: el contenido de reseñas/nombres de Google se
 * trata como DATOS no confiables (prompt injection). Se trunca y se marcan
 * saltos de línea para que un texto hostil no pueda reestructurar la salida
 * de la herramienta.
 */
export function sanitizeExternalText(text: string, maxLength: number = 2000): string {
  return text
    .replace(/\r/g, '')
    .slice(0, maxLength)
    .trim();
}
