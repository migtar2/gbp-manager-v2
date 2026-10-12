/**
 * AI Reply Engine for Google Business Profile Reviews
 * 
 * Generates contextual, non-repetitive review replies.
 * Supports multiple tones, anti-repetition, and risk detection.
 */

export interface ReplyContext {
  reviewerName: string;
  starRating: number;
  comment: string | null;
  language: string;
  tone: 'cercano' | 'profesional' | 'formal' | 'amable' | 'divertido' | 'premium';
  treatment: 'tu' | 'usted';
  useEmojis: boolean;
  signature: string;
  businessName: string;
  businessType?: string;
}

export interface GeneratedReply {
  text: string;
  confidence: number;
  attempts: number;
  similarityScore: number;
}

// ============ Pattern Banks ============

interface PatternBank {
  openings: string[];
  middles: string[];
  closings: string[];
}

const PATTERNS: Record<string, Record<string, PatternBank>> = {
  tu: {
    cercano: {
      openings: [
        '¡{name}! {gratitude}',
        '{gratitude}, {name}',
        '¡{name}, {emotion}!',
        '{name}, {gratitude}',
        '¡{emotion}, {name}!',
      ],
      middles: [
        'Saber que {positive_detail} nos hace muy felices.',
        'Nos encanta que hayas disfrutado{detail_ref}.',
        'Tu comentario{detail_ref} nos motiva a seguir.',
        'Qué bueno que {positive_detail}.',
        'Nos alegra muchísimo que la experiencia{detail_ref} fuera genial.',
        'Leer esto{detail_ref} nos pone muy contentos.',
      ],
      closings: [
        '¡Te esperamos pronto!',
        '¡Vuelve cuando quieras!',
        '¡Aquí estaremos cuando vuelvas!',
        '¡Esperamos verte de nuevo!',
        '¡Cuenta con nosotros!',
      ],
    },
    profesional: {
      openings: [
        '{gratitude}, {name}.',
        '{name}, {gratitude_lower}.',
      ],
      middles: [
        'Nos complace saber que su experiencia{detail_ref} fue positiva.',
        'Su valoración nos impulsa a mantener nuestro nivel de servicio.',
        'Agradecemos especialmente{detail_ref} sus palabras.',
        'Es un placer saber que{positive_detail}.',
      ],
      closings: [
        'Esperamos recibirle de nuevo.',
        'Quedamos a su disposición.',
        'Será un placer atenderle de nuevo.',
      ],
    },
    formal: {
      openings: [
        'Estimado/a {name},',
        'Muy apreciado/a {name},',
      ],
      middles: [
        'Le agradecemos profundamente su valoración{detail_ref}.',
        'Nos honra saber que nuestro servicio{detail_ref} ha sido de su agrado.',
        'Sus palabras{detail_ref} son un estímulo para todo nuestro equipo.',
      ],
      closings: [
        'Quedamos a su entera disposición.',
        'Será un placer volver a atenderle.',
      ],
    },
    amable: {
      openings: [
        '¡{name}, {emotion}!',
        '{gratitude}, {name}. ¡{emotion}!',
      ],
      middles: [
        'Saber que {positive_detail} nos llena de alegría.',
        'Tu comentario{detail_ref} nos llega al corazón.',
        'Nos hace muy felices saber que{positive_detail}.',
      ],
      closings: [
        '¡Te esperamos con los brazos abiertos!',
        '¡Aquí siempre serás bienvenido/a!',
        '¡Esperamos verte muy pronto!',
      ],
    },
    divertido: {
      openings: [
        '¡{name}, {emotion}!',
        '¡{gratitude}, {name}!',
      ],
      middles: [
        'Leer esto{detail_ref} nos ha alegrado el día.',
        'Nos has puesto colorados con tus palabras{detail_ref}.',
        '¡{positive_detail}! Así da gusto.',
      ],
      closings: [
        '¡Vuelve pronto que te echamos de menos!',
        '¡La próxima ronda va por ti!',
        '¡Nos vemos pronto!',
      ],
    },
    premium: {
      openings: [
        '{name}, {gratitude_lower}.',
        'Estimado/a {name},',
      ],
      middles: [
        'Saber que nuestra atención{detail_ref} ha estado a la altura de sus expectativas nos llena de satisfacción.',
        'Su valoración{detail_ref} refleja el esfuerzo que ponemos en cada detalle.',
        'Es un honor recibir palabras como las suyas{detail_ref}.',
      ],
      closings: [
        'Será un placer volver a recibirle.',
        'Quedamos a su disposición para futuras ocasiones.',
      ],
    },
  },
  usted: {
    cercano: {
      openings: ['¡{name}! {gratitude}'],
      middles: ['Saber que {positive_detail} nos hace muy felices.'],
      closings: ['¡Le esperamos pronto!'],
    },
    profesional: {
      openings: ['Estimado/a {name}, {gratitude_lower}.'],
      middles: ['Nos complace saber que su experiencia{detail_ref} fue positiva.'],
      closings: ['Esperamos recibirle de nuevo.'],
    },
    formal: {
      openings: ['Estimado/a {name},'],
      middles: ['Le agradecemos profundamente su valoración{detail_ref}.'],
      closings: ['Quedamos a su entera disposición.'],
    },
    amable: {
      openings: ['¡{name}, {emotion}!'],
      middles: ['Saber que {positive_detail} nos llena de alegría.'],
      closings: ['¡Le esperamos con los brazos abiertos!'],
    },
    divertido: {
      openings: ['¡{name}, {emotion}!'],
      middles: ['Leer esto{detail_ref} nos ha alegrado el día.'],
      closings: ['¡Vuelva pronto que le echamos de menos!'],
    },
    premium: {
      openings: ['Estimado/a {name},'],
      middles: ['Saber que nuestra atención{detail_ref} ha estado a la altura de sus expectativas nos llena de satisfacción.'],
      closings: ['Será un placer volver a recibirle.'],
    },
  },
};

