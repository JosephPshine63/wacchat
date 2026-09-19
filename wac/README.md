# WacChat

**Full-stack real-time chat application**, decomposed into a small set of Spring Boot microservices behind a single API Gateway, an Angular SPA, PostgreSQL, Keycloak, and RabbitMQ. Users authenticate via OAuth2/OIDC (Keycloak), exchange messages over WebSocket (STOMP/SockJS, relayed through RabbitMQ), upload media to Cloudflare R2, and get a welcome AI chatbot conversation on first login.

**Live demo:** [wacchat.win](https://wacchat.win)

---

## Features

- Real-time messaging via STOMP/SockJS WebSocket, backed by a RabbitMQ STOMP broker relay (not an in-memory broker) so subscription state is shared across instances
- OAuth2/OpenID Connect authentication delegated entirely to Keycloak, including Google login
- Automatic user provisioning: first authenticated request upserts Keycloak JWT claims into the local DB — no separate registration flow
- Single-session lock: a second concurrent login is rejected (HTTP 409) while the original session is still active/fresh
- Per-conversation chat threads with message state tracking (SENT → SEEN)
- Media file upload/download (text, image, audio — up to 50 MB per file) stored in a Cloudflare R2 bucket, with magic-byte validation on upload
- "Arno" AI chatbot (Gemini-backed) — every new user gets an auto-created welcome chat
- Desktop notifications in the browser for incoming messages/images
- Full observability stack: traces (Tempo), metrics (Prometheus), logs (Loki), dashboards (Grafana)
- REST API documented with OpenAPI/Swagger
- Angular client fully generated from the OpenAPI spec (`ng-openapi-gen`)

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend services | Java 17, Spring Boot 3.4.13, Spring Data JPA, Spring Security OAuth2 Resource Server, Maven (multi-module) |
| API Gateway | Spring Cloud Gateway (WebFlux/Netty — reactive, unlike the servlet stack used by the other services) |
| Realtime | Spring WebSocket (STOMP/SockJS), RabbitMQ STOMP broker relay + AMQP event bus |
| File storage | Cloudflare R2 (S3-compatible), AWS SDK v2 |
| Frontend | Angular 19, TypeScript, Keycloak-js, SockJS + STOMP, Bootstrap 5, Font Awesome 6, Quill, ngx-emoji-mart |
| Database | PostgreSQL, managed schema via `database/schema.sql` (Flyway present but disabled; `ddl-auto: update` handles dev drift) |
| Auth | Keycloak (realm `wacchat`, client `wacchat-app`), custom dark theme |
| Messaging | RabbitMQ (AMQP `5672`, STOMP plugin `61613`, management UI `15672`) |
| Observability | OpenTelemetry/Micrometer Tracing → Tempo, Logback → Loki, Micrometer/Actuator → Prometheus, Grafana dashboards |
| Mail | Resend SMTP |
| AI | Google Gemini (Arno chatbot) |
| Dev infra | Docker Compose, direnv |

---

## Prerequisites

- Java 17+
- Node.js 20+ and npm
- Docker and Docker Compose
- Maven 3.8+ (or use the included `mvnw` wrapper)
- [direnv](https://direnv.net/) (for auto-loading `.env` when running services on the host)

---

## Local development

### 1. Create `.env`

Copy `.env.example` at the repo root and fill in your secrets (never commit `.env`):

```bash
cp .env.example .env
```

Values include Postgres/Keycloak/RabbitMQ credentials, Google OAuth client id/secret, Resend SMTP credentials, `ADMIN_EMAIL`, Cloudflare R2 credentials (`R2_*`), and the internal service-to-service API keys (`BACKEND_INTERNAL_API_KEY`, `FILE_SERVICE_INTERNAL_API_KEY`) — see [Configuration](#configuration) below for the full list and defaults.

### 2. Install the shared-security module (one-time)

`backend`, `file-service`, and `notification-service` all depend on `shared-security` (the Keycloak JWT auth converter) as a regular Maven dependency, so it needs to be installed to your local `~/.m2` first:

```bash
cd wac/shared-security && ./mvnw install -DskipTests && cd ../..
```

Re-run this whenever `shared-security` changes.

### 3. Start infrastructure

```bash
./deploy-local.sh
```

Do **not** run `docker compose up` directly. This script sources `.env`, renders `wac/keycloak/realms/wacchat.json` from the template, and starts (via Docker Compose):

- PostgreSQL `:5433`
- Keycloak `:8180`
- RabbitMQ `:5672` (AMQP), `:61613` (STOMP), `:15672` (management UI)
- API Gateway `:8081` (built from source and containerized)
- The observability stack: Prometheus `:9091`, Grafana `:3000`, Loki `:3100`, Tempo `:4318`/`:4317`/`:3200`

### 4. Apply the database schema (first run only)

```bash
psql -h localhost -p 5433 -U wacchat -d wacchat_db -f wac/database/schema.sql
```

### 5. Start the remaining services

```bash
./start-local-services.sh               # starts backend, file-service, notification-service, frontend
./start-local-services.sh status        # show which are running
./start-local-services.sh stop          # stop everything it started
```

This loads each service via `direnv exec` (so `.env` is picked up through `.envrc`) and logs to `logs/<name>.log`. Alternatively, run any one service manually, e.g.:

```bash
cd wac/backend && ./mvnw spring-boot:run             # http://localhost:8082
cd wac/file-service && ./mvnw spring-boot:run        # http://localhost:8083
cd wac/notification-service && ./mvnw spring-boot:run # http://localhost:8084
cd wac/frontend && npm install && npm start          # http://localhost:4200
```

The frontend always talks to the gateway (`http://localhost:8081`), never directly to backend/file-service/notification-service. Swagger UI is available at `http://localhost:8082/swagger-ui.html`.

> **Note:** `start-local-services.sh` also lists `api-gateway` among the services it can start via `mvnw`, but that's stale — `deploy-local.sh` already runs api-gateway as a Docker container on the same port (`:8081`), so running it again would conflict.

---

## Configuration

Each service's `application.yml` reads its values from environment variables with sensible defaults. See the root `CLAUDE.md` for the full table of env vars per service (backend, file-service, notification-service, api-gateway). A few of the most relevant:

| Env var | Default | Notes |
|---------|---------|-------|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5433/wacchat_db` | backend |
| `KEYCLOAK_ISSUER_URI` | `http://localhost:8180/realms/wacchat` | shared by all JWT-validating services |
| `RABBITMQ_HOST` / `RABBITMQ_PORT` | `localhost` / `5672` | backend + notification-service |
| `RABBITMQ_STOMP_PORT` | `61613` | notification-service only (broker relay) |
| `BACKEND_INTERNAL_API_KEY` | _(empty — endpoint rejects all calls)_ | shared secret for service-to-service calls into backend |
| `FILE_SERVICE_INTERNAL_API_KEY` | _(empty — upload disabled)_ | must match on backend and file-service |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_BASE_URL` | _(empty — media upload disabled)_ | file-service, Cloudflare R2 |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | _(empty — disables email)_ | Resend SMTP |
| `ADMIN_EMAIL` | _(empty)_ | protected from scheduled user cleanup; also set on the Keycloak admin user |

Frontend Keycloak URL/realm/client-id are set per-environment in `wac/frontend/src/environments/environment.ts` (dev) and `environment.prod.ts` (prod), not hardcoded in the service.

---

## Usage

### Regenerate the Angular API client

After any backend API change, regenerate the Angular services from the updated OpenAPI spec (backend must be running):

```bash
curl http://localhost:8082/v3/api-docs -o wac/frontend/src/openapi/openapi.json
cd wac/frontend && npm run api-gen
```

### WebSocket destinations

| Direction | Destination |
|-----------|-------------|
| Send message | `/app/chat` |
| Receive notifications | `/user/queue/chat` |
| Typing indicator | `/app/chat.typing` |

The client subscribes to the bare `/user/queue/chat` — **not** `/user/{userId}/queue/chat`. Spring's destination resolver scopes any `/user/**` subscription to the connecting session automatically.

---

## User management

Self-registration is handled through Keycloak (including Google login). On first login, the backend automatically provisions the user into the local database.

### Inviting a new user (admin-created accounts)

1. Open the Keycloak admin console (`http://localhost:8180/admin` in dev) and select the **wacchat** realm.
2. **Users → Add user** — set email (used as username), first/last name, click **Create**.
3. **Credentials** tab → **Set password** → temporary password → keep **Temporary** ON → **Save**.
4. Send the user the app URL, email, and temporary password. Keycloak forces a password change on first login.

### Resetting a forgotten password

With SMTP configured, users can use the "Forgot password" link on the login screen. It asks for the Keycloak login identifier (email, or username for Google-linked accounts) — distinct from the in-app chat `username`. Without SMTP, reset manually via **Users → Credentials → Set password**.

### Revoking access

- **Block without deleting history:** Users → select user → toggle **Enabled** OFF → Save.
- **Delete entirely:** Users → select user → Delete.
- Inactive users (no activity for 14+ days by default) are also deleted automatically every Monday at 03:00 by a scheduled cleanup job, from both Keycloak and the local DB. `ADMIN_EMAIL` is exempt.

---

## Deployment

```bash
./deploy-prod.sh          # add --push to also push built images
```

Builds Docker images for all services, renders the Keycloak realm from the template, and starts the full stack (app services + Postgres + Keycloak + RabbitMQ + observability) via Docker Compose.

---

## Project structure

```
wac/
├── backend/                # dev.pioruocco.wacchat — chat, message, user, notification, file, bot, security, interceptor, common
├── api-gateway/             # Spring Cloud Gateway — single edge entrypoint, CORS, routing
├── file-service/            # Media/avatar storage on Cloudflare R2
├── notification-service/    # STOMP/WebSocket stack, RabbitMQ broker relay
├── shared-security/         # KeycloakJwtAuthenticationConverter, shared Maven library
├── rabbitmq/                # enabled_plugins mounted into the RabbitMQ container
├── frontend/                # Angular 19 SPA
├── database/schema.sql      # Reference DDL for users, chat, messages
├── keycloak/realms/         # wacchat.json.template (rendered at deploy time), custom theme under keycloak/themes/
└── documentation/           # Additional docs
```

Root-level files:

```
deploy-local.sh                          # Start local infra + api-gateway (Docker)
start-local-services.sh                  # Start backend/file-service/notification-service/frontend on the host
deploy-prod.sh                           # Full production deploy (build + run, optional --push)
docker-compose.yml                       # PostgreSQL + Keycloak + RabbitMQ
docker-compose.local.yml                 # Local overrides + api-gateway container
docker-compose.observability.yml         # Prometheus + Grafana + Loki + Tempo
docker-compose.observability.local.yml   # Local overrides
.envrc                                   # direnv: loads .env
.env                                     # Secrets (never commit — gitignored)
```

See the root `CLAUDE.md` for a deeper architectural walkthrough (service boundaries, RabbitMQ channels, session-lock design, observability wiring).

---

## Testing

```bash
cd wac/backend && ./mvnw test                                   # all tests
cd wac/backend && ./mvnw test -Dtest=ClassName                  # single test class
cd wac/frontend && npm test                                     # Karma + Jasmine
cd wac/frontend && npm test -- --include='**/foo.component.spec.ts'  # single test file
```

Each Java module (`file-service`, `notification-service`, `api-gateway`, `shared-security`) also runs its own tests via `./mvnw test` from its own directory.

---

## License

[Apache License 2.0](LICENSE)
