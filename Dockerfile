FROM node:20-slim AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY index.js ./

ENV NODE_ENV=production
ENV PORT=8080

RUN groupadd -r heady && useradd -r -g heady heady
RUN chown -R heady:heady /app
USER heady

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const r=http.get('http://127.0.0.1:8080/health',s=>{process.exit(s.statusCode===200?0:1)});r.on('error',()=>process.exit(1))"

EXPOSE 8080
CMD ["node", "index.js"]
