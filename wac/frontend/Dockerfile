FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
# Stamped by deploy-prod.sh; served as /version.json and shown in the app's banner.
ARG APP_VERSION=dev
ARG APP_BUILD_TIME=
RUN printf '{"version":"%s","builtAt":"%s"}\n' "$APP_VERSION" "$APP_BUILD_TIME" > public/version.json
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist/wacchat-ui/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Not a *.conf name on purpose: conf.d/*.conf is auto-included at http level, this is only `include`d inside server/location blocks.
COPY security-headers.inc /etc/nginx/conf.d/security-headers.inc
EXPOSE 80
