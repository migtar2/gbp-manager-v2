/**
 * Cliente REST delgadito para los endpoints de Business Profile que NO
 * tienen cliente en el SDK `googleapis` (el legacy `mybusiness:v4` fue
 * retirado del SDK y del discovery, pero los endpoints de reviews y
 * localPosts siguen operativos — verificado con probes HTTP 2026-10-12,
 * `docs/audits/P01_API_GOOGLE.md`).
 *
 * Las peticiones se firman con el OAuth2Client de google-auth-library
 * (renovación de access token incluida). El transporte se inyecta para tests.
 */

import { OAuth2Client } from 'google-auth-library';

export interface RestRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Ruta relativa al baseUrl, p. ej. `/accounts/1/locations/2/reviews`. */
  url: string;
  params?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
}

/** Transporte mínimo usado por las capas de API (inyectable en tests). */
export interface RestClient {
  request<T>(req: RestRequest): Promise<T>;
}

export class GoogleRestClient implements RestClient {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly auth: OAuth2Client,
    private readonly baseUrl: string = 'https://mybusiness.googleapis.com/v4',
    options: {
      maxRetries?: number;
      baseDelayMs?: number;
      sleep?: (ms: number) => Promise<void>;
    } = {}
  ) {
    this.maxRetries = options.maxRetries ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async request<T>(req: RestRequest): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        const response = await this.auth.request({
          method: req.method,
          url: `${this.baseUrl}${req.url}`,
          params: req.params,
          data: req.data,
        });
        return response.data as T;
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        const retryable = status === 429 || (status !== undefined && status >= 500);
        if (!retryable || attempt >= this.maxRetries) throw error;
        attempt++;
        // Backoff exponencial con jitter (recomendado por Google ante 429).
        const jitter = Math.floor(Math.random() * this.baseDelayMs);
        await this.sleep(this.baseDelayMs * 2 ** (attempt - 1) + jitter);
      }
    }
  }
}

/** Limita pageSize al máximo permitido por la API (50 para reviews). */
export function clampPageSize(requested: number | undefined, fallback: number, max: number): number {
  if (requested === undefined || Number.isNaN(requested)) return fallback;
  return Math.min(Math.max(Math.trunc(requested), 1), max);
}
