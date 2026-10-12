# GBP Manager V2 — Google Business Profile Management

Núcleo TypeScript para gestionar **Google Business Profile** con OAuth directo (sin Pipedream) + servidor **MCP** para agentes de IA (Hermes, Claude Code, Cursor).

> Estado: producción-verificado localmente. TypeScript PASS · Build PASS · 83 tests PASS · Gitleaks clean.
> Evidencias: `docs/audits/P00_REALITY_AUDIT.md`, `docs/PROGRESO.md`.

## ✨ Qué hace realmente (alineado con el código)

- **Multi-cuenta** — lista cuentas y establecimientos de una cuenta agencia (`AccountsAPI`, `LocationsAPI`)
- **Reseñas** — lectura con paginación completa, respuesta y borrado de respuesta (`ReviewsAPI`)
- **Publicaciones** — listado, creación, actualización y borrado de local posts (`PostsAPI`)
- **Motor de respuestas híbrido** — reglas deterministas + LLM opcional + control de calidad + gestión de riesgo (`src/ai/`)
- **MCP server** — herramientas READ ONLY siempre; WRITE CONTROLLED desactivadas por defecto (`src/mcp-server.ts`)
- **Sin dependencias de terceros** — acceso directo a Google APIs

### Roadmap (NO implementado todavía)

Media, insights (`businessprofileperformance v1`), notificaciones Pub/Sub. **Q&A está fuera de roadmap: Google eliminó la My Business Q&A API el 2025-11-03 sin reemplazo.** Ver `docs/P05_PERSISTENCIA.md` y `docs/P06_INTEGRACION_WEB.md`.

## 🚀 Instalación rápida (Windows/Linux)

```bash
git clone https://github.com/migtar2/gbp-manager-v2.git
cd gbp-manager-v2
npm install
cp .env.example .env      # en Windows: copy .env.example .env
# Edita .env con tus credenciales de Google
npm run auth              # Autentica con Google (abre el navegador)
npm start                 # Lista cuentas y establecimientos
```

Requisitos: Node.js ≥ 20.

## 🔧 Configuración de Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un proyecto (o usa uno existente)
3. Habilita estas APIs:
   - **My Business Account Management API**
   - **My Business Business Information API**
   - **Business Profile Performance API** (opcional, insights)
4. Ve a **APIs & Services → Credentials**
5. Crea **OAuth 2.0 Client ID** (Desktop)
6. Copia el Client ID y Client Secret en `.env`

## 📋 Variables de entorno (`.env`)

| Variable | Requerida | Descripción |
|---|---|---|
| `GOOGLE_CLIENT_ID` | sí | OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | sí | OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | no | Por defecto `http://localhost:3456/callback` |
| `AUTH_PORT` | no | Puerto del servidor de auth (3456) |
| `GBP_ENABLE_WRITE_TOOLS` | no | `true` activa las herramientas MCP de escritura (por defecto **desactivadas**) |
| `REPLY_LLM_BASE_URL` | no | Endpoint compatible con chat de OpenAI para el motor híbrido |
| `REPLY_LLM_API_KEY` | no | API key de dicho endpoint |
| `REPLY_LLM_MODEL` | no | Modelo a usar |
| `LOG_LEVEL` | no | Nivel de logging |

## 🤖 Uso con MCP (Hermes, Claude Code, Cursor)

```bash
npm run build
# Claude Code:
claude mcp add gbp-manager node /path/to/gbp-manager-v2/dist/mcp-server.js
# Cursor: Settings → MCP → Add Server
```

### Herramientas MCP

**READ ONLY** (siempre disponibles):

| Herramienta | Descripción |
|---|---|
| `gbp_list_accounts` | Cuentas GBP accesibles |
| `gbp_list_locations` | Establecimientos de una cuenta (paginado) |
| `gbp_list_reviews` | Reseñas (todas las páginas) |
| `gbp_get_unreplied_reviews` | Reseñas sin respuesta o con respuesta rechazada |
| `gbp_list_posts` | Publicaciones locales |

**WRITE CONTROLLED** (solo con `GBP_ENABLE_WRITE_TOOLS=true`):

| Herramienta | Descripción |
|---|---|
| `gbp_reply_review` | Responder una reseña (idempotente) |
| `gbp_delete_review_reply` | Borrar la respuesta |
| `gbp_create_post` | Crear publicación (idempotente) |
| `gbp_delete_post` | Borrar publicación |

