/**
 * Motor híbrido de respuestas (Fase P04).
 *
 * Nivel 1: reglas deterministas (reply-engine.ts) — siempre disponible.
 * Nivel 2: LLM opcional (llm-adapter.ts) — solo si hay proveedor configurado.
 * Nivel 3: control de calidad (quality.ts) — la salida del LLM que no supere
 *          los checks se descarta y se usa la de reglas.
 * Nivel 4: gestión del riesgo (risk.ts) — reseñas con riesgo ⇒ NUNCA se
 *          envía a LLM ni se propone para publicación automática.
 *
 * Este módulo SOLO genera borradores. La publicación queda fuera y requiere
 * aprobación explícita (ver MCP write tools desactivadas por defecto).
 */

import { generateReply, ReplyContext, GeneratedReply } from './reply-engine';
import { normalizeStarRating } from './star-rating';
import { assessRisk, RiskAssessment } from './risk';
import { validateReply, isReplyApproved, QualityCheck } from './quality';
import { LLMProvider, loadProviderFromEnv, ReplyDraftInput } from './llm-adapter';

export type ReplyEngineKind = 'rules' | 'llm';

export interface HybridReplyResult {
  text: string;
  engine: ReplyEngineKind;
  quality: QualityCheck[];
  approved: boolean;
  risk: RiskAssessment;
  /** true ⇒ borrador solo para revisión humana; jamás publicar automáticamente. */
  requiresHumanReview: boolean;
  rulesFallback: GeneratedReply;
  llmError?: string;
}

export async function generateHybridReply(
  ctx: ReplyContext,
  recentReplies: string[] = [],
  provider: LLMProvider | null = loadProviderFromEnv()
): Promise<HybridReplyResult> {
  const starRating = normalizeStarRating(ctx.starRating);
  const normalizedCtx: ReplyContext = { ...ctx, starRating };

  const risk = assessRisk(`${ctx.comment ?? ''}`.trim());
  const rules = await generateReply(normalizedCtx, recentReplies);

  // Nivel 4: con riesgo, solo borrador de reglas y revisión humana obligatoria.
  if (risk.requiresHumanReview) {
    const quality = validateReply(rules.text, normalizedCtx);
    return {
      text: rules.text,
      engine: 'rules',
      quality,
      approved: false,
      risk,
      requiresHumanReview: true,
      rulesFallback: rules,
    };
  }

  if (!provider) {
    const quality = validateReply(rules.text, normalizedCtx);
    return {
      text: rules.text,
      engine: 'rules',
      quality,
      approved: isReplyApproved(quality),
      risk,
      requiresHumanReview: false,
      rulesFallback: rules,
    };
  }

  const draftInput: ReplyDraftInput = {
    reviewerName: ctx.reviewerName,
    starRating,
    reviewComment: ctx.comment,
    businessName: ctx.businessName,
    businessType: ctx.businessType,
    language: ctx.language,
    tone: ctx.tone,
    treatment: ctx.treatment,
  };

  let llmText: string | null = null;
  let llmError: string | undefined;

  try {
    llmText = await provider.generate(draftInput);
  } catch (error) {
    llmError = error instanceof Error ? error.message : String(error);
  }

  if (llmText) {
    const quality = validateReply(llmText, normalizedCtx);
    if (isReplyApproved(quality)) {
      return {
        text: llmText,
        engine: 'llm',
        quality,
        approved: true,
        risk,
        requiresHumanReview: false,
        rulesFallback: rules,
        llmError,
      };
    }
    llmError = 'la salida del LLM no superó el control de calidad; se usó el borrador de reglas';
  }

  const quality = validateReply(rules.text, normalizedCtx);
  return {
    text: rules.text,
    engine: 'rules',
    quality,
    approved: isReplyApproved(quality),
    risk,
    requiresHumanReview: false,
    rulesFallback: rules,
    llmError,
  };
}
