# ---------- build stage ----------
FROM node:24-alpine AS builder

# Actualizar paquetes del OS
RUN apk update && apk upgrade

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build


# ---------- production stage ----------
FROM node:24-alpine

# Actualizar paquetes del OS
RUN apk update && apk upgrade

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/server.js"]