const GRATITUDES = [
  'Muchas gracias', 'Mil gracias', 'Gracias por tu reseña',
  'Gracias por tus palabras', 'Agradecemos tu valoración',
  'Gracias por compartir tu experiencia', 'Gracias por confiar en nosotros',
];

const GRATITUDES_FORMAL = [
  'Le agradecemos su valoración', 'Muchas gracias por su reseña',
  'Agradecemos sinceramente sus palabras',
];

const EMOTIONS: Record<number, string[]> = {
  5: ['qué alegría leer esto', 'nos has hecho el día', 'esto nos pone muy contentos', 'qué ilusión', 'nos encanta'],
  4: ['gracias por tu valoración', 'qué bueno leer esto', 'nos alegra mucho'],
  3: ['gracias por tu honestidad', 'valoramos tu opinión'],
  2: ['lo sentimos mucho', 'lamentamos tu experiencia'],
  1: ['lamentamos profundamente', 'nos duele leer esto'],
};

// ============ Helper Functions ============

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function extractDetails(comment: string | null): { hasDetail: boolean; detailRef: string; positiveDetail: string } {
  if (!comment || comment.trim().length < 5) {
    return { hasDetail: false, detailRef: '', positiveDetail: 'todo estuvo genial' };
  }

  const lower = comment.toLowerCase();
  const details: string[] = [];

  const categories: Record<string, string[]> = {
    food: ['comida', 'cerveza', 'hamburguesa', 'café', 'vino', 'pizza', 'tapa', 'menú', 'desayuno', 'cena', 'bebida', 'cóctel', 'postre'],
    service: ['trato', 'atención', 'servicio', 'personal', 'camarero', 'camarera', 'empleado'],
    ambiance: ['ambiente', 'música', 'decoración', 'terraza', 'local', 'lugar', 'sitio'],
  };

  for (const words of Object.values(categories)) {
    for (const word of words) {
      if (lower.includes(word)) details.push(word);
    }
  }

  if (details.length > 0) {
    return {
      hasDetail: true,
      detailRef: ` sobre ${details[0]}`,
      positiveDetail: `el ${details[0]} estuvo genial`,
    };
  }

  return {
    hasDetail: comment.length > 20,
    detailRef: comment.length > 20 ? ' en tu comentario' : '',
    positiveDetail: 'todo estuvo genial',
  };
}

