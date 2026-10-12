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
/**
 * Segmento seguro para URLs de la API: sin barras, sin backslash y sin
 * segmentos de path traversal ('.', '..', o cualquier '..' interno) —
 * P2-01 de la revisión independiente.
 */
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

function isSafeSegment(value: string): boolean {
  return (
    SEGMENT_RE.test(value) &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('..') &&
    !value.includes('\\')
  );
}

export const REVIEW_NAME_RE = /^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/;
export const POST_NAME_RE = /^accounts\/[^/]+\/locations\/[^/]+\/localPosts\/[^/]+$/;

function parseName(name: string): Record<string, string> | null {
  const parts = name.split('/');
  if (parts.length % 2 !== 0) return null;
  const parsed: Record<string, string> = {};
  for (let i = 0; i < parts.length; i += 2) {
    const key = parts[i];
    const value = parts[i + 1];
    if (!key || !value || !isSafeSegment(value)) return null;
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
 *
 * Patrón pending/commit (P1-02): `begin(key)` reserva la clave ANTES de la
 * escritura (bloquea duplicados concurrentes), `commit(key)` la confirma al
 * tener éxito y `release(key)` la libera si la escritura falla — así un
 * reintento legítimo tras un error NO se descarta como duplicado.
 *
 * `checkAndRemember` mantiene la API anterior (begin+commit atómico).
 */
export class IdempotencyGuard {
  private readonly seen = new Map<string, { at: number; pending: boolean }>();

  constructor(
    private readonly ttlMs: number = 10 * 60 * 1000,
    private readonly maxEntries: number = 1000,
    private readonly now: () => number = Date.now
  ) {}

  /** Reserva la clave. false = ya vista dentro de la ventana TTL. */
  begin(key: string): boolean {
    this.evict();
    const entry = this.seen.get(key);
    const current = this.now();
    if (entry !== undefined && current - entry.at < this.ttlMs) return false;
    this.seen.set(key, { at: current, pending: true });
    return true;
  }

  /** Confirma la escritura: la clave queda registrada hasta expirar. */
  commit(key: string): void {
    const entry = this.seen.get(key);
    if (entry) this.seen.set(key, { at: this.now(), pending: false });
  }

  /** Libera una reserva pendiente tras un fallo (permite reintentar). */
  release(key: string): void {
    const entry = this.seen.get(key);
    if (entry?.pending) this.seen.delete(key);
  }

  checkAndRemember(key: string): boolean {
    if (!this.begin(key)) return false;
    this.commit(key);
    return true;
  }

  /** Clave estándar para escrituras: recurso + hash del payload. */
  static keyFor(resource: string, payload: unknown): string {
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return `${resource}:${digest}`;
  }

  private evict(): void {
    const current = this.now();
    for (const [key, entry] of this.seen) {
      if (current - entry.at >= this.ttlMs) this.seen.delete(key);
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
 * trata como DATOS no confiables (prompt injection). Se normalizan retornos
 * de carro y se trunca el texto. La separación estructural frente a
 * inyección la garantiza el serializado JSON de la herramienta; esta función
 * NO es, por sí sola, una protección completa.
 */
export function sanitizeExternalText(text: string, maxLength: number = 2000): string {
  return text
    .replace(/\r/g, '')
    .slice(0, maxLength)
    .trim();
}
