# P01 — Estado real de las APIs de Google Business Profile

Fecha: 2026-10-12 · Investigación web (fuentes oficiales de developers.google.com, discovery docs y tarballs npm) + probes HTTP propios. Verificado = contrastado con fuente primaria.

## Resumen ejecutivo

La **Google My Business API v4 (`mybusiness.googleapis.com`) sigue existiendo y en soporte activo** y es HOY la única superficie oficial para **Reviews, LocalPosts, Media y FoodMenus**. No hay fecha de sunset anunciada para la API completa. Sin embargo, **el SDK npm `googleapis` no incluye su cliente en ninguna versión (v36–v185)** porque el servicio ya no publica discovery doc → las llamadas de reseñas/publicaciones deben hacerse por **REST firmado** (lo que implementa `src/api/gbp-rest.ts`).

## Hechos verificados

| # | Tema | Estado real | Fuente |
|---|---|---|---|
| 1 | GMB API v4 | Existe, soporte activo, sin sunset anunciado. Novedades hasta 2026-10 (FoodMenus 2026-10-09; reviews 2026-04/07). Deprecadas solo piezas: `accounts.*`, `accounts.locations.transfer`, `reportInsights` | [FAQ](https://developers.google.com/my-business/content/faq), [Deprecation schedule](https://developers.google.com/my-business/content/deprecations) |
| 2 | reviews.list/get/updateReply/deleteReply | ✅ activos en v4 | [reviews ref](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews) |
| 3 | localPosts.create/get/list/patch/delete | ✅ activos en v4 (pág. act. 2026-04-15). `localPosts.reportInsights` discontinuado (2023) | [localPosts ref](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts) |
| 4 | ¿Reviews en Business Information v1? | **NO.** Su discovery tiene 15 métodos, cero de reviews. `accounts.locations.updateReviewReply` **no existe**; el método real es `accounts.locations.reviews.updateReply` de v4 | [Business Information ref](https://developers.google.com/my-business/reference/businessinformation/rest) |
| 5 | updateReply | `PUT /v4/{name=accounts/*/locations/*/reviews/*}/reply`, body = ReviewReply (solo escribible `comment`, máx. 4096 bytes); **respuesta = ReviewReply PLANO** `{comment, updateTime, reviewReplyState, policyViolation}` — NO `{reviewReply:{...}}` | [updateReply](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply) |
| 6 | deleteReply | `DELETE .../reply`, respuesta JSON vacía | misma ref |
| 7 | ReviewReplyState | ✅ existe (2026-04-01): `REVIEW_REPLY_STATE_UNSPECIFIED/PENDING/REJECTED/APPROVED`, output only | reviews ref |
| 8 | PolicyViolation | ✅ existe (2026-07-01) pero es un **enum** (p. ej. `LOCATION_SUSPENDED`, `EDITING_RESTRICTION`), output only, solo con state=REJECTED | reviews ref |
| 9 | starRating | **Enum de string**: `STAR_RATING_UNSPECIFIED/ONE/TWO/THREE/FOUR/FIVE` | reviews ref |
| 10 | Paginación reviews.list | `pageSize` **máx. 50**, `pageToken`, `orderBy` ∈ {`rating`, `rating desc`, `updateTime desc`} | [reviews.list](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list) |
| 11 | SDK googleapis | Sin módulo `mybusiness` (verificado en tarballs v36–v185). Sí: `mybusinessaccountmanagement`, `mybusinessbusinessinformation`, `mybusinessnotifications`, `mybusinessverifications`, `mybusinessplaceactions`, `mybusinessqanda`, `mybusinesslodging`, `mybusinessbusinesscalls`, `businessprofileperformance` (todos v1) | [npm googleapis](https://registry.npmjs.org/googleapis/latest) |
| 12 | Scopes | `https://www.googleapis.com/auth/business.manage` es correcto y suficiente para todo (reviews, posts, cuentas, notifications, performance) | reviews ref |
| 13 | Notificaciones + Pub/Sub | `mybusinessnotifications v1` (`get/updateNotificationSetting`, campo `pubsubTopic`). Eventos: `NEW_REVIEW`, `UPDATED_REVIEW`, `NEW_CUSTOMER_MEDIA`, `GOOGLE_UPDATE`, `DUPLICATE_LOCATION`, `VOICE_OF_MERCHANT_UPDATED`. Los de Q&A están deprecados | [NotificationSetting](https://developers.google.com/my-business/reference/notifications/rest/v1/NotificationSetting) |
| 14 | Q&A | **API eliminada el 2025-11-03** ("You can no longer read or post questions and answers using the API"), sin reemplazo | FAQ / deprecations |
| 15 | Métricas | `reportInsights` (v4) discontinuado (2023) → usar **Business Profile Performance API v1** (`fetchMultiDailyMetricsTimeSeries`, `getDailyMetricsTimeSeries`, `searchkeywords.impressions.monthly.list`) | [ref_overview](https://developers.google.com/my-business/ref_overview) |
| 16 | Cuotas | ~300 QPM por defecto (Business Information, Account Management, Performance, Verifications, Notifications...). Edits: **10/min por ficha (no ampliable)**. `createLocation` 300 QPD, `updateLocation` 10000 QPD. Exceso → 429 | [Quota limits](https://developers.google.com/my-business/content/limits) |
| 17 | Acceso | Requiere **"Application For Basic API Access"** (revisión oficial ≤14 días). **Cuota 0 = acceso no concedido**. Es por proyecto Cloud. Solo fichas **verificadas**. Políticas: prohibido automatizar respuestas sin consentimiento explícito del cliente final | [prereqs](https://developers.google.com/my-business/content/prereqs) |

## Verificación propia (probes HTTP, 2026-10-12)

- `GET /v4/accounts` → 404 (método muerto → usar Account Management v1) ✓
- `GET /v4/accounts/{a}/locations` y `.../locations/{l}` → 404 (→ Business Information v1) ✓
- `GET /v4/accounts/{a}/locations/{l}/reviews{,/r}` → **401** (endpoint vivo) ✓
- `PUT/DELETE .../reviews/{r}/reply` → **401** (vivos) ✓
- `GET/POST /v4/.../localPosts`, `GET/PATCH/DELETE .../localPosts/{p}` → **401** (vivos) ✓
- `locations:batchGetReviews` y `reviews:batchGet` → **404** (no existen; código eliminado) ✓

## Ajustes aplicados al código por este informe

1. `policyViolation` corregido de `{type, details}` a enum string tolerante (`src/api/reviews.ts`).
2. `stars` tolerante a `STAR_RATING_UNSPECIFIED` en salidas MCP (`src/mcp-server.ts`).
3. Reintentos con backoff exponencial + jitter ante 429/5xx (`src/api/gbp-rest.ts` + tests).
4. Roadmap corregido: Q&A eliminada de planes; métricas vía Performance API.

## NO VERIFICADO

- Cuotas publicadas específicas de v4.9 (la tabla no tiene fila para ella).
- Fecha futura de sunset de v4 (hoy ninguna anunciada; el discovery doc ya devuelve 404, señal de degradación del tooling aunque el runtime REST siga activo).
- Si Notifications exige allowlist adicional al formulario de acceso.
