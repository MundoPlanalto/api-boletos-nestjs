# ---- Build stage ----
FROM node:20-slim AS build

WORKDIR /app

# Dependências de build (se precisar compilar libs nativas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# copia código
COPY . .

# gera cliente do Prisma e build do Nest
RUN npx prisma generate
RUN npm run build

# remove devDeps e mantém node_modules só com prod + prisma client gerado
RUN npm prune --omit=dev


# ---- Runtime stage ----
FROM node:20-slim AS runtime

WORKDIR /app

# instala qpdf
RUN apt-get update && apt-get install -y --no-install-recommends \
    qpdf \
 && rm -rf /var/lib/apt/lists/*

# copia apenas o necessário do build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./

ENV NODE_ENV=production
# Railway vai injetar PORT dinamicamente; defina um default
ENV PORT=3000

# Se quiser expor localmente:
# EXPOSE 3000

# Importante: não rodar 'prisma migrate deploy' aqui se você removeu devDeps.
# Use Deploy Hook do Railway para: `npx prisma migrate deploy`
CMD ["node", "dist/main.js"]