Toda herramienta de escritura exige `accountId` + `locationId` y valida que el recurso pertenece a ellos (protección contra operaciones sobre el establecimiento equivocado).

## 📁 Estructura del proyecto

```
gbp-manager-v2/
├── src/
│   ├── index.ts              # CLI: lista cuentas y establecimientos
│   ├── mcp-server.ts         # MCP server (READ/WRITE gateado)
│   ├── auth/google-oauth.ts  # OAuth 2.0 (state anti-CSRF, tokens 0600, revoke)
│   ├── api/
│   │   ├── gbp-rest.ts       # Cliente REST firmado (endpoints sin SDK)
│   │   ├── accounts.ts       # mybusinessaccountmanagement v1
│   │   ├── locations.ts      # mybusinessbusinessinformation v1
│   │   ├── reviews.ts        # reviews (REST verificado)
│   │   └── posts.ts          # localPosts (REST verificado)
│   ├── ai/
│   │   ├── reply-engine.ts   # Nivel 1: reglas + anti-repetición
│   │   ├── llm-adapter.ts    # Nivel 2: LLM opcional (OpenAI-compatible)
│   │   ├── quality.ts        # Nivel 3: control de calidad
│   │   ├── risk.ts           # Nivel 4: riesgo → revisión humana
│   │   ├── hybrid-engine.ts  # Orquestador L1-L4
│   │   └── star-rating.ts    # Normalización 'ONE'..'FIVE' ↔ 1-5
│   └── mcp/
│       ├── guards.ts         # Validación, aislamiento, idempotencia
│       └── write-ops.ts      # Operaciones de escritura testeables
├── docs/                     # Auditorías, progreso, integración
├── .env.example
└── package.json
```

## 🔐 Permisos OAuth

```
https://www.googleapis.com/auth/business.manage
```

Cubre lectura/escritura de reseñas, publicaciones, ubicaciones e insights.

## ⚠️ Requisitos de acceso (importante)

- Las APIs de Business Profile exigen **"Application For Basic API Access"** (revisión oficial ≤14 días). **Cuota 0 = acceso aún no concedido**; 300 QPM = aprobado.
- Límites: **10 ediciones por minuto por ficha** (no ampliable); ~300 QPM de lectura. El cliente aplica backoff con jitter ante 429.
- Las operaciones de reseñas solo funcionan sobre **fichas verificadas**.
- Las políticas de Google prohíben automatizar respuestas a reseñas sin consentimiento explícito del cliente final (por eso las escrituras están desactivadas por defecto y las reseñas de riesgo van a revisión humana).

## 📊 APIs de Google utilizadas (verificadas 2026-10-12)

| Capacidad | API / endpoint | Estado |
|---|---|---|
| Cuentas | My Business Account Management v1 (SDK) | ✅ |
| Ubicaciones | My Business Business Information v1 (SDK) | ✅ |
| Reseñas | `mybusiness.googleapis.com/v4/accounts/*/locations/*/reviews*` (REST) | ✅ endpoints vivos |
| Publicaciones | `mybusiness.googleapis.com/v4/accounts/*/locations/*/localPosts*` (REST) | ✅ endpoints vivos |
| Insights | Business Profile Performance v1 | pendiente de integrar |
| Notificaciones | My Business Notifications v1 (Pub/Sub) | pendiente de integrar |

**Importante:** la API legacy `mybusiness:v4` fue retirada del SDK `googleapis` y del discovery de Google; los endpoints de reseñas y publicaciones siguen operativos y se llaman mediante REST firmado (`src/api/gbp-rest.ts`). Los métodos `accounts.*` y `locations.*` del legacy están **muertos** (404) y se usan los clientes nuevos.

## 🧪 Testing

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest (83 tests)
npm run lint        # eslint
```

Cobertura de riesgo: normalización de rating, motor híbrido (reglas/LLM/calidad/riesgo), OAuth (state, permisos de token, revocación), guards MCP (aislamiento de cuentas/ubicaciones, idempotencia, fail-closed), contratos de API (paginación, `updateReply`, pitfall `reviewReply:{}`).

## 🔒 Seguridad

- Sin secretos en el repo ni en el historial (Gitleaks en CI).
- `token.json` con permisos 0600; revocación disponible (`GoogleAuth.revoke()`).
- Escrituras MCP desactivadas por defecto.
- Contenido de reseñas tratado como datos externos no confiables (prompt injection).
- Ver `docs/audits/P00_REALITY_AUDIT.md` para el registro de hallazgos.

## 📄 Licencia

MIT
