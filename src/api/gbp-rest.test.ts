import { GoogleRestClient, clampPageSize } from './gbp-rest';
import type { OAuth2Client } from 'google-auth-library';

interface FakeAuthCall {
  method?: string;
  url: string;
}

function fakeAuth(
  responses: Array<{ status?: number; data?: unknown }>
): { auth: OAuth2Client; calls: FakeAuthCall[]; sleeps: number[] } {
  const calls: FakeAuthCall[] = [];
  const sleeps: number[] = [];
  let index = 0;

  const auth = {
    async request(req: FakeAuthCall) {
      calls.push(req);
      const response = responses[Math.min(index, responses.length - 1)];
      index++;
      if (response.status !== undefined && response.status >= 400) {
        const error = new Error(`HTTP ${response.status}`) as Error & {
          response: { status: number };
        };
        error.response = { status: response.status };
        throw error;
      }
      return { data: response.data };
    },
  } as unknown as OAuth2Client;

  return { auth, calls, sleeps };
}

describe('clampPageSize', () => {
  it('aplica fallback y máximo', () => {
    expect(clampPageSize(undefined, 50, 50)).toBe(50);
    expect(clampPageSize(500, 50, 50)).toBe(50);
    expect(clampPageSize(10, 50, 50)).toBe(10);
    expect(clampPageSize(0, 50, 50)).toBe(1);
  });
});

describe('GoogleRestClient', () => {
  it('firma la petición contra el endpoint v4 correcto', async () => {
    const { auth, calls } = fakeAuth([{ data: { ok: true } }]);
    const client = new GoogleRestClient(auth, 'https://mybusiness.googleapis.com/v4');

    const result = await client.request<{ ok: boolean }>({
      method: 'GET',
      url: '/accounts/1/locations/2/reviews',
    });

    expect(result).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews',
    });
  });

  it('reintenta ante 429 con backoff y devuelve el resultado', async () => {
    const { auth, calls } = fakeAuth([
      { status: 429 },
      { status: 429 },
      { data: { ok: true } },
    ]);
    const sleeps: number[] = [];
    const client = new GoogleRestClient(auth, 'https://mybusiness.googleapis.com/v4', {
      maxRetries: 2,
      baseDelayMs: 100,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    const result = await client.request<{ ok: boolean }>({ method: 'GET', url: '/x' });
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
    // backoff exponencial: 100 y 200 (+jitter <100)
    expect(sleeps[0]).toBeGreaterThanOrEqual(100);
    expect(sleeps[0]).toBeLessThan(200);
    expect(sleeps[1]).toBeGreaterThanOrEqual(200);
    expect(sleeps[1]).toBeLessThan(300);
  });

  it('reintenta ante errores 5xx', async () => {
    const { auth, calls } = fakeAuth([{ status: 503 }, { data: { ok: true } }]);
    const client = new GoogleRestClient(auth, 'https://mybusiness.googleapis.com/v4', {
      maxRetries: 2,
      baseDelayMs: 1,
      sleep: async () => undefined,
    });
    const result = await client.request<{ ok: boolean }>({ method: 'GET', url: '/x' });
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('NO reintenta ante 401/403/404 (errores de autorización o recurso)', async () => {
    for (const status of [401, 403, 404]) {
      const { auth, calls } = fakeAuth([{ status }]);
      const client = new GoogleRestClient(auth, 'https://mybusiness.googleapis.com/v4', {
        maxRetries: 3,
        baseDelayMs: 1,
        sleep: async () => undefined,
      });
      await expect(client.request({ method: 'GET', url: '/x' })).rejects.toThrow(`HTTP ${status}`);
      expect(calls).toHaveLength(1);
    }
  });

  it('P2-05: NO reintenta 5xx en POST/PUT (escrituras no idempotentes)', async () => {
    for (const method of ['POST', 'PUT', 'PATCH'] as const) {
      const { auth, calls } = fakeAuth([{ status: 503 }]);
      const client = new GoogleRestClient(auth, 'https://mybusiness.googleapis.com/v4', {
        maxRetries: 3,
        baseDelayMs: 1,
        sleep: async () => undefined,
      });
      await expect(client.request({ method, url: '/x', data: {} })).rejects.toThrow('HTTP 503');
      expect(calls).toHaveLength(1);
    }
  });

  it('P2-05: SÍ reintenta 429 en POST/PUT (rate limit no aplica la escritura)', async () => {
    const { auth, calls } = fakeAuth([{ status: 429 }, { data: { ok: true } }]);
    const client = new GoogleRestClient(auth, 'https://mybusiness.googleapis.com/v4', {
      maxRetries: 2,
      baseDelayMs: 1,
      sleep: async () => undefined,
    });
    const result = await client.request<{ ok: boolean }>({ method: 'POST', url: '/x', data: {} });
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('P2-01: rechaza URLs con segmentos de path traversal', async () => {
    const { auth, calls } = fakeAuth([{ data: {} }]);
    const client = new GoogleRestClient(auth, 'https://mybusiness.googleapis.com/v4');

    for (const url of [
      '/accounts/1/locations/../reviews/x',
      '/accounts/1/locations/./reviews/x',
      '/accounts/1/locations/a..b/reviews/x',
      '/accounts/1/locations/a%2e%2e/reviews/x',
    ]) {
      await expect(client.request({ method: 'GET', url })).rejects.toThrow('segmento inseguro');
    }
    expect(calls).toHaveLength(0);
  });

  it('agota reintentos y propaga el error', async () => {
    const { auth, calls } = fakeAuth([{ status: 429 }]);
    const client = new GoogleRestClient(auth, 'https://mybusiness.googleapis.com/v4', {
      maxRetries: 2,
      baseDelayMs: 1,
      sleep: async () => undefined,
    });
    await expect(client.request({ method: 'GET', url: '/x' })).rejects.toThrow('HTTP 429');
    expect(calls).toHaveLength(3); // 1 intento + 2 reintentos
  });
});
