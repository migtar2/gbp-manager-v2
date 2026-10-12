/**
 * Nivel 4 — Gestión del riesgo (Fase P04).
 *
 * Clasifica el contenido de una reseña para decidir si puede seguir el flujo
 * automático o debe escalarse a revisión humana. Un filtro de palabras
 * aisladas NUNCA es la única protección: aquí se combina detección por
 * categorías + patrones de datos personales, y el veredicto final siempre
 * es "borrador + revisión humana", jamás publicación automática.
 */

export type RiskLevel = 'none' | 'review' | 'high';

export type RiskCategory =
  | 'legal'
  | 'threat'
  | 'health'
  | 'discrimination'
  | 'harassment'
  | 'minors'
  | 'privacy'
  | 'violence'
  | 'compensation';

export interface RiskAssessment {
  level: RiskLevel;
  categories: RiskCategory[];
  requiresHumanReview: boolean;
  /** Fragmentos que activaron la detección (para el revisor humano). */
  evidence: string[];
}

const CATEGORY_KEYWORDS: Record<Exclude<RiskCategory, 'privacy'>, string[]> = {
  legal: [
    'abogado', 'demanda', 'denuncia', 'reclamación', 'reclamacion', 'juicio',
    'tribunal', 'notificación judicial', 'notificacion judicial', 'papeles legales',
    'demanda judicial', 'querella', 'acta de conciliación', 'consumo',
  ],
  threat: [
    'amenaza', 'amenazaré', 'os voy a buscar', 'os buscare', 'chantaje',
    'extorsión', 'extorsion', 'suplantación', 'suplantacion', 'venganza',
  ],
  health: [
    'intoxicación', 'intoxicacion', 'intoxica', 'envenen', 'alergia grave',
    'hospital', 'urgencias', 'enfermo por', 'muerte', 'falleci', 'toxiinfección',
    'toxiinfeccion', 'salubridad', 'inspección sanitaria', 'inspeccion sanitaria',
  ],
  discrimination: [
    'discriminación', 'discriminacion', 'racismo', 'racista', 'xenofobia',
    'machismo', 'sexismo', 'homofobia', 'capacitismo',
  ],
  harassment: ['acoso', 'hostigamiento', 'humillación', 'humillacion', 'insulto grave'],
  minors: ['menor', 'menores', 'niño pequeño', 'bebé', 'bebe'],
  violence: ['violencia', 'agredir', 'agresión', 'agresion', 'golpe', 'policía', 'policia', 'guardia civil'],
  compensation: [
    'indemnización', 'indemnizacion', 'indemnizar', 'devolución del dinero',
    'devolucion del dinero', 'reembolso', 'compensación económica', 'compensacion economica',
  ],
};

const HIGH_LEVEL_CATEGORIES: RiskCategory[] = ['legal', 'threat', 'violence', 'health'];

/** Patrones de datos personales: su presencia exige revisión (privacidad). */
const PII_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: 'telefono', re: /(?:\+34|0034)?[\s-]?(?:[6-9]\d{2}|[89]\d{1})[\s-]?\d{3}[\s-]?\d{3}/ },
  { name: 'dni', re: /\b\d{8}[-\s]?[A-Za-z]\b/ },
  { name: 'iban', re: /\bES\d{2}[\s-]?(?:\d{4}[\s-]?){5}\b/ },
  { name: 'tarjeta', re: /\b(?:\d{4}[\s-]?){4}\b/ },
];

function findMatches(lower: string, keywords: string[]): string[] {
  return keywords.filter((kw) => lower.includes(kw));
}

/**
 * Evalúa el riesgo de un texto (normalmente el comentario de la reseña).
 * Nunca debe usarse como única barrera: el resultado `requiresHumanReview`
 * obliga a mantener el borrador sin publicar.
 */
export function assessRisk(text: string): RiskAssessment {
  const lower = text.toLowerCase();
  const categories: RiskCategory[] = [];
  const evidence: string[] = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [Exclude<RiskCategory, 'privacy'>, string[]]
  >) {
    const matches = findMatches(lower, keywords);
    if (matches.length > 0) {
      categories.push(category);
      evidence.push(...matches.slice(0, 3));
    }
  }

  for (const { name, re } of PII_PATTERNS) {
    if (re.test(text)) {
      categories.push('privacy');
      evidence.push(`patrón de datos personales (${name})`);
    }
  }

  const unique = Array.from(new Set(categories));
  const requiresHumanReview = unique.length > 0;
  const level: RiskLevel = !requiresHumanReview
    ? 'none'
    : unique.some((c) => HIGH_LEVEL_CATEGORIES.includes(c))
      ? 'high'
      : 'review';

  return { level, categories: unique, requiresHumanReview, evidence };
}

/** Compatibilidad con la API anterior. `true` = requiere revisión humana. */
export function hasRisk(text: string): boolean {
  return assessRisk(text).requiresHumanReview;
}
