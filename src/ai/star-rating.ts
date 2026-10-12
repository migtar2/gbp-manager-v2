/**
 * Normalización de starRating.
 *
 * La API de Google devuelve enumeraciones textuales ('ONE'...'FIVE');
 * el motor de generación trabaja con números 1-5. Este módulo es la
 * única frontera de conversión (P1-004 del Reality Audit).
 */

export type StarRatingInput = string | number;

const NAMED_RATINGS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

/**
 * Convierte un starRating de la API ('ONE'..'FIVE' o numérico) a número 1-5.
 * Lanza RangeError ante cualquier valor no reconocido: nunca devuelve un
 * silenciosamente incorrecto.
 */
export function normalizeStarRating(value: StarRatingInput): number {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 1 && value <= 5) return value;
    throw new RangeError(`starRating numérico fuera de rango: ${value}`);
  }

  const key = value.trim().toUpperCase();
  if (key in NAMED_RATINGS) return NAMED_RATINGS[key];

  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 5) return numeric;

  throw new RangeError(`starRating no reconocido: ${JSON.stringify(value)}`);
}

/** Convierte número 1-5 a la enumeración de la API. */
export function toStarRatingEnum(value: number): 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE' {
  const names = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'] as const;
  const normalized = normalizeStarRating(value);
  return names[normalized - 1];
}
