import { generateReply, ReplyContext } from './reply-engine';
import { generateHybridReply, HybridReplyResult } from './hybrid-engine';
import type { LLMProvider, ReplyDraftInput } from './llm-adapter';
import type { ReplyQualityContext } from './quality';

const baseCtx: ReplyContext = {
  reviewerName: 'María López',
  starRating: 5,
  comment: 'La comida estuvo buenísima y el trato del personal excelente',
  language: 'es',
  tone: 'cercano',
  treatment: 'tu',
  useEmojis: true,
  signature: '— Equipo La Boquería',
  businessName: 'La Boquería',
  businessType: 'restaurante',
};

function fakeProvider(reply: string): LLMProvider & { calls: ReplyDraftInput[] } {
  const calls: ReplyDraftInput[] = [];
  return {
    name: 'fake',
    calls,
    async generate(input: ReplyDraftInput): Promise<string> {
      calls.push(input);
      return reply;
    },
  };
}

const GOOD_LLM_REPLY =
  '¡María, muchas gracias por tus palabras! Nos alegra que la comida y el trato estuvieran genial. ¡Te esperamos pronto!\n\n— Equipo La Boquería';

describe('generateHybridReply', () => {
  it('sin proveedor usa el motor de reglas', async () => {
    const result = await generateHybridReply(baseCtx, [], null);
    expect(result.engine).toBe('rules');
    expect(result.text.length).toBeGreaterThan(10);
    expect(result.requiresHumanReview).toBe(false);
  });

  it('acepta starRating enum de la API sin romperse (P1-004)', async () => {
    const result = await generateHybridReply(
      { ...baseCtx, starRating: 'FIVE' as unknown as number },
      [],
      null
    );
    expect(result.text.length).toBeGreaterThan(10);
  });

  it('P2-06: starRating no parseable no revienta — degrada a revisión humana', async () => {
    const result = await generateHybridReply(
      { ...baseCtx, starRating: 'STAR_RATING_UNSPECIFIED' as unknown as number },
      [],
      null
    );
    expect(result.requiresHumanReview).toBe(true);
    expect(result.approved).toBe(false);
    expect(result.engine).toBe('rules');
    expect(result.text.length).toBeGreaterThan(10);
  });

  it('con LLM válido usa la salida del LLM', async () => {
    const provider = fakeProvider(GOOD_LLM_REPLY);
    const result = await generateHybridReply(baseCtx, [], provider);
    expect(result.engine).toBe('llm');
    expect(result.text).toBe(GOOD_LLM_REPLY);
    expect(result.approved).toBe(true);
    expect(provider.calls).toHaveLength(1);
  });

  it('descarta la salida del LLM si no supera el control de calidad', async () => {
    const provider = fakeProvider('Gracias María. Te devolveremos el dinero en 24h.\n\n— Equipo La Boquería');
    const result = await generateHybridReply(baseCtx, [], provider);
    expect(result.engine).toBe('rules');
    expect(result.text).not.toContain('devolveremos');
    expect(result.llmError).toContain('control de calidad');
    expect(result.approved).toBe(true); // el fallback de reglas sí pasa
  });

  it('cae a reglas si el proveedor falla', async () => {
    const provider: LLMProvider = {
      name: 'broken',
      async generate(): Promise<string> {
        throw new Error('timeout');
      },
    };
    const result = await generateHybridReply(baseCtx, [], provider);
    expect(result.engine).toBe('rules');
    expect(result.llmError).toBe('timeout');
  });

  it('Nivel 4: reseña con riesgo ⇒ revisión humana, sin llamar al LLM y sin aprobación', async () => {
    const provider = fakeProvider(GOOD_LLM_REPLY);
    const risky = {
      ...baseCtx,
      starRating: 1,
      comment: 'Voy a poner una demanda, esto fue una intoxicación',
    };
    const result: HybridReplyResult = await generateHybridReply(risky, [], provider);

    expect(result.requiresHumanReview).toBe(true);
    expect(result.approved).toBe(false);
    expect(result.engine).toBe('rules');
    expect(result.risk.level).toBe('high');
    expect(provider.calls).toHaveLength(0);
    expect(result.text.length).toBeGreaterThan(10);
  });

  it('reseña sin comentario genera borrador válido', async () => {
    const result = await generateHybridReply({ ...baseCtx, comment: null }, [], null);
    expect(result.text.length).toBeGreaterThan(10);
    expect(typeof result.approved).toBe('boolean');
  });
});
