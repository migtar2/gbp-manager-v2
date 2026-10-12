# P05 — Persistencia y sincronización (diseño)

## Principio

**Reutilizar la base de datos existente** (Supabase, 25 tablas ya desplegadas por la app original en `mybusiness/gbp-manager`), no introducir infraestructura nueva. V2 aporta la capa de acceso a Google; la persistencia sigue siendo la del producto.

## Modelo de entidades (mapeo sobre el esquema existente)

| Entidad | Tabla existente | Notas |
|---|---|---|
| Cuentas GBP | `accounts` | Una fila por cuenta agencia/personal |
| Establecimientos | `locations` | FK → accounts; config de tono/firma por location |
| Reseñas | `reviews` | Único por `review_id` (clave de idempotencia de sincronización) |
| Respuestas | `review_replies` | Estado: `none → draft → publishing → published/failed/escalated` |
| Borradores IA | `review_replies.draft` | Generados por el motor híbrido, jamás publicados automáticamente |
| Publicaciones | `posts` | Espejo de localPosts |
| Config por empresa | `location_settings` | Tono, tuteo, firma, emojis, reglas |
| Tokens protegidos | `oauth_tokens` | Cifrados en reposo (ver abajo) |
| Tareas de sync | `sync_tasks` | Historial de ejecuciones |
| Errores | `sync_errors` | Con payload de diagnóstico |
| Auditoría | `audit_log` | Toda operación de escritura |

## Tokens OAuth

- Local (Hermes): `token.json` con permisos `0600` (ya implementado, `src/auth/google-oauth.ts`).
- SaaS: cifrar refresh tokens en reposo (AES-256-GCM con clave en secret manager), aislamiento por tenant, nunca en logs, revocación al de-provisionar.

## Multiubicación ≠ multitenancy

- **Multiubicación**: un token de cuenta agencia accede a N establecimientos. Existe ya.
- **Multitenancy**: varios clientes independientes sobre la misma instalación. Requiere aislamiento por `tenant_id` en cada tabla + RLS + autorización por operación y establecimiento (los guards de `src/mcp/guards.ts` ya validan pertenencia a cuenta/ubicación en cada escritura).

## Sincronización de reseñas

1. **Pull periódico** (reconciliación): `ReviewsAPI.listAllReviews` por cada ubicación activa, upsert idempotente por `review_id`.
2. **Push opcional** (cuando esté aprobado el acceso): `mybusinessnotifications v1` configura un topic de Cloud Pub/Sub por cuenta; el evento identifica la ubicación y el sistema **recupera los datos oficiales por API** (el evento nunca se usa como fuente de verdad).
3. Detección de duplicados: índice único `review_id` + comprobación de `updateTime`.
4. Evaluación de reglas (Nivel 1 del motor) → generación de borrador (Nivel 2/3) → **publicación solo con aprobación explícita** (los 1-2★ y todo lo con `requiresHumanReview` van a `escalated`).
5. Verificación posterior: releer la reseña y confirmar `reviewReply.comment` no vacío y `reviewReplyState` antes de marcar `published`.
6. Reconciliación periódica para eventos perdidos; operaciones idempotentes por `(review_id, acción)`.

## Concurrencia

- Escrituras con compare-and-swap sobre el estado (`publishing` solo desde `draft/approved`).
- El `IdempotencyGuard` del MCP previene duplicados en la ventana activa; la BD los previene de forma duradera (constraint única).
- Una reseña **nunca** puede generar dos publicaciones por reintentos: la segunda ejecución choca con la constraint.

## Nota Pipedream

La app original usa Pipedream Connect Proxy (`real-adapter.ts`) que devuelve **403 en plan gratuito**. Este diseño elimina esa dependencia: acceso directo con OAuth (`src/api/*`).
