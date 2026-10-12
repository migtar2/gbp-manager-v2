# Registro de progreso — GBP Manager V2 (Fases P00–P10)

Última actualización: 2026-10-12 · Rama: `feat/v2-hardening`

| Fase | Descripción | Estado | Responsable | Resultado |
|---|---|---|---|---|
| P00 | Reality Audit | DONE | Orchestrator | Ver `docs/audits/P00_REALITY_AUDIT.md`. 2 P0 confirmados, 6 P1, 4 P2. |
| P01 | Google Business Profile API | IN PROGRESS | Subagente investigación | Verificando estado real de APIs (legacy v4 vs Business Profile APIs). |
| P02 | OAuth y seguridad | DONE | Orchestrator | state anti-CSRF, token 0600, revoke(). Tests `src/auth/google-oauth.test.ts` (5). |
| P03 | Endurecimiento MCP | IN PROGRESS | Orchestrator | Guards (nombres, confusión cuentas, write fail-closed, idempotencia) DONE + tests. Reescritura de `mcp-server.ts` pendiente de P01. |
| P04 | Motor de respuestas | DONE | Orchestrator | Motor híbrido L1-L4 (rules/LLM/quality/risk). 36 tests. Corregidos P1-004 y bug bestReply vacío. |
| P05 | Persistencia y sincronización | TODO | Orchestrator | — |
| P06 | Integración con la app web | TODO | Orchestrator | — |
| P07 | Quality engineering | IN PROGRESS | Orchestrator | 53 tests activos (36 AI + 12 guards + 5 auth). Faltan tests de capa API (P01). |
| P08 | Revisión independiente | TODO | Subagente reviewer | — |
| P09 | Documentación y GitHub | TODO | Orchestrator | — |
| P10 | Ecosistema Google MCP | IN PROGRESS | Subagente investigación | — |

## Decisiones registradas

- **D1**: Rama `feat/v2-hardening` desde `main` (0de562a). Commits pequeños, sin force push.
- **D2**: No se ejecuta ninguna escritura real contra Google. Todo se valida con mocks/tests.
- **D3**: `googleapis@144` no incluye el cliente legacy `mybusiness` → la capa API se reescribirá contra el endpoint que la investigación P01 confirme (REST directo firmado con OAuth2Client, sin discovery client).
- **D4**: Herramientas MCP de escritura desactivadas por defecto (`GBP_ENABLE_WRITE_TOOLS`).
- **D5**: Sin dependencia de Pipedream (proxy 403 en plan gratuito, verificado en proyecto anterior).

## Bloqueos

- P01/P10: a la espera de resultados de investigación (subagentes en background).
- Escrituras reales en GBP: prohibidas por el prompt maestro → validación solo con mocks.
