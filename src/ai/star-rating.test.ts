import { normalizeStarRating, toStarRatingEnum } from './star-rating';

describe('normalizeStarRating', () => {
  it('convierte enumeraciones textuales de la API', () => {
    expect(normalizeStarRating('ONE')).toBe(1);
    expect(normalizeStarRating('TWO')).toBe(2);
    expect(normalizeStarRating('THREE')).toBe(3);
    expect(normalizeStarRating('FOUR')).toBe(4);
    expect(normalizeStarRating('FIVE')).toBe(5);
    expect(normalizeStarRating('five')).toBe(5);
    expect(normalizeStarRating(' TWO ')).toBe(2);
  });

  it('acepta números y strings numéricos válidos', () => {
    expect(normalizeStarRating(3)).toBe(3);
    expect(normalizeStarRating('4')).toBe(4);
  });

  it('rechaza valores inválidos en lugar de devolver fallback silencioso', () => {
    expect(() => normalizeStarRating('SIX')).toThrow(RangeError);
    expect(() => normalizeStarRating(0)).toThrow(RangeError);
    expect(() => normalizeStarRating(6)).toThrow(RangeError);
    expect(() => normalizeStarRating(3.5)).toThrow(RangeError);
    expect(() => normalizeStarRating('')).toThrow(RangeError);
    expect(() => normalizeStarRating('MUY_BUENA')).toThrow(RangeError);
  });
});

describe('toStarRatingEnum', () => {
  it('round-trip con normalizeStarRating', () => {
    expect(toStarRatingEnum(5)).toBe('FIVE');
    expect(normalizeStarRating(toStarRatingEnum(2))).toBe(2);
  });
});
