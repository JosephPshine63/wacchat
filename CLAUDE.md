# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project layout

```
.
├── docker-compose.yml          # Base compose (PostgreSQL :5433 + Keycloak :8180 + RabbitMQ :5672/61613/15672)
├── docker-compose.local.yml    # Local override — sets KC_HOSTNAME to http://localhost:8180, builds+runs api-gateway as a container
├── deploy-local.sh             # Preferred local startup script (sources .env, renders realm template)
├── deploy-prod.sh              # Production deploy script (builds images, pushes if --push); Keycloak runs in production `start` mode (docker-compose.local.yml overrides back to `start-dev` for local)
├── cleanup-images.sh           # Project-scoped Docker image/container cleanup (backend/frontend/file-service/api-gateway/notification-service/call-service + observability stack only — leaves postgres/keycloak/rabbitmq untouched) + git pull; replaces the old cleanup.sh which pruned the entire Docker host
├── .env.example                # Copy to .env and fill in values
├── docker-compose.observability.yml       # Prometheus + Grafana + Loki + Tempo
├── docker-compose.observability.local.yml # Local override
├── observability/              # Prometheus/Loki/Tempo configs + provisioned Grafana dashboard
└── wac/
    ├── backend/                # Spring Boot 3.4.13 API (Java 17, Maven)
    ├── api-gateway/            # Spring Cloud Gateway — single edge entrypoint (Java 17, Maven)
    ├── file-service/           # Standalone file storage microservice — Cloudflare R2 (Java 17, Maven)
    ├── notification-service/   # Standalone realtime/WebSocket microservice — STOMP over RabbitMQ (Java 17, Maven)
    ├── call-service/           # Standalone WebRTC call-signaling microservice — REST intents relayed via RabbitMQ (Java 17, Maven)
    ├── shared-security/        # Maven library module — KeycloakJwtAuthenticationConverter, consumed by backend/file-service/notification-service/call-service
    ├── rabbitmq/                # enabled_plugins (rabbitmq_management, rabbitmq_stomp), mounted into the RabbitMQ container
    ├── frontend/                # Angular 19 SPA (TypeScript, npm)
    ├── database/                # Reference schema SQL (schema.sql)
    ├── keycloak/realms/         # wacchat.json.template — rendered to wacchat.json at deploy time
    └── documentation/           # Additional docs
```

## Commands

### Initial setup

```bash
cp .env.example .env            # fill in passwords, mail credentials
cd wac/shared-security && ./mvnw install -DskipTests && cd ../..   # one-time: installs the shared-security jar to ~/.m2 so backend/file-service/notification-service/call-service resolve it
```

### Infrastructure

```bash
./deploy-local.sh               # starts PostgreSQL :5433, Keycloak :8180, RabbitMQ :5672/61613/15672, API Gateway :8081, and the observability stack (sources .env, renders realm JSON)
docker compose down             # stop containers
```

Do **not** use `docker compose up` directly — `deploy-local.sh` renders `wacchat.json` from the template first, sets the correct `KC_HOSTNAME` override for local development, builds and starts `api-gateway` as a container (`docker-compose.local.yml`, rebuilt on every run via `--build`), and also brings up `docker-compose.observability.yml` (Prometheus :9091, Grafana :3000, Loki :3100, Tempo :4318/4317/3200) on the same Docker network.

