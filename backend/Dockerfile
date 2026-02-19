FROM node:20-bookworm-slim

WORKDIR /app

# Keep browser binaries in project path so they are available at runtime.
ENV PLAYWRIGHT_BROWSERS_PATH=0

COPY package*.json ./

# Install dependencies + Chromium and required Linux shared libraries.
RUN npm ci && npx playwright install --with-deps chromium

COPY . .

RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
