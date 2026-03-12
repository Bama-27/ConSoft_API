FROM node:20-alpine


WORKDIR /app


# Copiar dependecias
COPY package.json package-lock.json* pnpm-lock.yaml* ./

RUN npm install --legacy-peer-deps

# Copiar el resto del proyecto
COPY . .

# Compilar typescript
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/server.js"]