Both `deploy-local.sh` and `deploy-prod.sh` share an `ensure_keycloak_db()` bootstrap: Postgres is started alone first, then the `keycloak` database is created idempotently (connecting explicitly to the `postgres` admin database, since `-U <user>` alone defaults to a same-named DB that doesn't exist) before the rest of the stack — Keycloak included — comes up.

To clean up project-local Docker images/containers (not the shared host), run `./cleanup-images.sh` — it prompts for confirmation, removes only this project's app + observability images/containers, then does a `git pull --ff-only` at the end.

`deploy-prod.sh` accepts `--only=<service>` (backend/frontend/file-service/api-gateway/notification-service/call-service) to rebuild and restart a single app container without tearing down or rebuilding the rest of the stack (skips the infra restart and build-cache prune it otherwise does); omit it for a full deploy. Both `deploy-local.sh` and `deploy-prod.sh` also run `ensure_admin_user()`: if `ADMIN_EMAIL` is set and `ADMIN_USER_ID` is not, it idempotently creates/finds that account via the Keycloak Admin API and writes `ADMIN_USER_ID` back to `.env` — this is what activates the admin support chat (see `support` domain below); no manual bootstrap step is needed beyond setting `ADMIN_EMAIL`.

CI (`.github/workflows/ci.yml`) runs on every push/PR to `main`: `./mvnw test` for each Java module (backend excludes `WacchatApiApplicationTests`, which boots the full Spring context against Postgres/Keycloak/RabbitMQ that CI doesn't provision) plus `npm run i18n:check`, `ng test --browsers=ChromeHeadless` and a production build for the frontend. On green pushes to `main` a `deploy` job (skipped with a warning until the `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_CLIENT_SECRET` and `DEPLOY_SSH_KEY` secrets exist) joins the tailnet via Tailscale, SSHes to `gpr-server@gpr-server`, `git pull --ff-only`s `~/Applications/connecting` and runs `ci-deploy.sh <prev-sha>` there: it diffs `prev..HEAD` to pick the touched services (`wac/<service>/**`; `wac/shared-security/**` → backend, file-, notification- and call-service), redeploys each with `deploy-prod.sh --only=<service>`, health-checks them (`deploy-prod.sh` itself never fails on an unhealthy service) and on any failure `git reset --hard`s to `<prev>` and redeploys from it (schema changes from `ddl-auto: update` are not undone). A change under `wac/keycloak/themes/` additionally enables the realm's internationalization (`kcadm.sh`, idempotent) and restarts only the `keycloak-wacchat` container so the theme is reloaded (Keycloak caches themes in production mode); the workflow's `keycloak=true` dispatch runs just that step. Changes to compose files, `deploy-prod.sh`, the Keycloak realm template, RabbitMQ or observability are reported but not applied automatically — run `./deploy-prod.sh` by hand, or dispatch the workflow with `full=true`. Runs are serialized (`concurrency: deploy-production` plus a `flock` on the host).

Once the infra above is up, `./start-local-services.sh` starts backend, file-service, notification-service, call-service, and frontend in the background via `direnv exec` (so each loads `.env` through `.envrc`), logging to `logs/<name>.log`. Note: the script's own `SERVICES` array still lists an extra entry, `api-gateway` via `./mvnw spring-boot:run` on :8081 — this is stale since `deploy-local.sh` already runs api-gateway as a Docker container on the same port (added in `a2f0f82`); running it will attempt a redundant/conflicting bind on :8081.

```bash
./start-local-services.sh               # start backend, file-service, notification-service, call-service, frontend
./start-local-services.sh status        # show which are running
./start-local-services.sh stop          # stop everything it started
```

### First-run database schema

After starting the infrastructure for the first time, apply the schema:

```bash
psql -h localhost -p 5433 -U wacchat -d wacchat_db -f wac/database/schema.sql
```

### Backend

```bash
cd wac/backend
./mvnw spring-boot:run          # dev server at http://localhost:8082 (direnv auto-loads .env)
./mvnw clean package            # build fat JAR
./mvnw test                     # run all tests
./mvnw test -Dtest=ClassName    # run a single test class
```

Swagger UI: `http://localhost:8082/swagger-ui.html`

### File service

```bash
cd wac/file-service
./mvnw spring-boot:run          # dev server at http://localhost:8083
```

### Notification service

```bash
cd wac/notification-service
./mvnw spring-boot:run          # dev server at http://localhost:8084 — connects to RabbitMQ (localhost:5672 AMQP, :61613 STOMP) and backend:8082
```

### Call service

```bash
cd wac/call-service
./mvnw spring-boot:run          # dev server at http://localhost:8085 — connects to RabbitMQ (localhost:5672 AMQP) and backend:8082
```

### API Gateway

Runs as a Docker container in local dev (started by `deploy-local.sh`, defined in `docker-compose.local.yml`), not via `mvnw`:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build api-gateway   # rebuild after a code change
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f api-gateway         # tail logs
```

Dev server at `http://localhost:8081` — reaches backend/file-service/notification-service/call-service (which still run on the host via `mvnw`) through `host.docker.internal` (`BACKEND_BASE_URL`/`FILE_SERVICE_BASE_URL`/`NOTIFICATION_SERVICE_BASE_URL`/`CALL_SERVICE_BASE_URL` overridden in `docker-compose.local.yml`; `extra_hosts: host.docker.internal:host-gateway` makes this resolve on Linux). Traces/logs go to the `wacchat-tempo`/`wacchat-loki` containers by service name since api-gateway shares their Docker network.

The frontend never calls backend, file-service, notification-service, or call-service directly — it always goes through the gateway (`proxy.conf.json` in dev, `nginx.conf` in prod).

### Frontend

```bash
cd wac/frontend
npm install
npm start                       # ng serve — dev server at http://localhost:4200
npm run build                   # production build
npm test                        # Karma/Jasmine unit tests
npm test -- --include='**/foo.component.spec.ts'   # run a single test file
```

To regenerate the Angular API client after a backend API change (backend must be running):

```bash
curl http://localhost:8082/v3/api-docs -o wac/frontend/src/openapi/openapi.json
cd wac/frontend && npm run api-gen
```

### Frontend i18n (it / en / fr / de / es)

UI text lives in runtime JSON dictionaries, not in templates: Transloco (`@jsverse/transloco`) loads `wac/frontend/public/i18n/<lang>.json` on demand, so switching language never reloads the page (a reload would drop the STOMP connection and any in-progress WebRTC call — the reason `@angular/localize` build-per-language was rejected). **Italian (`it.json`) is the only hand-edited source**; `en/fr/de/es.json` are generated with DeepL and committed.

```bash
cd wac/frontend
npm run i18n:translate                # translate only new/changed keys (needs DEEPL_API_KEY in env or repo-root .env)
npm run i18n:translate -- --dry-run   # show what would be sent, no API call
npm run i18n:translate -- --lang=fr   # one language; add --force to redo every key
npm run i18n:check                    # offline: key parity, {{placeholder}}/HTML-tag parity, keys used in code exist (runs in CI)
```

`scripts/i18n.mjs` tracks each translated key by a hash of its Italian source in `public/i18n/.i18n-lock.json`, so re-running only sends what changed; hand-fixing a generated value in `en/fr/de/es.json` sticks until the Italian source of that key changes. DeepL Free keys end in `:fx` (routed to `api-free.deepl.com`); informal register (`prefer_less`) is requested for fr/de/es, and `{{ placeholders }}`, `<strong>` tags and product names (`WacChat`, `Arno`) are protected. Only UI strings are sent — never user content. To add text: add the key to `it.json`, use `{{ 'ns.key' | transloco }}` in templates or `LanguageService.translate('ns.key', {…})` in TS, then run `i18n:translate`. Avoid ICU plurals (DeepL mangles them) — use separate keys.

`utils/i18n/`: `LanguageService` (signal `lang`, `setLanguage()`, persists to `localStorage.appLang`, sets `<html lang>`, exposes `intlLocale`; detection order is saved choice → `navigator.languages` → `it`), `LocalDatePipe` (`| localDate:'time'|'dateShort'|…`, impure so it re-renders on language change — use it instead of Angular's `date` pipe, which is locale-fixed), and `TranslocoHttpLoader` (uses `HttpBackend` directly so it skips the Keycloak interceptor: it runs in an app initializer before Keycloak is up). The language picker is in the settings dialog. **Backend text** follows the same Italian-source/DeepL flow: `wac/backend/src/main/resources/messages.properties` (Italian, hand-edited, one key per line, `\n` for newlines, `{0}` placeholders) plus generated `messages_en/fr/de/es.properties`; `npm run i18n:translate -- --bundle=backend` limits a run to it (lockfile: `wac/backend/.i18n-lock.json`). `common/i18n`: `Messages.get(key, locale, args…)` (plain `{n}` replacement, not `MessageFormat`, so apostrophes need no doubling), `SupportedLocales`, and an `AcceptHeaderLocaleResolver`. The frontend's `keycloakHttpInterceptor` sends `Accept-Language: <UI lang>` on every request; `UserSynchronizerFilter` copies it into `users.locale` (via `UserSynchronizer`) so out-of-request code — welcome mail, Arno/admin welcome, Arno's Gemini reply language, push text (`NotificationService`, and `PushInternalController` for the `call.invite` template that notification-service asks for, since it has no user DB) — can use `UserLocales.of(userId)`. Call summaries are stored by call-service as language-neutral tokens (`i18n:call.summary.ended|03:12`, only `call.summary.*` keys honoured) and rendered per viewer by `LanguageService.renderContent` / the `messageText` pipe (and by `SystemMessageTokens` for push bodies). **Keycloak login theme** (`wac/keycloak/themes/wacchat/login/messages/messages_<lang>.properties`, bundle `--bundle=keycloak`; Italian is the source, and Keycloak runs messages through MessageFormat so files use `''` for an apostrophe — the script converts to/from a plain `'`): the `.ftl` templates link `css/login.css?v=N` — Cloudflare caches theme resources for 30 days under a URL that doesn't change per deploy, so bump `N` in every `.ftl` whenever `login.css` changes — and use `${msg("wac…")}` for the custom texts; `wac-locale.ftl` (included by every page) renders the `DE EN ES FR IT` language links, and standard texts (login, password, errors) come from Keycloak's own translations. `keycloak.init({locale})` sends the app's language as `ui_locales`. The realm template has `internationalizationEnabled: true` with the five locales, but `--import-realm` only applies at first creation — on an existing realm (prod) the CD job's Keycloak step (`ci-deploy.sh`, triggered by a theme change or the `keycloak=true` dispatch) enables it via `kcadm.sh`; by hand it is *Realm settings → Localization → Internationalization* with those locales. **Not yet translated:** backend English-only exception messages and the Keycloak account console.

## Architecture

### API Gateway

`wac/api-gateway` (Spring Cloud Gateway, WebFlux/Netty — reactive, not the servlet stack the other services use) is the single edge entrypoint the frontend talks to. Routes (YAML-driven, `wac/api-gateway/src/main/resources/application.yml`):

| Predicate | Target |
|-----------|--------|
| `/api/v1/calls/**` | `wac/call-service` (`order: 0`, evaluated before the catch-all `/api/**` route below) |
| `/api/**` | `wac/backend` |
| `/ws/**` | `wac/notification-service` (WebSocket upgrade, proxied transparently) |
| `/files/**` | `wac/file-service`, rewritten to `/api/v1/files/**` |

CORS is centralized at the gateway via `spring.cloud.gateway.globalcors` (allowed origins `http://localhost:4200` and `https://wacchat.win`); the backend no longer sets `Access-Control-Allow-*` headers itself. The one exception is notification-service's own `WebSocketConfig` SockJS origin allowlist (`registry.addEndpoint("/ws").setAllowedOrigins(...)`), which is a separate, independent handshake-level check kept as defense-in-depth — the gateway forwards the browser's `Origin` header unmodified on `/ws/**`. The gateway does not inject the file-service/backend internal API keys; each service's own `InternalAuthFilter` still gates its internal endpoints regardless of path.

### Realtime notification service

`wac/notification-service` is a standalone module extracted from the backend that owns the entire STOMP/WebSocket stack — the backend has no `/ws` endpoint anymore. It uses `enableStompBrokerRelay` (not the in-memory `SimpleBroker`) pointed at RabbitMQ's STOMP plugin (port 61613, `rabbitmq_stomp`), so subscription state lives in the broker instead of per-instance JVM memory and multiple notification-service instances can share WebSocket push delivery without missing messages.

Two independent RabbitMQ channels are involved:
- **STOMP (61613)** — the broker relay itself, used by Spring's WS layer for the actual client subscriptions/fan-out (`/topic`, `/queue` prefixes; `/user/**` destinations are translated internally to per-session `/queue/...` names before being relayed).
- **AMQP (5672)** — a separate application-level event bus. Backend's `NotificationService.sendNotification(userId, notification)` no longer calls `SimpMessagingTemplate` directly (it can't — the WS layer lives in another process); instead it publishes a `NotificationEvent(userId, notification)` to the `wacchat.notifications` exchange (routing key `notification`, queue `wacchat.notifications.queue` — names configurable under `application.notification.*`, identical in both modules). notification-service's `NotificationListener` (`@RabbitListener`) consumes it and calls `convertAndSendToUser(userId, "/queue/chat", notification)`.

`Notification`, `NotificationType`, `NotificationEvent`, and `MessageType` are duplicated verbatim (identical package + class name) in both `wac/backend` and `wac/notification-service` — these are message-queue DTOs, not extracted into `shared-security`, because matching FQCNs let `Jackson2JsonMessageConverter`'s default `__TypeId__` header resolve to the same class on both ends without extra `DefaultClassMapper` config; a shared library would still need the FQCN to match, so the duplication is deliberate here rather than something a shared module would remove. `KeycloakJwtAuthenticationConverter`, by contrast, had no such constraint and now lives in `wac/shared-security` (Maven module, installed to the local repo and consumed as a regular dependency by backend/file-service/notification-service/call-service — see that module's own `pom.xml`). Docker builds for those four services use a multi-stage `Dockerfile` (`FROM ... AS shared` stage building/installing `shared-security` first) with the build context set to `wac/` in `deploy-prod.sh`, not each service's own directory, so the shared module's sources are reachable at build time.

The single-session lock (`AuthChannelInterceptor`, moved into notification-service) can no longer read `SessionGuard`/`UserRepository` directly (that's backend-only DB logic), so on STOMP `CONNECT` it makes a synchronous call via `SessionValidationClient` (WebClient + Resilience4j `sessionValidation` circuit breaker/retry instance) to backend's internal `POST /api/v1/internal/sessions/validate` (guarded by `InternalAuthFilter`, shared-secret header `X-Internal-Api-Key` / `BACKEND_INTERNAL_API_KEY`). This call **fails open** (treats backend-down as "not conflicting") — the session lock is a UX nicety, not a security boundary, and a lost WS connection is worse than a rare double-session.

### Call service

`wac/call-service` (port 8085) is a standalone Spring Boot module that owns WebRTC call signaling (offer/answer SDP, ICE candidates, invite/answer/end) for audio/video calls — 1:1 calls between two users who already have an `ACCEPTED` chat, and group calls inside a `GROUP` chat. It holds no database — all call state lives in an in-memory `ConcurrentHashMap` (`CallSessionStore`, keyed by chatId, so at most one active call per chat); a restart drops in-flight calls (accepted trade-off, no persistence in v1).

**Mesh topology, one model for both cases.** A `CallSession` tracks every participant individually (`ParticipantState`: RINGING/JOINED/DECLINED/LEFT/MISSED, with atomic `markJoinedIfRinging`/`markMissedIfRingingPast` transitions guarding the answer-vs-timeout race), so a group call survives one participant leaving/declining/timing out; a 1:1 call is just the 2-participant case. There is no SFU/media server: the caller opens a direct `RTCPeerConnection` to each invitee up front (`invite` takes a list of `InviteeOffer(peerId, sdpOffer)`, one SDP offer per invitee, capped by `CALL_MAX_PARTICIPANTS`, default 8). When someone answers a group call, call-service sends `PARTICIPANT_JOINED` to every other already-joined non-caller participant, who then proactively open a new peer connection toward the joiner using `POST /{chatId}/peer-offer|peer-answer` (relayed as `PEER_OFFER`/`PEER_ANSWER`). The call ends (and the session is removed) once ≤1 active participant remains.

Signaling deliberately does **not** open a second frontend WebSocket connection. The frontend sends REST intents to call-service (`POST /api/v1/calls/{chatId}/invite|answer|ice-candidate|peer-offer|peer-answer|end`, gated by the same JWT resource-server setup as the backend — real auth, unlike notification-service's `permitAll()` since STOMP `CONNECT` handles auth there instead); call-service publishes a `CallSignalEvent(toUserId, CallSignal)` to a dedicated RabbitMQ exchange/queue (`wacchat.calls`/`wacchat.calls.queue`, same 1:1 pattern as `wacchat.notifications`), and notification-service's second `@RabbitListener` (`call.CallSignalListener`) relays it via `convertAndSendToUser(toUserId, "/queue/call", signal)` onto the client's *existing* STOMP connection — the frontend just adds a second `subscribe('/user/queue/call', ...)` inside the same `onConnect` callback that already subscribes to `/queue/chat`. `CallSignal`/`CallSignalEvent`/`CallSignalType` are duplicated verbatim (identical FQCN) between `call-service` and `notification-service`, for the same Jackson `__TypeId__` reason as `Notification`/`NotificationEvent`.

Before accepting an invite, call-service validates it through backend's `ChatValidationController` (gated by `InternalAuthFilter` like the other internal endpoints), called through `ChatValidationClient` (WebClient + Resilience4j): a single-invitee call hits `POST /api/v1/internal/chats/validate`, which checks by `chatId` (not just the user pair) that it's a `DIRECT` chat between exactly those two users with status `ACCEPTED` — a GROUP chat always fails closed here; a multi-invitee call hits `POST /api/v1/internal/chats/validate-group`, where the only boundary is that the caller and every invitee are current `ChatMember`s of that `GROUP` chat (groups have no accept/block notion). Unlike `SessionValidationClient`'s fail-open session lock, `ChatValidationClient`'s fallback **fails closed** (denies the call) if the backend doesn't respond — this check is a real security boundary (don't let someone call a non-accepted or blocking contact), not a UX nicety, so backend-down must not silently let a call through.

Unanswered calls time out server-side: `CallService.sweepRingTimeouts()` (`@Scheduled(fixedDelay = 5000)`) marks any session still `RINGING` past `application.call.ring-timeout-seconds` (default 45s) as MISSED, notifies both peers, and leaves a system chat message. At call end (hangup, reject, or timeout), call-service calls another new backend endpoint, `POST /api/v1/internal/messages/system` (`InternalSystemMessageController`, reusing the existing `SystemMessageSender.saveSystemMessage(...)` — previously only used by `BotService`) to leave a "Chiamata persa" / "Chiamata terminata - durata mm:ss" message in the chat history; this call is best-effort (logged, not retried/blocking) since it's a history enrichment, not part of the call itself.

STUN-only for v1 (public `stun:stun.l.google.com:19302`); no TURN/coturn relay yet (deferred — symmetric NATs/corporate networks may fail to connect until it's added). Frontend: `utils/call/call-api.service.ts` (hand-written `HttpClient` calls — not `ng-openapi-gen` generated, since that pipeline only covers the backend's own OpenAPI spec; same precedent as `utils/username/username.service.ts`) and `utils/webrtc/webrtc-call.service.ts` (`RTCPeerConnection`/`getUserMedia` wrapper) back the call buttons in the chat header and the `components/call` overlay (incoming-call banner, in-call audio/video UI).

### Observability

Backend, api-gateway, file-service, notification-service, and call-service all export traces via OpenTelemetry/Micrometer Tracing (OTLP HTTP) to Tempo, logs via a direct Logback→Loki appender (`logback-spring.xml` in each service, correlated by trace/span id), and metrics via Micrometer/Actuator scraped by Prometheus. Grafana (`http://localhost:3000`, admin/admin unless overridden) has a provisioned dashboard (`observability/grafana/dashboards/wacchat-overview.json`: request rate, p95 latency, error rate, JVM heap per service) plus Prometheus/Loki/Tempo datasources auto-provisioned. `WebClientConfig` in the backend builds `FileServiceClient`'s `WebClient` off the autoconfigured `WebClient.Builder` specifically so trace context propagates from backend → file-service calls (same pattern in notification-service's `WebClientConfig`/`SessionValidationClient` and call-service's `WebClientConfig`/`ChatValidationClient`+`InternalMessageClient`, all for calls to backend). Locally, services (running on the host) reach Tempo/Loki via `localhost`; `deploy-prod.sh` overrides `OTLP_TRACING_ENDPOINT`/`LOKI_URL` to container DNS names since the services run in Docker there.

### Backend domain structure

Package root: `dev.pioruocco.wacchat`. Each domain follows:

```
<domain>/
  <Entity>.java
  <Entity>Repository.java
  <Entity>Service.java
  <Entity>Controller.java
  <Entity>Mapper.java        # manual mapping — no MapStruct
  <Entity>Request.java / <Entity>Response.java
```

Domains: `chat`, `message`, `user`, `moderation`, `notification`, `push`, `file`, `bot`, `support`, `security`, `interceptor`, `common`. (The `ws` domain — WebSocket/STOMP config and `AuthChannelInterceptor` — moved out to `wac/notification-service`; see Architecture.)

- **Admin support chat** (`support` domain) — `AdminChatService` auto-creates a direct chat between every new user and a real Keycloak-issued admin account (`application.admin.user-id` / `ADMIN_USER_ID`, distinct from the fixed-UUID `Arno` bot: no AI reply logic, the admin answers manually) at the same username-setup trigger point as `BotService`. `SupportController`'s `POST /api/v1/support/report-bug-chat` (backs the frontend's "Segnala un bug" button) is a lazy find-or-create fallback for accounts that onboarded before this feature existed — idempotent, returns 404 if `ADMIN_USER_ID` is unset or the caller is the admin account itself.

All JPA entities extend `common/BaseAuditingEntity`, which auto-populates `createdDate` and `lastModifiedDate` via Spring Data JPA auditing. `chat` IDs are UUID strings; `messages` uses `msg_seq` (a PostgreSQL sequence starting at 1).

### Key cross-cutting concerns

- **User synchronization** — `UserSynchronizerFilter` runs on every authenticated request and upserts Keycloak JWT claims (`sub`, `email`, `name`) into the local `users` table via `UserSynchronizer`. No separate registration flow.
- **Auth** — Spring OAuth2 Resource Server validates JWTs from Keycloak. `KeycloakJwtAuthenticationConverter` extracts realm roles from `realm_access.roles`.
- **WebSocket** — STOMP over SockJS, entirely in `wac/notification-service` (see Architecture). Endpoint `/ws`, app prefix `/app`, user-destination prefix `/user`. STOMP broker relay to RabbitMQ (not an in-memory broker), registered only for the `/topic` and `/queue` destination prefixes (`WebSocketConfig`'s `enableStompBrokerRelay("/topic", "/queue")`) — any destination that doesn't resolve under one of those two prefixes is silently dropped by the relay (no error), so every user-destination send/subscribe must resolve to `/queue/**` or `/topic/**` after Spring's `/user/` translation. `@Order(HIGHEST_PRECEDENCE + 99)` on `WebSocketConfig` lets Spring Security handle the WS handshake before STOMP processing. `AuthChannelInterceptor` validates the Bearer JWT on every STOMP `CONNECT` frame (via the JwtDecoder/KeycloakJwtAuthenticationConverter beans, not the HTTP filter chain — see `SecurityConfig`) and calls backend for the single-session-lock check.

  | Direction | Destination |
  |-----------|-------------|
  | Send message | `/app/chat` |
  | Receive notifications | `/user/queue/chat` |
  | Typing indicator ping | `/app/chat.typing` (fire-and-forget, relayed by notification-service's `TypingController` as a `TYPING_START`/`TYPING_STOP` notification — not persisted, no chat-membership check) |

  The client subscribes to the bare `/user/queue/chat` — **not** `/user/{userId}/queue/chat`. Spring's `DefaultUserDestinationResolver` scopes any `/user/**` SUBSCRIBE to the subscribing session's own `Principal` automatically; embedding the userId in the subscribe path breaks its destination resolution (its SUBSCRIBE-side parsing only strips the literal `/user` prefix, unlike the SEND side which explicitly parses out a `/user/{id}/...` pattern), so the physical broker queue it computes for the subscription never matches the one `convertAndSendToUser(userId, "/queue/chat", ...)` computes on the send side, and messages are silently never delivered live. Since Spring itself guarantees a client can only ever land on its own `/user/**` queue, `AuthChannelInterceptor` no longer needs (or does) a manual userId-in-destination check on SUBSCRIBE.
- **File uploads** — both message media (images, under `messages/{userId}/...`) and user avatars (under `avatars/{userId}/...`) are stored in a public-read Cloudflare R2 bucket by `wac/file-service` (standalone module, `R2StorageService`, AWS SDK v2 S3-compatible client — see its own `R2_*` env vars). Backend's `file` domain now only holds the client side: `FileServiceClient` (`WebClient`, guarded by Resilience4j circuit breaker + retry, config under `application.file-service.*` / `resilience4j.*.instances.fileService`) and `FileUtils`. Max multipart size 50 MB. `Message.mediaFilePath` holds a public R2 URL; `MessageMapper`/`Notification` resolve it via `FileUtils.resolveMedia`, which also still reads pre-migration messages whose `mediaFilePath` is a legacy local disk path (returned as base64) for backward compatibility.
- **Flyway** — present in deps but `flyway.enabled: false`; schema is applied manually from `database/schema.sql`. JPA `ddl-auto: update` handles incremental DDL in dev.
- **Scheduled cleanup** — `UserCleanupService` runs every Monday at 03:00 AM; deletes inactive users (>14 days, configurable) from both Keycloak and the local DB. The `ADMIN_EMAIL` / `application.cleanup.protected-email` account is never deleted.
- **Mail** — Resend SMTP (`smtp.resend.com:465`). Credentials via `MAIL_USERNAME` / `MAIL_PASSWORD` env vars.
- **Web Push notifications** — `push` domain (backend), VAPID-based via `nl.martijndwars.webpush`. `PushConfig` always builds a real `webpush.PushService` bean (possibly key-less); "disabled" is instead exposed through `PushService#isEnabled()` checking the `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` `@Value`s directly (mirrors `BotService.isEnabled()`), since a `@Bean` method returning null isn't a reliable non-Optional dependency signal. `NotificationService.sendNotification` fires a push (via `PushDispatcher`, `@Async("pushExecutor")`, self-invocation-safe) for a fixed `PUSH_ELIGIBLE_TYPES` subset (MESSAGE/IMAGE/VIDEO/AUDIO/CHAT_REQUEST/GROUP_ADDED — status-only types like SEEN or reactions are foreground-UI enrichments, not worth an OS-level push) alongside the existing RabbitMQ notification publish; call-service also triggers one via `PushInternalController` (`POST /api/v1/internal/push/send`, `InternalAuthFilter`-gated) for incoming-call INVITEs, threading the caller's display name through `CallSignal`. `PushService.sendPush` fans out to every `PushSubscription` row the user has (one per browser/device) and prunes a subscription on a 404/410 response. Subscriptions are managed by `PushSubscriptionController` (`POST`/`DELETE /api/v1/users/me/push-subscriptions`, upsert-by-endpoint so a shared device re-subscribing under a different user reassigns rather than duplicates) and purged on account cleanup by `UserCleanupService`. The VAPID public key is served at `GET /api/v1/push/vapid-public-key` rather than baked into `environment.ts`, since backend's runtime env and the frontend's build-time bundle are independently deployed. Frontend: a hand-written `public/sw.js` service worker (not `@angular/service-worker`, served at site root via the Angular build's static-asset globbing for site-wide `PushManager` scope) plus `public/manifest.webmanifest` (installable-PWA support, including iOS) and `utils/push/push-subscription.service.ts`, which `MainComponent` calls to register the worker and subscribe on login (mirrors desktop notifications' unsubscribe-on-logout pattern).
- **Arno AI chatbot** — `bot` domain (backend). A fixed system user (`BotConstants.ARNO_USER_ID`, a hardcoded UUID never issued by Keycloak) that every new user gets an auto-created chat with (`BotService.createChatWithWelcomeMessage`, called synchronously right after username-setup). Replies are generated by Gemini (`GeminiClient`, `application.bot.gemini.api-key` — bot is disabled entirely when unset) off the request thread via `@Async("botReplyExecutor")` so a human's `POST /api/v1/messages` never blocks on the Gemini call; conversation context is the last 20 text messages in the chat. Replies are persisted through `SystemMessageSender`, the same path other system-authored messages use.
- **Concurrent-session limit** — `SessionGuard` (`user` domain) tracks each browser tab's `X-Tab-Id` header as an `ActiveSession` (tabId + its own last-seen) inside `User.activeSessions` (`@ElementCollection`, table `user_active_sessions`), refreshed on every request inside `UserSynchronizer.synchronizeWithIdp()` (called from `UserSynchronizerFilter`). Up to `application.session.max-active-sessions` (`SESSION_MAX_ACTIVE`, default 3) distinct tabs/devices can be active at once; a new tab is only rejected once that many other tabs are still "fresh" (`lastSeen` within `application.session.stale-after-seconds`, default 120s, refreshed by a frontend heartbeat every 60s) — stale entries are evicted automatically on the next sync, freeing a slot. Conflicts throw `SessionConflictException` → HTTP 409 `SESSION_CONFLICT`. Explicit logout releases just that one tab's slot via a dedicated endpoint on `UserController` (`DELETE /api/v1/users/me/session`). `SessionValidationController` (`/api/v1/internal/sessions/validate`, gated by `InternalAuthFilter`) exposes the same `SessionGuard.isConflicting` check over REST for notification-service's STOMP `CONNECT` handler, which can no longer read the DB in-process. The legacy single-slot `users.active_session_id` column is no longer used but is left in place (schema migrations in this project only ever add, never drop).

### Frontend

- **Single-route SPA** — `app.routes.ts` defines one route (`''` → `MainComponent`). `pages/main` owns the STOMP connection and top-level layout; sub-components are `components/chat-list`, `components/username-setup`, `components/avatar-upload`, `components/user-card`, `components/session-blocked`, `components/call` (incoming-call banner + in-call audio/video UI, see Architecture's Call service section) with its helpers `components/call-tile` and `components/call-invitee-picker`, plus group-chat UI in `components/group-create` and `components/group-members`, and `components/forward-picker`/`components/message-actions-menu`/`components/reply-preview-bar` for message actions. Call-signal handling (including the mesh `PARTICIPANT_JOINED`/`PEER_OFFER` bootstrap) lives in `pages/main/main.component.ts`.
- Services under `src/app/services/` are **fully auto-generated** from `src/openapi/openapi.json` via `ng-openapi-gen`. Never hand-edit; run `npm run api-gen` after any backend API change. Exceptions: `utils/username/username.service.ts` and `utils/call/call-api.service.ts` are hand-written and call the backend/call-service REST endpoints directly (`/api/v1/users/*` and `/api/v1/calls/{chatId}/*` respectively) — neither is generated, since `ng-openapi-gen` only covers the backend's own `/v3/api-docs` spec. Avatar upload (`components/avatar-upload`) and the contact profile view (`components/user-card`) use the generated `UserService` instead.
- `components/username-setup` is a modal shown on first login when the user has no username. It calls `UsernameService` to validate uniqueness in real time and to set the username before granting access to the main chat UI.
- **Session lock UI** — `SessionGuardService` (`utils/session/`) holds a `blocked` signal, flipped by `KeycloakHttpInterceptor` when it sees an HTTP 409 with `error.code === 'SESSION_CONFLICT'` (no WebSocket involved). `components/session-blocked` renders a blocking overlay while `blocked()` is true, offering Retry (re-checks `/api/v1/users/me`) or Logout.
- **Desktop notifications** — `utils/notifications/browser-notification.service.ts` wraps the native `Notification` Web API; `MainComponent` requests permission on init and fires a notification (with click-to-open-chat) when a message/image arrives for a chat that isn't currently open/focused.
- `KeycloakService` (`src/app/utils/keycloak/keycloak.service.ts`) wraps `keycloak-js`; Keycloak URL is read from `environment.keycloakUrl` (set per environment file — not hardcoded in the service). Realm and client ID (`wacchat` / `wacchat-app`) are set there.
- `KeycloakHttpInterceptor` (`src/app/utils/http/`) attaches the Bearer token to every outgoing HTTP request.
- Real-time messaging via SockJS + STOMP; connection established in `MainComponent`. Incoming WebSocket frames are typed as `Notification` objects (backend `notification/Notification.java`) with a `NotificationType` discriminator.
- UI stack: Bootstrap 5, Font Awesome 6, Quill (rich-text editor), `@ctrl/ngx-emoji-mart`, Transloco (i18n, see *Frontend i18n* above).
- Environments: `src/environments/environment.ts` (dev) and `environment.prod.ts` (prod) set `keycloakUrl`, `appUrl`, and `apiRootUrl`.

### Data model

Core tables: `users`, `chat`, `messages` (`state`: SENT/SEEN; `type`: TEXT/IMAGE/AUDIO/VIDEO), plus `chat_members`, `blocked_users`, `user_reports`, `message_reactions`, `message_stars`, `user_active_sessions`, `push_subscriptions` (all in `database/schema.sql`; the later ones are `CREATE TABLE IF NOT EXISTS` blocks to apply manually).

`chat` holds two shapes discriminated by `Chat.type` (`ChatType`: `DIRECT`/`GROUP`) that never overlap: a `DIRECT` chat is one row per user pair using the two-column `sender`/`recipient` pattern (`senderFavorite`/`recipientFavorite`/`senderArchived`/`recipientArchived`, plus `ChatStatus` PENDING/ACCEPTED and a pending-message cap via `ChatConstants.MAX_PENDING_MESSAGES`); a `GROUP` chat has `sender`/`recipient` null, uses `name`/`avatarUrl`/`createdBy`, and keeps per-member favorite/archived/read-cursor state in `chat_members` (`ChatMember`, with `GroupMemberRole`) instead — DIRECT chats never get `chat_members` rows. Groups are always ACCEPTED, capped at 50 members (`GroupChatService.MAX_GROUP_MEMBERS`), and blocking (`moderation` domain, `UserBlockedException` from `ChatService`) only applies to DIRECT chats. User IDs are Keycloak `sub` UUIDs (strings), not auto-generated PKs. `users` also stores `username` (unique, 3–20 chars, pattern `^[a-z0-9_-]+$`), `last_seen` (timestamp), and `avatar_url` (public R2 object URL); all three are nullable for users who haven't completed onboarding / set a photo.

## Configuration

`wac/backend/src/main/resources/application.yml` — env vars override defaults:

| Env var | Default |
|---------|---------|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5433/wacchat_db` |
| `SPRING_DATASOURCE_USERNAME` | `admin` |
| `SPRING_DATASOURCE_PASSWORD` | `admin` |
| `KEYCLOAK_ISSUER_URI` | `http://localhost:8180/realms/wacchat` |
| `KEYCLOAK_ADMIN_URL` | `http://keycloak-wacchat:8080` (`.envrc` overrides to `http://localhost:8180` for local dev) |
| `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD` | `admin` / `admin` |
| `MAIL_USERNAME` / `MAIL_PASSWORD` / `MAIL_FROM` | (empty — mail disabled) |
| `ADMIN_EMAIL` | (empty — cleanup protects no account; also the account `ensure_admin_user()` seeds in Keycloak on deploy) |
| `ADMIN_USER_ID` | (empty — admin support chat disabled; auto-written to `.env` by `deploy-local.sh`/`deploy-prod.sh` once the admin account exists) |
| `FILE_SERVICE_BASE_URL` | `http://localhost:8083` |
| `FILE_SERVICE_INTERNAL_API_KEY` | (empty) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | (empty — Web Push disabled) |
| `RABBITMQ_HOST` / `RABBITMQ_PORT` | `localhost` / `5672` |
| `RABBITMQ_USER` / `RABBITMQ_PASSWORD` | `wacchat` / `wacchat` |
| `BACKEND_INTERNAL_API_KEY` | (empty — internal session-validation/chat-validation/system-message endpoints reject all calls until set; shared by notification-service and call-service) |
| `OTLP_TRACING_ENDPOINT` | `http://localhost:4318/v1/traces` |
| `LOKI_URL` | `http://localhost:3100/loki/api/v1/push` |
| `TRACING_SAMPLING_PROBABILITY` | `1.0` |

`OTLP_TRACING_ENDPOINT`, `LOKI_URL`, and `TRACING_SAMPLING_PROBABILITY` are shared by backend, api-gateway, file-service, notification-service, and call-service (same env vars, same defaults, in each module's `application.yml`). `RABBITMQ_*` are shared by backend, notification-service, and call-service.

`wac/file-service/src/main/resources/application.yml` — `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_BASE_URL` (empty — avatar/media upload disabled) and `FILE_SERVICE_INTERNAL_API_KEY` (must match the value backend uses to call it).

`wac/notification-service/src/main/resources/application.yml` — `RABBITMQ_HOST`/`RABBITMQ_PORT`/`RABBITMQ_USER`/`RABBITMQ_PASSWORD` (same defaults as backend), `RABBITMQ_STOMP_PORT` (default `61613`, the broker-relay port — distinct from the AMQP port), `KEYCLOAK_ISSUER_URI` (same default as backend, needed for its own `JwtDecoder`), `BACKEND_BASE_URL` (default `http://localhost:8082`) and `BACKEND_INTERNAL_API_KEY` (must match backend's value) for the session-validation call.

`wac/call-service/src/main/resources/application.yml` — `RABBITMQ_HOST`/`RABBITMQ_PORT` (same defaults as backend), `RABBITMQ_CALL_USER`/`RABBITMQ_CALL_PASSWORD` (falls back to `RABBITMQ_USER`/`RABBITMQ_PASSWORD` if unset), `KEYCLOAK_ISSUER_URI` (same default as backend, needed for its own JWT resource-server config), `BACKEND_BASE_URL` (default `http://localhost:8082`) and `BACKEND_INTERNAL_API_KEY` (must match backend's value) for `ChatValidationClient`/`InternalMessageClient`, `CALL_RING_TIMEOUT_SECONDS` (default `45`), and `CALL_MAX_PARTICIPANTS` (default `8`, group-call size cap).

`wac/api-gateway/src/main/resources/application.yml` — `BACKEND_BASE_URL` (default `http://localhost:8082`), `FILE_SERVICE_BASE_URL` (default `http://localhost:8083`), `NOTIFICATION_SERVICE_BASE_URL` (default `http://localhost:8084`), and `CALL_SERVICE_BASE_URL` (default `http://localhost:8085`).

`wac/keycloak/realms/wacchat.json` is **generated** from `wacchat.json.template` by `deploy-local.sh` and `deploy-prod.sh` via `envsubst`. Never commit the rendered `.json` file; edit the `.json.template` instead.

`wac/keycloak/themes/wacchat/` is a custom Keycloak theme (`loginTheme`/`accountTheme: wacchat` in the realm template) — FreeMarker templates (`login.ftl`, `register.ftl`, `login-reset-password.ftl`, `login-update-password.ftl`, etc.) under `login/` give the login/register/password-reset flows the WacChat dark glassmorphism look instead of Keycloak's default theme. Note: the "forgot password" flow asks for the Keycloak login identifier (email), which is distinct from the in-app chat `username` stored in the `users` table. Google social login was removed (`e3ce567`) — no identity providers are configured in the realm template.

CORS is enforced at `wac/api-gateway` (`spring.cloud.gateway.globalcors`), not in the backend. Allowed origins everywhere (gateway CORS + `WebSocketConfig`'s SockJS handshake check): `http://localhost:4200` and `https://wacchat.win`.
