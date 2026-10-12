/**
 * Nivel 3 — Control de calidad de respuestas (Fase P04).
 *
 * Validaciones deterministas que una respuesta (de reglas o de LLM) debe
 * superar antes de considerarse borrador apto. Todas son puras y testeables.
 */

export interface ReplyQualityContext {
  reviewerName: string;
  signature: string;
  useEmojis: boolean;
  treatment: 'tu' | 'usted';
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

const MAX_REPLY_LENGTH = 4000; // límite conservador de GBP para replies

const UNAUTHORIZED_PROMISES = [
  /indemniz(?:aremos|ación|acion)/i,
  /(?:te|le) (?:devolveremos|reembolsaremos) (?:el )?dinero/i,
  /reembolso garantizado/i,
  /compensaci[oó]n (?:econ[oó]mica )?garantizada/i,
  /gratis para siempre/i,
  /nos hacemos cargo de (?:todos|cualquier) (?:los )?gastos/i,
];

const PII_IN_REPLY = [
  { name: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: 'telefono', re: /(?:\+34|0034)?[\s-]?(?:[6-9]\d{2}|[89]\d{1})[\s-]?\d{3}[\s-]?\d{3}/ },
  { name: 'dni', re: /\b\d{8}[-\s]?[A-Za-z]\b/ },
];

const INFORMAL_FOR_USTED = /\b(?:tú|tuy[oa]s?|contigo|escríbenos|escríbeme|vuelve cuando|cuéntanos|cuentanos)\b/i;

const EMOJI_RE = /[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g;

/**
 * Valida una respuesta candidata. Devuelve la lista completa de checks;
 * `isReplyApproved` decide el veredicto global.
 */
export function validateReply(reply: string, ctx: ReplyQualityContext): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const trimmed = reply.trim();

  checks.push({
    name: 'no_vacia',
    passed: trimmed.length > 0,
    detail: trimmed.length > 0 ? undefined : 'respuesta vacía',
  });

  checks.push({
    name: 'longitud_minima',
    passed: trimmed.length >= 15,
    detail: trimmed.length >= 15 ? undefined : `solo ${trimmed.length} caracteres`,
  });

  checks.push({
    name: 'longitud_maxima',
    passed: trimmed.length <= MAX_REPLY_LENGTH,
    detail: trimmed.length <= MAX_REPLY_LENGTH ? undefined : `${trimmed.length} > ${MAX_REPLY_LENGTH}`,
  });

  const emojiMatches = trimmed.match(EMOJI_RE) || [];
  checks.push({
    name: 'emojis_segun_config',
    passed: ctx.useEmojis || emojiMatches.length === 0,
    detail: ctx.useEmojis || emojiMatches.length === 0
      ? undefined
      : `emojis presentes con useEmojis=false (${emojiMatches.slice(0, 3).join(' ')})`,
  });

  const piiHits = PII_IN_REPLY.filter(({ re }) => re.test(trimmed)).map(({ name }) => name);
  checks.push({
    name: 'sin_datos_personales',
    passed: piiHits.length === 0,
    detail: piiHits.length === 0 ? undefined : `patrones PII: ${piiHits.join(', ')}`,
  });

  const promiseHits = UNAUTHORIZED_PROMISES.filter((re) => re.test(trimmed)).map((re) => String(re));
  checks.push({
    name: 'sin_promesas_no_autorizadas',
    passed: promiseHits.length === 0,
    detail: promiseHits.length === 0 ? undefined : 'compromete compensaciones/dinero',
  });

  checks.push({
    name: 'tratamiento_coherente',
    passed: ctx.treatment !== 'usted' || !INFORMAL_FOR_USTED.test(trimmed),
    detail: ctx.treatment !== 'usted' || !INFORMAL_FOR_USTED.test(trimmed)
      ? undefined
      : 'lenguaje informal con tratamiento de usted',
  });

  if (ctx.signature && ctx.signature.trim().length > 0) {
    checks.push({
      name: 'firma_presente',
      passed: trimmed.includes(ctx.signature.trim()),
      detail: trimmed.includes(ctx.signature.trim()) ? undefined : 'firma configurada ausente',
    });
  }

  const firstName = ctx.reviewerName.split(' ')[0];
  if (firstName && firstName.length >= 3) {
    checks.push({
      name: 'dirigida_al_revisor',
      passed: trimmed.toLowerCase().includes(firstName.toLowerCase()),
      detail: trimmed.toLowerCase().includes(firstName.toLowerCase())
        ? undefined
        : `no menciona a ${firstName}`,
    });
  }

  const SHOUTING = /\b[A-ZÁÉÍÓÚÑ]{6,}\b/;
  checks.push({
    name: 'sin_gritos',
    passed: !SHOUTING.test(trimmed),
    detail: SHOUTING.test(trimmed) ? 'palabras en mayúsculas sostenidas' : undefined,
  });

  return checks;
}

/** Veredicto: todos los checks deben pasar. */
export function isReplyApproved(checks: QualityCheck[]): boolean {
  return checks.every((c) => c.passed);
}
