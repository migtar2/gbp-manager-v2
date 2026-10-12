# P00 — Reality Audit · GBP Manager V2

Fecha: 2026-10-12 · Commit auditado: `0de562a` (único commit, rama `main`) · Auditor: Chief Orchestrator (Hermes)

## 1. Estado del repositorio

| Aspecto | Estado real |
|---|---|
| Git | 1 commit (`0de562a`), working tree limpio, rama `main` |
| Estructura | 12 archivos fuente, ~1.600 LOC TypeScript |
| Dependencias | `googleapis@144.0.0`, `@modelcontextprotocol/sdk@1.x`, express, winston, zod — **instaladas** (557 paquetes) |
| TypeScript (`tsc --noEmit`) | **FAIL** — 11 errores (exit 2) |
| Tests | **0 tests**. Scripts `jest` declarados sin config ni `ts-jest` → `npm test` no puede ejecutar nada |
| Lint | Script `eslint src/` sin archivo de configuración → `npm run lint` falla |
| `token.json` / `credentials.json` / `.env` | No existen en el repo (correcto). `.gitignore` los excluye ✓ |
| Secretos en historial | Gitleaks: 1 commit escaneado, **no leaks found** ✓ |
| CI | No existe |
| MCP registrado | El servidor MCP no está registrado en Hermes (no hay configuración de MCP para este repo) |

## 2. Hallazgos confirmados (con evidencia reproducible)

### P0 — Bloqueantes

**P0-001 — El cliente `google.mybusiness` no existe: la aplicación falla en runtime al instanciar cualquier API.**
- Archivo: `src/api/reviews.ts:51`, `src/api/posts.ts:65`, `src/api/locations.ts:33`, `src/api/accounts.ts:51`, `src/index.ts:47`, `src/mcp-server.ts:61`
- Evidencia: en `googleapis@144.0.0` el índice de APIs no exporta `mybusiness` (solo `mybusinessaccountmanagement`, `mybusinessbusinessinformation`, `mybusinessqanda`, `mybusinessnotifications`, `mybusinessverifications`, `mybusinessplaceactions`, `mybusinessbusinesscalls`, `mybusinesslodging`, `businessprofileperformance`). Smoke test reproducido:
  ```
  node -e "new (require('./dist/api/reviews').ReviewsAPI)({})"
  → ReviewsAPI FALLO: googleapis_1.google.mybusiness is not a function
  ```
- Impacto: **ninguna funcionalidad del proyecto funciona** (ni CLI, ni MCP, ni reseñas, ni publicaciones). El README promete una app operativa que no lo está.
- Solución: reescribir la capa API contra los endpoints vigentes (P01 determina cuáles: REST firmado con `OAuth2Client.request` o cliente oficial nuevo), con contrato de tipos verificado.
- Prueba de aceptación: smoke test de instanciación de cada capa API + tests de contrato con mocks, sin llamadas reales.

**P0-002 — El proyecto no compila: `tsc --noEmit` devuelve 11 errores.**
- Archivo y líneas: `src/api/accounts.ts:51`, `src/api/locations.ts:33`, `src/api/posts.ts:65,163,196,230`, `src/api/reviews.ts:51`, `src/index.ts:47`, `src/mcp-server.ts:53,61,221`
- Evidencia: `npx tsc --noEmit` → exit 2 (`TS2349 not callable` ×7, `TS2339 actionType does not exist` ×3, `TS2589 type instantiation excessively deep` ×2). `npm run build` emitía `dist/` pese a los errores (tsc emite por defecto), enmascarando el fallo.
- Impacto: calidad cero garantizable; cualquier release sería una build inválida.
- Solución: corregir raíz (misma que P0-001 para los TS2349) + tipos de `callToAction` opcionales + esquemas Zod del MCP para eliminar TS2589.
- Prueba de aceptación: `npm run typecheck` → exit 0. `npm run build` sin errores.

### P1 — Importantes

**P1-001 — README documenta 7 archivos y 3 herramientas MCP que no existen.**
- Evidencia: el README lista `auth/token-manager.ts`, `api/media.ts`, `api/qa.ts`, `api/insights.ts`, `ai/anti-repetition.ts`, `utils/logger.ts`, `utils/config.ts` — ninguno existe. Las herramientas `gbp_get_insights`, `gbp_get_qa`, `gbp_answer_question` aparecen en la tabla del README y no están implementadas. Inversamente, `gbp_get_unreplied_reviews` y `gbp_delete_review_reply` están implementadas y no documentadas.
- Impacto: funcionalidades anunciadas no implementadas (violación del criterio de éxito "documentado = implementado").
- Solución: reescribir README alineado con el código real; marcar roadmap explícito para lo no implementado.