// ============ Similarity Check ============

function getBigrams(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^\wáéíóúñ\s]/g, '').split(/\s+/);
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  a.forEach(item => {
    if (b.has(item)) intersection++;
  });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ============ Main Generator ============

export async function generateReply(
  ctx: ReplyContext,
  recentReplies: string[] = []
): Promise<GeneratedReply> {
  const { reviewerName, starRating, comment, tone, treatment, useEmojis, signature } = ctx;
  const firstName = reviewerName.split(' ')[0];
  const details = extractDetails(comment);
  const patterns = PATTERNS[treatment]?.[tone] || PATTERNS.tu.profesional;
  const recentBigrams = recentReplies.map(r => getBigrams(r));

  const MAX_ATTEMPTS = 5;
  const SIMILARITY_THRESHOLD = 0.45;

  let bestReply = '';
  let bestSimilarity = 1;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const gratitude = treatment === 'usted' || tone === 'formal' || tone === 'premium'
      ? pick(GRATITUDES_FORMAL) : pick(GRATITUDES);

    const opening = pick(patterns.openings)
      .replace('{name}', firstName)
      .replace('{gratitude}', gratitude)
      .replace('{gratitude_lower}', gratitude.toLowerCase())
      .replace('{emotion}', pick(EMOTIONS[starRating] || EMOTIONS[3]));

    let middle = '';
    if (starRating >= 3) {
      middle = pick(patterns.middles)
        .replace('{positive_detail}', details.positiveDetail)
        .replace('{detail_ref}', details.detailRef);
    } else {
      middle = treatment === 'usted'
        ? 'Le invitamos a contactarnos para poder atender su caso personalmente.'
        : 'Nos encantaría poder hablar contigo para solucionarlo. Escríbenos cuando puedas.';
    }

    const closing = starRating >= 3
      ? pick(patterns.closings)
      : treatment === 'usted' ? 'Quedamos a su disposición.' : 'Estamos aquí para lo que necesites.';

    let reply = `${opening} ${middle} ${closing}`;
    if (signature) reply += `\n\n${signature}`;

    if (!useEmojis) {
      reply = reply.replace(/[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g, '').trim();
    }

    reply = reply.replace(/\s+/g, ' ').trim();

    const replyBigrams = getBigrams(reply);
    let maxSimilarity = 0;
    for (const recentBigram of recentBigrams) {
      const sim = jaccardSimilarity(replyBigrams, recentBigram);
      if (sim > maxSimilarity) maxSimilarity = sim;
    }

    if (maxSimilarity < bestSimilarity) {
      bestSimilarity = maxSimilarity;
      bestReply = reply;
    }

    if (maxSimilarity < SIMILARITY_THRESHOLD) {
      return {
        text: reply,
        confidence: 95 - (attempt * 5),
        attempts: attempt + 1,
        similarityScore: maxSimilarity,
      };
    }
  }

  return {
    text: bestReply,
    confidence: Math.max(50, 80 - (MAX_ATTEMPTS * 5)),
    attempts: MAX_ATTEMPTS,
    similarityScore: bestSimilarity,
  };
}

// ============ Risk Detection ============

const RISK_KEYWORDS = [
  'amenaza', 'abogado', 'demanda', 'denuncia', 'indemnización', 'muerte',
  'intoxicación', 'discriminación', 'acoso', 'menores', 'sexual',
  'datos personales', 'protección de datos', 'reclamación', 'indemnizar',
  'chantaje', 'suplantación', 'delito', 'policía', 'guardia civil',
];

export function hasRisk(text: string): boolean {
  const lower = text.toLowerCase();
  return RISK_KEYWORDS.some(kw => lower.includes(kw));
}
