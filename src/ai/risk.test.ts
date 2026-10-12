import { assessRisk, hasRisk } from './risk';

describe('assessRisk', () => {
  it('sin riesgo en una reseña normal', () => {
    const result = assessRisk('Muy buena comida y el trato excelente, volveremos pronto');
    expect(result.level).toBe('none');
    expect(result.requiresHumanReview).toBe(false);
    expect(result.categories).toEqual([]);
  });

  it('detecta riesgo legal como high', () => {
    const result = assessRisk('Voy a poner una demanda por esto');
    expect(result.categories).toContain('legal');
    expect(result.level).toBe('high');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('detecta salud como high', () => {
    const result = assessRisk('Mi hijo acabó en urgencias con una intoxicación');
    expect(result.categories).toContain('health');
    expect(result.level).toBe('high');
  });

  it('detecta datos personales como review', () => {
    const result = assessRisk('Llamadme al 612 345 678 para hablar del tema');
    expect(result.categories).toContain('privacy');
    expect(result.level).toBe('review');
  });

  it('detecta email en el comentario', () => {
    const result = assessRisk('Escríbeme a juan.perez@example.com');
    expect(result.categories).toContain('privacy');
  });

  it('detecta compensación económica', () => {
    const result = assessRisk('Quiero una indemnización por el disgusto');
    expect(result.categories).toContain('compensation');
    expect(result.requiresHumanReview).toBe(true);
  });

  it('clasifica discriminación como review (no high)', () => {
    const result = assessRisk('Me trataron con discriminación por mi origen');
    expect(result.categories).toContain('discrimination');
    expect(result.level).toBe('review');
  });

  it('texto vacío no tiene riesgo', () => {
    expect(assessRisk('').level).toBe('none');
    expect(assessRisk('   ').level).toBe('none');
  });
});

describe('hasRisk (compatibilidad)', () => {
  it('coincide con requiresHumanReview', () => {
    expect(hasRisk('una amenaza velada')).toBe(true);
    expect(hasRisk('todo perfecto')).toBe(false);
  });
});
