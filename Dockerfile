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

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3002
CMD ["node", "dist/main.js"]