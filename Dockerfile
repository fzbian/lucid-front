# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ARG REACT_APP_API_BASE=
ENV REACT_APP_API_BASE=${REACT_APP_API_BASE}
ENV CI=false
ENV GENERATE_SOURCEMAP=false
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8082

COPY --from=deps /app/node_modules ./node_modules
COPY server ./server
COPY --from=build /app/build ./build

EXPOSE 8082
CMD ["node", "server/server.js"]
