# GBP Manager V2 — Google Business Profile Management

Controla **cualquier** Google Business Profile desde una única cuenta agencia. Incluye MCP server para integración con IA (Claude, Cursor, etc.).

## ✨ Características

- **Multi-cuenta** — Gestiona todos los GBP que tu cuenta agencia controle
- **Reseñas** — Lee, responde y gestiona reseñas con IA
- **Publicaciones** — Crea, edita y borra posts (Standard, Event, Offer)
- **Q&A** — Gestiona preguntas y respuestas
- **Media** — Sube y gestiona fotos/vídeos
- **Insights** — Métricas de rendimiento
- **MCP Server** — Integra con Claude Code, Cursor, y otras herramientas IA
- **Sin dependencias externas** — Usa Google APIs directamente (sin Pipedream)

## 🚀 Instalación rápida

```bash
git clone https://github.com/migtar2/gbp-manager-v2.git
cd gbp-manager-v2
npm install
cp .env.example .env
# Edita .env con tus credenciales de Google
npm run auth    # Autentica con Google
npm start       # Inicia el servidor
```

## 🔧 Configuración de Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un proyecto (o usa uno existente)
3. Habilita estas APIs:
   - **My Business Account Management API**
   - **My Business Business Information API**
   - **Google My Business API v4**
   - **Business Profile Performance API**
4. Ve a **APIs & Services → Credentials**
5. Crea **OAuth 2.0 Client ID** (Desktop)
6. Copia el Client ID y Client Secret en `.env`

## 📋 Variables de entorno

```env
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3456/callback
```

## 🤖 Uso con MCP (Claude Code, Cursor, etc.)

```bash
# Añadir como MCP server
claude mcp add gbp-manager node /path/to/gbp-manager-v2/dist/mcp-server.js

# O en Cursor: Settings → MCP → Add Server
```

### Herramientas MCP disponibles

| Herramienta | Descripción |
|---|---|
| `gbp_list_accounts` | Lista todas las cuentas GBP |
| `gbp_list_locations` | Lista ubicaciones de una cuenta |
| `gbp_list_reviews` | Lista reseñas de una ubicación |
| `gbp_reply_review` | Responde a una reseña |
| `gbp_create_post` | Crea una publicación |
| `gbp_list_posts` | Lista publicaciones |
| `gbp_delete_post` | Borra una publicación |
| `gbp_get_insights` | Obtiene métricas de rendimiento |
| `gbp_get_qa` | Obtiene preguntas y respuestas |
| `gbp_answer_question` | Responde a una pregunta |

## 📁 Estructura del proyecto

```
gbp-manager-v2/
├── src/
│   ├── index.ts              # Servidor principal
│   ├── mcp-server.ts         # MCP server para IA
│   ├── auth/
│   │   ├── google-oauth.ts   # Autenticación OAuth 2.0
│   │   └── token-manager.ts  # Gestión de tokens
│   ├── api/
│   │   ├── accounts.ts       # Gestión de cuentas
│   │   ├── locations.ts      # Gestión de ubicaciones
│   │   ├── reviews.ts        # Gestión de reseñas
│   │   ├── posts.ts          # Gestión de publicaciones
│   │   ├── media.ts          # Gestión de medios
│   │   ├── qa.ts             # Preguntas y respuestas
│   │   └── insights.ts       # Métricas
│   ├── ai/
│   │   ├── reply-engine.ts   # Generador de respuestas IA
│   │   └── anti-repetition.ts # Anti-repetición
│   └── utils/
│       ├── logger.ts         # Logging
│       └── config.ts         # Configuración
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## 🔐 Permisos OAuth necesarios

```
https://www.googleapis.com/auth/business.manage
```

Este scope cubre:
- Lectura/escritura de reseñas
- Gestión de publicaciones
- Gestión de ubicaciones
- Acceso a insights

## 📊 APIs de Google utilizadas

| API | Endpoint | Uso |
|---|---|---|
| Account Management | `mybusinessaccountmanagement.googleapis.com` | Cuentas y usuarios |
| Business Information | `mybusinessbusinessinformation.googleapis.com` | Ubicaciones |
| Google My Business v4 | `mybusiness.googleapis.com` | Reseñas, posts, media |
| Performance | `mybusinessperformance.googleapis.com` | Insights |

## 🆕 Novedades API v4.9 (2026)

- **ReviewReplyState** — Moderación de respuestas (PENDING/APPROVED/REJECTED)
- **PolicyViolation** — Ver por qué Google rechazó una respuesta
- **ReviewMediaItem** — Fotos/vídeos de clientes en reseñas
- **RecurrenceInfo** — Posts recurrentes programados
- **review_reply_url** — URL directa de la respuesta

## 📄 Licencia

MIT
