# Build Stage 
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY .npmrc ./

RUN npm install
COPY . . 

RUN npm run build

# Runner Stage 
FROM node:20-alpine AS runner
WORKDIR /app

COPY package*.json ./
COPY .npmrc ./
RUN npm install

COPY --from=builder /app/dist ./dist

# --- Environment Variables for CI/CD ---
ENV FUNCTION_NAME="event-monitoring-service"
ENV NODE_ENV="dev"
ENV MAX_CPU=1

# Database Configuration
ENV CONFIGURATION_DATABASE_URL="postgresql://postgres:postgres@10.10.80.37:5432/tcs?schema=public"
ENV DB_HOST=10.10.80.37
ENV DB_PORT=5432
ENV DB_USER=postgres
ENV DB_PASSWORD=postgres
ENV DB_NAME=tcs

# Redis Configuration (Required)
ENV REDIS_HOST=10.10.80.37
ENV REDIS_PORT=6379
ENV REDIS_PASSWORD=redis-password

# NATS Configuration (frms-coe-startup-lib)
ENV SERVER_URL=10.10.80.37:4222
ENV STARTUP_TYPE=nats
ENV PRODUCER_STREAM=config.notification
ENV CONSUMER_STREAM=config.notification
ENV STREAM_SUBJECT=config.notification
# --- Environment Variables for CI/CD Ends Here ---

EXPOSE 3002
CMD ["node", "dist/src/main.js"]