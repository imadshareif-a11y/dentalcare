# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

WORKDIR /app

# تثبيت الاعتماديات أولًا لتسريع الـ cache
COPY dentalcare-frontend/package.json dentalcare-frontend/package-lock.json ./dentalcare-frontend/
COPY dentalcare-backend/package.json dentalcare-backend/package-lock.json ./dentalcare-backend/
RUN npm --prefix dentalcare-frontend ci \
 && npm --prefix dentalcare-backend ci --omit=dev

COPY schema.sql ./schema.sql
COPY package.json ./package.json
COPY dentalcare-frontend ./dentalcare-frontend
COPY dentalcare-backend ./dentalcare-backend

ENV VITE_API_BASE=/api
RUN npm --prefix dentalcare-frontend run build

ENV NODE_ENV=production
ENV SERVE_FRONTEND=1
WORKDIR /app/dentalcare-backend
EXPOSE 5000
CMD ["node", "server/app.js"]
