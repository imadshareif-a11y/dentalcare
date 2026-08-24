# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

WORKDIR /app

# تثبيت الاعتماديات أولًا لتسريع الـ cache
COPY dentalcare-frontend/package.json dentalcare-frontend/package-lock.json ./dentalcare-frontend/
COPY dentalcare-backend/package.json dentalcare-backend/package-lock.json ./dentalcare-backend/
RUN npm --prefix dentalcare-frontend ci \
 && npm --prefix dentalcare-backend ci --omit=dev

# CACHEBUST يفرض إعادة نسخ الكود وبناء الواجهة من الصفر عند كل نشر كامل
ARG CACHEBUST=20260824-1715
COPY schema.sql ./schema.sql
COPY package.json ./package.json
COPY dentalcare-frontend ./dentalcare-frontend
COPY dentalcare-backend ./dentalcare-backend

ENV VITE_API_BASE=/api
RUN npm --prefix dentalcare-frontend run build \
 && node -e "require('fs').writeFileSync('dentalcare-backend/BUILD_META.json', JSON.stringify({ builtAt: new Date().toISOString(), cachebust: process.env.CACHEBUST || '20260824-1645' }))"

ENV NODE_ENV=production
ENV SERVE_FRONTEND=1
WORKDIR /app/dentalcare-backend
EXPOSE 5000
# ترحيل القاعدة ثم تشغيل الـ API + الواجهة من نفس الصورة
CMD ["npm", "run", "start:prod"]
