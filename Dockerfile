FROM node:24-bookworm-slim AS build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DEMO_MODE=false DATA_DIR=/data
COPY backend/*.mjs ./backend/
COPY --from=build /app/frontend/dist ./frontend/dist
RUN mkdir -p /data
EXPOSE 3001
CMD ["node", "backend/server.mjs"]
