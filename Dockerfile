FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
ENV NODE_ENV=production
ENV PORT=8080
RUN groupadd -r heady && useradd -r -g heady heady
RUN chown -R heady:heady /app
USER heady
EXPOSE 8080
CMD ["node", "index.js"]
