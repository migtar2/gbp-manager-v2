# P06 — Integración con la aplicación web existente

**App original:** `D:\app\mybusiness\gbp-manager` → https://gbp-manager-liart.vercel.app/ (Next.js 14 + Supabase + Pipedream).
**V2:** este repositorio (librería core + MCP server, sin frontend).

## Veredicto de arquitectura

V2 **no reemplaza** la app Next.js: la **alimenta**. Se evita crear dos backends: V2 se empaqueta como librería (`dist/`) que las API routes del Next.js consumen en server-side, sustituyendo el adaptador Pipedream. El MCP server es una **interfaz adicional para agentes**, nunca el canal entre frontend y backend.

```
Frontend Next.js (existente, se conserva)
  └─ API routes (existentes, adaptadas)
       └─ gbp-manager-v2 core (nuevo: src/api/*, src/ai/*, src/mcp/guards)
            └─ Google APIs (OAuth directo, sin Pipedream)

Agente Hermes ──► MCP server (src/mcp-server.ts) ──► mismo core
```

## Matriz de funcionalidades

| Funcionalidad | Aplicación original | V2 | Acción recomendada |
|---|---|---|---|
| Login + rate limiting | ✅ Supabase Auth | — | Conservar tal cual |
| Dashboard (18 rutas) | ✅ | — | Conservar; cambiar solo la capa de datos |
| Selector de cuentas/establecimientos | ✅ vía Pipedream | ✅ `AccountsAPI`/`LocationsAPI` | Reemplazar adapter → V2 |
| Lectura de reseñas | ✅ vía Pipedream | ✅ `ReviewsAPI` (REST verificado) | Reemplazar adapter → V2 |
| Respuesta a reseñas | ✅ publish route con confirmación | ✅ `replyToReview` + guards | Reemplazar; conservar máquina de estados `publishing→published` |
| Generación de respuestas IA | ✅ `reply-engine.ts` (plantillas) | ✅ motor híbrido L1-L4 | Migrar al motor V2 (riesgo + calidad + LLM opcional) |
| Publicaciones (CRUD + IA) | ✅ | ✅ `PostsAPI` | Reemplazar adapter → V2 |
| Estadísticas/insights | ✅ derivadas de DB | ⛔ no implementado en V2 | Mantener las de la app; añadir `businessprofileperformance` más adelante |
| Horarios | ✅ con aviso "MCP no disponible" | ⛔ | Pendiente (Business Information API `locations.patch`) |
| Automatización + escalado | ✅ reglas por ubicación | ✅ `assessRisk` + `requiresHumanReview` | Conectar reglas al motor de riesgo V2 |
| Notificaciones | ✅ DB + polling | — | Conservar; Pub/Sub opcional (P05) |
| Auditoría | ✅ `audit_log` | — | Conservar |
| Sincronización | ✅ `/api/sync` + cron diario | ✅ diseño P05 | Reescribir sync contra `ReviewsAPI.listAllReviews` |
| Q&A | ⛔ (solo en README de V2) | ⛔ | Roadmap con `mybusinessqanda v1` (API existe, verificar acceso) |
| Media | ⛔ | ⛔ | Roadmap |
| MCP para agentes | ⛔ | ✅ | Registrar en Hermes cuando haya token |
| Pipedream | 🔴 403 plan gratuito | ✅ eliminado | Borrar `real-adapter.ts` al migrar |

## Riesgos de migración

1. **Tokens**: la app usa service role de Supabase + Pipedream; V2 usa OAuth Google. Proveer `token.json`/env equivalente en Vercel (secretos, no `.env` commiteado).
2. **Funciones anunciadas no implementadas** (Q&A, media, insights): no prometerlas en la UI hasta que existan.
3. **Moderación de respuestas**: `reviewReplyState` puede no llegar en todas las cuentas; el código ya trata el campo como opcional (`UNKNOWN`).
4. **Cuotas**: la reconciliación diaria por 5 establecimientos está muy por debajo de los límites, pero el paginado completo debe respetar `maxPages`.

## Pasos de integración (orden sugerido)

1. Publicar `gbp-manager-v2` como dependencia (git) del proyecto Next.js.
2. Crear `src/lib/gbp/` en la app con las llamadas a `ReviewsAPI`/`PostsAPI`.
3. Sustituir `real-adapter.ts` por el nuevo módulo (misma interfaz `McpToolResult`).
4. Migrar `reply-generator.ts` → `hybrid-engine.ts`.
5. Ejecutar la reconciliación y comparar con los datos actuales antes de activar escrituras.
