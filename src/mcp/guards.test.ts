import {
  validateReviewName,
  validatePostName,
  isWriteEnabled,
  IdempotencyGuard,
  sanitizeExternalText,
} from './guards';

describe('validateReviewName', () => {
  const valid = 'accounts/123/locations/456/reviews/789';

  it('acepta nombres bien formados', () => {
    expect(validateReviewName(valid).ok).toBe(true);
    expect(validateReviewName(valid, { accountId: '123', locationId: '456' }).ok).toBe(true);
  });

  it('rechaza nombres mal formados', () => {
    expect(validateReviewName('').ok).toBe(false);
    expect(validateReviewName('accounts/123/locations/456').ok).toBe(false);
    expect(validateReviewName('foo/bar').ok).toBe(false);
    expect(validateReviewName('accounts/123/locations/456/reviews/789/extra/x').ok).toBe(false);
    expect(validateReviewName('accounts/abc/locations/456/reviews/789').ok).toBe(false);
  });

  it('rechaza path traversal ("." y ".." como segmentos) — P2-01', () => {
    expect(validateReviewName('accounts/1/locations/../reviews/r1').ok).toBe(false);
    expect(validateReviewName('accounts/1/locations/./reviews/r1').ok).toBe(false);
    expect(validateReviewName('accounts/../locations/1/reviews/r1').ok).toBe(false);
    expect(validateReviewName('accounts/1/locations/a..b/reviews/r1').ok).toBe(false);
    expect(
      validateReviewName('accounts/1/locations/../reviews/r1', {
        accountId: '1',
        locationId: '..',
      }).ok
    ).toBe(false);
  });

  it('detecta confusión de cuentas (operación sobre el establecimiento equivocado)', () => {
    const result = validateReviewName(valid, { accountId: '999' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('confusión de cuentas');
  });

  it('detecta confusión de ubicaciones', () => {
    const result = validateReviewName(valid, { locationId: '999' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('confusión de ubicaciones');
  });
});

describe('validatePostName', () => {
  const valid = 'accounts/123/locations/456/localPosts/abc-def';

  it('acepta nombres bien formados con coincidencia', () => {
    expect(validatePostName(valid, { accountId: '123', locationId: '456' }).ok).toBe(true);
  });

  it('rechaza resources equivocados', () => {
    expect(validatePostName('accounts/123/locations/456/reviews/abc').ok).toBe(false);
    expect(validatePostName(valid, { accountId: '123', locationId: '777' }).ok).toBe(false);
  });
});

describe('isWriteEnabled (fail closed)', () => {
  it('desactivado por defecto', () => {
    expect(isWriteEnabled({})).toBe(false);
    expect(isWriteEnabled({ GBP_ENABLE_WRITE_TOOLS: 'false' })).toBe(false);
    expect(isWriteEnabled({ GBP_ENABLE_WRITE_TOOLS: '1' })).toBe(false);
    expect(isWriteEnabled({ GBP_ENABLE_WRITE_TOOLS: 'TRUE' })).toBe(false);
  });

  it('solo se activa con exactamente "true"', () => {
    expect(isWriteEnabled({ GBP_ENABLE_WRITE_TOOLS: 'true' })).toBe(true);
  });
});

describe('IdempotencyGuard', () => {
  it('permite la primera ejecución y bloquea la repetida dentro del TTL', () => {
    let now = 1000;
    const guard = new IdempotencyGuard(60_000, 100, () => now);
    const key = IdempotencyGuard.keyFor('create_post', { text: 'hola', location: 'a' });

    expect(guard.checkAndRemember(key)).toBe(true);
    expect(guard.checkAndRemember(key)).toBe(false);

    now += 61_000;
    expect(guard.checkAndRemember(key)).toBe(true); // expirado
  });

  it('claves distintas no se bloquean entre sí', () => {
    const guard = new IdempotencyGuard();
    const k1 = IdempotencyGuard.keyFor('create_post', { text: 'a' });
    const k2 = IdempotencyGuard.keyFor('create_post', { text: 'b' });
    expect(guard.checkAndRemember(k1)).toBe(true);
    expect(guard.checkAndRemember(k2)).toBe(true);
  });

  it('misma clave para payloads equivalentes', () => {
    const a = IdempotencyGuard.keyFor('x', { text: 'hola', n: 1 });
    const b = IdempotencyGuard.keyFor('x', { text: 'hola', n: 1 });
    expect(a).toBe(b);
  });
});

describe('sanitizeExternalText', () => {
  it('trunca y normaliza contenido externo', () => {
    expect(sanitizeExternalText('hola\r\nmundo')).toBe('hola\nmundo');
    expect(sanitizeExternalText('x'.repeat(50), 10)).toHaveLength(10);
  });
});
