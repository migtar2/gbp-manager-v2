import { validateReply, isReplyApproved } from './quality';
import type { ReplyQualityContext } from './quality';

const baseCtx: ReplyQualityContext = {
  reviewerName: 'María López',
  signature: '— Equipo La Boquería',
  useEmojis: false,
  treatment: 'tu',
};

function passText(name = 'María'): string {
  return `¡${name}, muchas gracias por tu reseña! Nos alegra que todo estuviera genial. ¡Te esperamos pronto!\n\n— Equipo La Boquería`;
}

describe('validateReply', () => {
  it('aprueba una respuesta correcta', () => {
    const checks = validateReply(passText(), baseCtx);
    expect(isReplyApproved(checks)).toBe(true);
  });

  it('rechaza respuesta vacía y demasiado corta', () => {
    const checks = validateReply('   ', baseCtx);
    const byName = Object.fromEntries(checks.map((c) => [c.name, c.passed]));
    expect(byName.no_vacia).toBe(false);
    expect(byName.longitud_minima).toBe(false);
    expect(isReplyApproved(checks)).toBe(false);
  });

  it('rechaza emojis cuando useEmojis=false', () => {
    const checks = validateReply(passText() + ' 😊', baseCtx);
    const emojiCheck = checks.find((c) => c.name === 'emojis_segun_config');
    expect(emojiCheck?.passed).toBe(false);
    expect(isReplyApproved(checks)).toBe(false);
  });

  it('permite emojis cuando useEmojis=true', () => {
    const checks = validateReply(passText() + ' 😊', { ...baseCtx, useEmojis: true });
    expect(isReplyApproved(checks)).toBe(true);
  });

  it('rechaza datos personales en la respuesta', () => {
    const checks = validateReply(passText() + ' Llámame al 612 345 678', baseCtx);
    const pii = checks.find((c) => c.name === 'sin_datos_personales');
    expect(pii?.passed).toBe(false);
  });

  it('rechaza promesas de compensación no autorizadas', () => {
    const checks = validateReply(passText() + ' Te indemnizaremos por el disgusto', baseCtx);
    const promise = checks.find((c) => c.name === 'sin_promesas_no_autorizadas');
    expect(promise?.passed).toBe(false);
  });

  it('rechaza lenguaje informal con tratamiento de usted', () => {
    const text = 'Estimada María, le agradecemos su valoración. Escríbenos cuando quieras.\n\n— Equipo La Boquería';
    const checks = validateReply(text, { ...baseCtx, treatment: 'usted' });
    const treatment = checks.find((c) => c.name === 'tratamiento_coherente');
    expect(treatment?.passed).toBe(false);
  });

  it('exige la firma configurada', () => {
    const checks = validateReply('¡María, muchas gracias por tu reseña! Nos alegra que todo estuviera genial. ¡Te esperamos pronto!', baseCtx);
    const sig = checks.find((c) => c.name === 'firma_presente');
    expect(sig?.passed).toBe(false);
  });

  it('exige mencionar al revisor si tiene nombre', () => {
    const text = '¡Muchas gracias por tu reseña! Nos alegra que todo estuviera genial. ¡Te esperamos pronto!\n\n— Equipo La Boquería';
    const checks = validateReply(text, baseCtx);
    const named = checks.find((c) => c.name === 'dirigida_al_revisor');
    expect(named?.passed).toBe(false);
  });

  it('rechaza gritos (mayúsculas sostenidas)', () => {
    const checks = validateReply(passText() + ' ESTO ES INACEPTABLE DE VERDAD', baseCtx);
    const shout = checks.find((c) => c.name === 'sin_gritos');
    expect(shout?.passed).toBe(false);
  });
});