**P1-002 — OAuth sin protección CSRF ni manejo seguro de tokens.**
- Archivo: `src/auth/google-oauth.ts:39-65`
- Evidencia: `generateAuthUrl` no incluye `state`; el callback acepta cualquier `code` sin verificar `state`. `fs.writeFileSync(TOKEN_PATH, ...)` con permisos por defecto (lectura para otros usuarios en el equipo). Sin revocación ni borrado seguro.
- Impacto: intercambio de código interceptable (CSRF OAuth); refresh token en texto plano legible por otros procesos/usuarios.
- Solución: `state` aleatorio verificado en callback, escritura con modo `0o600`, comando de revocación, sin tokens en logs.

**P1-003 — Herramientas MCP de escritura activas sin aprobación ni desactivación por defecto.**
- Archivo: `src/mcp-server.ts:141-277`
- Evidencia: `gbp_reply_review`, `gbp_delete_review_reply`, `gbp_create_post`, `gbp_delete_post` se registran siempre, sin gate de permisos, sin confirmación y sin validación de que el `reviewName`/`postName` pertenezca a la cuenta/ubicación declarada.
- Impacto: un agente o un prompt injection en contenido de reseñas puede provocar escrituras/borrados reales en GBP sin supervisión.
- Solución: registro condicional (`GBP_ENABLE_WRITE_TOOLS`), validación estricta de nombres, protección cuenta/ubicación, idempotencia.

**P1-004 — `starRating` enum vs número: el motor de respuestas recibe el tipo equivocado.**
- Archivo: `src/api/reviews.ts:18` (enum `'ONE'..'FIVE'`), `src/mcp-server.ts:101` (pasa `r.starRating` crudo como `stars`), `src/ai/reply-engine.ts:12` (`starRating: number`)
- Evidencia: `EMOTIONS[starRating]` en `reply-engine.ts:283` indexa un objeto por clave numérica; con `'FIVE'` cae al fallback `EMOTIONS[3]` (tono neutro para una reseña de 5★).
- Impacto: respuestas con tono inadecuado (agradecimiento neutro en 5★, empatía errónea en 1★).
- Solución: normalización explícita `normalizeStarRating()` + tests.

**P1-005 — Contrato de `updateReply` no verificado y respuesta mal tipada.**
- Archivo: `src/api/reviews.ts:97-106`
- Evidencia: `return response.data` tipado como `{ reviewReply: ... }` sin validación; el código asume estructura anidada y presencia de `reviewReplyState`/`policyViolation` sin verificar contra la API real (pendiente de P01).
- Impacto: `gbp_reply_review` puede reportar `reply: undefined` con `success: true`.
- Solución: contrato verificado con P01 + validación del objeto devuelto + test de contrato.

**P1-006 — Falso pitfall de sincronización: `reviewReply: {}` cuenta como "respondida".**
- Archivo: `src/api/reviews.ts:153-156`
- Evidencia: `!r.reviewReply` es `false` para un objeto vacío `{}` → una reseña con `reviewReply:{}` sin `comment` no se lista como pendiente. Pitfall documentado en el skill `google-business-profile`.
- Impacto: reseñas sin respuesta real quedan ocultas al flujo de auto-respuesta.
- Solución: comprobar `comment` no vacío (string trim), test específico.

### P2 — Mejoras

- **P2-001** — `updatePost` (`posts.ts:138-142`) construye `updateMask` con `Object.keys(updates)` en crudo (claves de TypeScript, no nombres de campo de API).
- **P2-002** — Paginación incompleta en `gbp_list_reviews` (una sola página; `getUnrepliedReviews` sí pagina).
- **P2-003** — `batchGetReviews` (`reviews.ts:120-134`) usa `accounts.locations.batchGetReviews`, método no verificado en la API vigente (PENDIENTE DE VERIFICACIÓN → P01).
- **P2-004** — `hasRisk` solo lista de palabras aisladas (Fase 04 exige escalamiento real por categorías).

## 3. Categoría PENDIENTE DE VERIFICACIÓN

- Estado de `ReviewReplyState` / `PolicyViolation` en la API vigente (¿existen realmente?).
- Disponibilidad pública de Notifications API + Pub/Sub.
- Método REST vigente para responder reseñas tras la eliminación del cliente `mybusiness` del SDK.
- Cuotas y límites de rate publicados.

→ Todo ello resuelto en `docs/audits/P01_API_GOOGLE.md` (investigación en curso).

## 4. App original (`D:\app\mybusiness\gbp-manager`, gbp-manager-liart.vercel.app)

- Next.js 14 + Supabase (25 tablas) + adaptador **Pipedream Connect Proxy** (bloqueado en plan gratuito, 403).
- 18 rutas, 14 componentes, cron diario en Vercel, estado: desplegada con datos reconciliados.
- Pipedream hardcodeado a una cuenta (`ACCOUNT_ID`/`ACCOUNT_PN` en `real-adapter.ts`).
- Relación V2: V2 debe **sustituir la capa de acceso a Google** (sin Pipedream) manteniendo el producto Next.js existente. Matriz de integración en la fase P06.
