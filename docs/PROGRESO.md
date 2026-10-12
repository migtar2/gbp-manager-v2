# Registro de progreso — GBP Manager V2 (Fases P00–P10)

Última actualización: 2026-10-12 · Rama: `feat/v2-hardening`

| Fase | Descripción | Estado | Responsable | Resultado |
|---|---|---|---|---|
| P00 | Reality Audit | DONE | Orchestrator | Ver `docs/audits/P00_REALITY_AUDIT.md`. 2 P0 confirmados, 6 P1, 4 P2. |
| P01 | Google Business Profile API | DONE | Subagente investigación | `docs/audits/P01_API_GOOGLE.md`. Correcciones aplicadas: policyViolation enum, tolerancia STAR_RATING_UNSPECIFIED, backoff 429/5xx. Q&A eliminada por Google (2025-11-03). |
| P02 | OAuth y seguridad | DONE | Orchestrator | state anti-CSRF, token 0600, revoke(). Tests `src/auth/google-oauth.test.ts` (5). |
| P03 | Endurecimiento MCP | DONE | Orchestrator | `mcp-server.ts` reescrito: READ ONLY + WRITE gateado (`GBP_ENABLE_WRITE_TOOLS`), validación de nombres, idempotencia, saneo de datos externos. |
| P04 | Motor de respuestas | DONE | Orchestrator | Motor híbrido L1-L4 (rules/LLM/quality/risk). Corregidos P1-004 y bug bestReply vacío. |
| P05 | Persistencia y sincronización | DONE | Orchestrator | Diseño `docs/P05_PERSISTENCIA.md` (reutiliza Supabase de la app original, sync idempotente, Pub/Sub opcional). |
| P06 | Integración con la app web | DONE | Orchestrator | Matriz y plan de migración `docs/P06_INTEGRACION_WEB.md`. |
| P07 | Quality engineering | DONE | Orchestrator | 96 tests en verde (AI, guards, auth, contratos API, rate limiting, aislamiento, idempotencia). tsc/build/lint PASS. |
| P08 | Revisión independiente | DONE | Subagente reviewer | Dictamen: **APPROVED WITH FINDINGS** (2 P1, 9 P2). Todos corregidos: script `typecheck` (P1-01), idempotencia pending/commit (P1-02), path traversal (P2-01), `{reviewReply:{}}` (P2-02), docstring saneo (P2-03), write-ops conectado a mcp-server (P2-04), reintentos solo métodos idempotentes ante 5xx (P2-05), rating anómalo tolerado (P2-06), README al día (P2-07), motor híbrido expuesto como `gbp_draft_reply` (P2-08), aviso Jest verificado con `--detectOpenHandles` sin handles (P2-09). |
| P09 | Documentación y GitHub | DONE | Orchestrator | README real, CI (typecheck/build/tests/lint/gitleaks), PR #1 abierto. |
| P10 | Ecosistema Google MCP | DONE | Subagente investigación | `docs/audits/P10_ECOSISTEMA_MCP.md`. No existe MCP oficial de GBP → arquitectura propia validada. |

## Decisiones registradas

- **D1**: Rama `feat/v2-hardening` desde `main` (0de562a). Commits pequeños, sin force push.
- **D2**: No se ejecuta ninguna escritura real contra Google. Todo se valida con mocks/tests.
- **D3**: `googleapis@144` no incluye el cliente legacy `mybusiness` → la capa API se reescribirá contra el endpoint que la investigación P01 confirme (REST directo firmado con OAuth2Client, sin discovery client).
- **D4**: Herramientas MCP de escritura desactivadas por defecto (`GBP_ENABLE_WRITE_TOOLS`).
- **D5**: Sin dependencia de Pipedream (proxy 403 en plan gratuito, verificado en proyecto anterior).

## Bloqueos

- P01/P10: a la espera de resultados de investigación (subagentes en background).
- Escrituras reales en GBP: prohibidas por el prompt maestro → validación solo con mocks.
