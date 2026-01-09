FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install native build tooling required for packages like better-sqlite3.
RUN apk add --no-cache python3 make g++

ENV PYTHON=/usr/bin/python3 \
    npm_config_python=/usr/bin/python3

RUN ln -sf python3 /usr/bin/python

COPY package*.json ./
RUN npm ci --omit=dev

COPY backend/ backend/
COPY protos/ protos/

EXPOSE 8080 50051
CMD ["node", "backend/index.js"]
