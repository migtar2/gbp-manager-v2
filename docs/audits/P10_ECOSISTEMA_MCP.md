# P10 — Ecosistema Google MCP (investigación, oct. 2026)

Clasificación: **(1)** MCP oficial de Google · **(2)** MCP de la comunidad · **(3)** SDK oficial · **(4)** API REST oficial · **(5)** no mantenido/experimental.

## Hallazgos clave

1. **No existe MCP oficial de Google para Business Profile** (verificado en github.com/google/mcp, MCP remotos de Google Cloud/Workspace, developers.google.com/my-business y el registro MCP oficial). Para GBP no hay atajo oficial.
2. Sí hay MCPs **oficiales para Workspace** (Gmail, Drive, Docs, Sheets, Slides, Calendar, Chat, People): remotos en Developer Preview (Streamable HTTP + OAuth) y una extensión local open-source para Gemini CLI (stdio, Apache-2.0).
3. **Pub/Sub**: MCP remoto oficial GA desde abril 2026 (`https://pubsub.googleapis.com/mcp`) y SDK oficial `@google-cloud/pubsub`.
4. Los MCPs comunitarios de GBP son **todos experimentales** (1-16 commits); el más completo (jmdurant/gbp-mcp-server) incluye herramientas Q&A para una API que Google eliminó (2025-11-03).
5. `googleapis` cubre todas las sub-APIs de GBP **menos** el v4 legacy (reseñas/replies): issue googleapis/google-api-nodejs-client#3513 → REST directo con `client.request()` (exactamente `src/api/gbp-rest.ts`).
6. Acceso GBP: formulario de aprobación (oficial ~14 días; la comunidad reporta más), **cuota 0 QPM = no aprobado**, 300 QPM aprobado, 10 ediciones/min/ficha, sin sandbox.

## Opciones evaluadas

| Opción | Cat. | Auth | Veredicto |
|---|---|---|---|
| MCP remotos Workspace (gmailmcp/drivemcp/... `.googleapis.com/mcp/v1`) | 1 | OAuth | ✅ para Workspace; requiere Developer Preview + puente HTTP→stdio para Hermes; **no cubre GBP** |
| [gemini-cli-extensions/workspace](https://github.com/gemini-cli-extensions/workspace) | 1 | OAuth local | ✅ mejor opción oficial local para Workspace (stdio, Apache-2.0). Riesgo de prompt injection documentado |
| [MCP remoto Pub/Sub](https://docs.cloud.google.com/pubsub/docs/reference/mcp) | 1 | OAuth+IAM | ✅ para notificaciones GBP (Streamable HTTP → puente para Hermes) |
| [googleapis + google-auth-library](https://github.com/googleapis/google-api-nodejs-client) | 3 | OAuth/SA | ✅✅ **base de GBP Manager**: tipos, refresh, reintentos; REST puntual para v4 |
| [@google-cloud/pubsub](https://github.com/googleapis/nodejs-pubsub) | 3 | Service account | ✅ consumo programático de notificaciones |
| API REST GBP (v4 + sub-APIs) | 4 | OAuth `business.manage` | ✅✅ superficie completa; con aprobación y cuotas |
| [taylorwilsdon/google_workspace_mcp](https://github.com/taylorwilsdon/google_workspace_mcp) | 2 | OAuth 2.0/2.1 | ✅ comunidad más sólida para Workspace (120+ tools, stdio, modo read-only) |
| [nspady/google-calendar-mcp](https://github.com/nspady/google-calendar-mcp) | 2 | OAuth | ✅ alternativa si solo hace falta Calendar |
| [xing5/mcp-google-sheets](https://github.com/xing5/mcp-google-sheets) | 2 | SA/OAuth | ✅ alternativa Sheets con filtrado de herramientas |
| [jmdurant/gbp-mcp-server](https://github.com/jmdurant/gbp-mcp-server) | 2 | OAuth | ⚠️ solo como **referencia de diseño** (28 tools); no producción (16 commits, tools Q&A muertas) |
| [narkov/gbp-mcp-server](https://github.com/narkov/gbp-mcp-server) | 5 | OAuth | ❌ 1 commit; referencia de lista de operaciones |
| satheeshds/gbp-review-agent, T31K/..., amirjahfar1/... | 5 | OAuth/SA | ❌ experimentales |
| GongRzhe Gmail MCP, modelcontextprotocol/server-gdrive | 5 | OAuth | ❌ estancados/archivados/deprecated |
| Pipedream MCP (GBP/Workspace) | 2 | OAuth gestionado por Pipedream | ❌ proxy 403 en plan gratuito + dependencia SaaS de credenciales |

## Recomendación para GBP Manager (coincide con la arquitectura implementada)

**MCP propio ligero (este repo) sobre `googleapis` + REST firmado para v4** (reviews/replies, LocalPosts), scope único `business.manage`, OAuth por cliente, write tools gateados. Para Workspace: extensión oficial Gemini CLI (stdio) o `google_workspace_mcp`. Para notificaciones: `@google-cloud/pubsub` con service account (el MCP remoto de Pub/Sub requiere puente HTTP). Evitar Pipedream y cualquier MCP de GBP de un solo commit.
