import { generateReply, ReplyContext } from './reply-engine';

const baseCtx: ReplyContext = {
  reviewerName: 'María López',
  starRating: 5,
  comment: null,
  language: 'es',
  tone: 'cercano',
  treatment: 'tu',
  useEmojis: true,
  signature: '— Equipo La Boquería',
  businessName: 'La Boquería',
};

describe('generateReply', () => {
  it('genera respuesta con nombre y firma', async () => {
    const result = await generateReply(baseCtx);
    expect(result.text).toContain('María');
    expect(result.text).toContain('— Equipo La Boquería');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.attempts).toBeGreaterThanOrEqual(1);
  });

  it('reseña de 1 estrella usa tono de disculpa y ofrecimiento de contacto', async () => {
    const result = await generateReply({ ...baseCtx, starRating: 1 });
    expect(result.text.toLowerCase()).toContain('solucionarlo');
    expect(result.text.toLowerCase()).not.toContain('nos hace muy felices');
  });

  it('acepta starRating enum de la API (normalización defensiva)', async () => {
    const result = await generateReply({ ...baseCtx, starRating: 'FIVE' as unknown as number });
    expect(result.text).toContain('María');
  });

  it('quita emojis cuando useEmojis=false', async () => {
    const result = await generateReply({ ...baseCtx, useEmojis: false });
    expect(result.text).not.toMatch(/[\uD83C-\uDBFF][\uDC00-\uDFFF]/);
  });

  it('anti-repetición: agota intentos cuando la respuesta coincide con recientes', async () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const first = await generateReply(baseCtx);
      const result = await generateReply(baseCtx, [first.text]);
      expect(result.text).toBe(first.text);
      expect(result.attempts).toBe(5);
      expect(result.similarityScore).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('tratamiento de usted produce lenguaje formal', async () => {
    const result = await generateReply({ ...baseCtx, treatment: 'usted', tone: 'profesional' });
    expect(result.text).toContain('Estimado/a María');
    expect(result.text).toContain('— Equipo La Boquería');
  });
});
