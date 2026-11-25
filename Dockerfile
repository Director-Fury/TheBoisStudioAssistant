FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

EXPOSE 3000

USER node
CMD ["node", "src/app.js"]
