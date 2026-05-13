FROM node:20-slim

WORKDIR /app

# Copy monorepo root manifests first for layer caching
COPY package.json ./
COPY tsconfig.base.json ./

# Copy api workspace manifests
COPY apps/api/package.json ./apps/api/

RUN npm install --workspace apps/api

# Copy api source
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/

WORKDIR /app/apps/api

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
