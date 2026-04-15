# syntax=docker/dockerfile:1
# SPDX-License-Identifier: Apache-2.0

ARG BUILD_IMAGE=node:20-bullseye
ARG RUN_IMAGE=gcr.io/distroless/nodejs20-debian11:nonroot

FROM ${BUILD_IMAGE} AS builder
LABEL stage=build
# TS -> JS stage

WORKDIR /home/app
COPY ./src ./src
COPY ./package*.json ./
COPY ./tsconfig.json ./
COPY .npmrc ./

RUN --mount=type=secret,id=GH_TOKEN,env=GH_TOKEN npm ci --ignore-scripts
RUN npm run build

FROM ${BUILD_IMAGE} AS dep-resolver
LABEL stage=pre-prod
# To filter out dev dependencies from final build

COPY package*.json ./
COPY .npmrc ./
RUN --mount=type=secret,id=GH_TOKEN,env=GH_TOKEN npm ci --omit=dev --ignore-scripts

FROM ${RUN_IMAGE} AS run-env
USER nonroot

WORKDIR /home/app
COPY --from=dep-resolver /node_modules ./node_modules
COPY --from=builder /home/app/dist ./build
COPY package.json ./

# Turn down the verbosity to default level.
ENV NPM_CONFIG_LOGLEVEL warn

# Service-Based variables (replace with secure methods at runtime)
ENV FUNCTION_NAME=event-monitoring-service
ENV NODE_ENV=production
ENV MAX_CPU=
ENV APP_PORT=3002

# Database Configuration (replace with secure methods at runtime)
ENV CONFIGURATION_DATABASE_URL=
ENV DB_HOST=
ENV DB_PORT=
ENV DB_USER=
ENV DB_PASSWORD=
ENV DB_NAME=
ENV DB_MIN_CONNECTIONS=8
ENV DB_MAX_CONNECTIONS=500

# Redis Configuration (replace with secure methods at runtime)
ENV REDIS_HOST=
ENV REDIS_PORT=6379
ENV REDIS_PASSWORD=
ENV TTL=3600
ENV REDIS_DB=0
ENV REDIS_IS_CLUSTER=false

# NATS Configuration
ENV SERVER_URL=nats://localhost:4222
ENV STARTUP_TYPE=nats
ENV PRODUCER_STREAM=config.notification.response
ENV CONSUMER_STREAM=dems.notify
ENV STREAM_SUBJECT=config.notification

# Auth
ENV TAZAMA_AUTH_URL=
ENV AUTH_PUBLIC_KEY_PATH=public-key.pem
ENV CERT_PATH_PUBLIC=public-key.pem

# Elastic APM
ENV APM_ACTIVE=true
ENV APM_SERVICE_NAME=event-monitoring-service
ENV APM_URL=http://apm-server.development.svc.cluster.local:8200/
ENV APM_SECRET_TOKEN=

# Logging
ENV LOG_LEVEL=info
ENV SIDECAR_HOST=0.0.0.0:5000
ENV CORS_POLICY=prod

# Elasticsearch Configuration
ENV ELASTIC_INDEX=logs-tazama
ENV ELASTIC_USERNAME=
ENV ELASTIC_PASSWORD=
ENV ELASTIC_SEARCH_VERSION=8.14
ENV ELASTIC_HOST=
ENV ELASTIC_FLUSH_BYTES=1000
ENV STDOUT=true
ENV ELASTIC=true

# Execute application
CMD ["build/main.js"]