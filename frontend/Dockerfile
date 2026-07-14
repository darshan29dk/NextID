# rAnalyzer frontend — Vite/React, built to static files and served by nginx

# ---- Build stage ----
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Vite bakes VITE_* env vars into the static bundle at build time, so this
# has to be passed as a build ARG (not a runtime env var) — see .env.example
# for what this should be set to per environment.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
