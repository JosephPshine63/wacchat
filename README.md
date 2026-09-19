# WacChat

Real-time chat application built as a small set of Spring Boot microservices behind an API Gateway, with an Angular SPA, PostgreSQL, Keycloak and RabbitMQ. It supports 1:1 and group chats, WebRTC audio/video calls, media upload (Cloudflare R2), Web Push, the "Arno" AI chatbot, and a UI in five languages (it, en, fr, de, es).

**Live demo:** [wacchat.win](https://wacchat.win)

Full documentation (features, tech stack, architecture, configuration, API and deploy notes) lives in [`wac/README.md`](wac/README.md).

## Repository layout

| Path | Contents |
|------|----------|
| `wac/backend` | Main REST API (Spring Boot 3, Java 17) |
| `wac/api-gateway` | Spring Cloud Gateway — single edge entrypoint |
| `wac/file-service` | File storage microservice (Cloudflare R2) |
| `wac/notification-service` | Realtime/WebSocket microservice (STOMP over RabbitMQ) |
| `wac/call-service` | WebRTC call-signaling microservice |
| `wac/shared-security` | Shared JWT/Keycloak security library |
| `wac/frontend` | Angular 19 SPA (Transloco i18n) |
| `wac/keycloak` | Realm template and custom login theme |
| `wac/database` | Reference SQL schema |
| `observability/` | Prometheus, Grafana, Loki and Tempo configuration |
| `docker-compose*.yml`, `deploy-*.sh` | Local and production orchestration |

## Quick start (local)

```bash
cp .env.example .env                                               # fill in passwords, mail, DEEPL_API_KEY (optional)
cd wac/shared-security && ./mvnw install -DskipTests && cd ../..   # one-time: install the shared library
./deploy-local.sh                                                  # PostgreSQL, Keycloak, RabbitMQ, API Gateway, observability
./start-local-services.sh                                          # backend, file-, notification- and call-service, frontend
```

The app is then available at <http://localhost:4200>. Apply `wac/database/schema.sql` on the first run — see [`wac/README.md`](wac/README.md) for the details.

## For contributors and AI assistants

[`CLAUDE.md`](CLAUDE.md) describes the commands, architecture and conventions used in this repository (including the i18n workflow).
