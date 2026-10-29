FROM node:22-alpine AS builder
WORKDIR /webui
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN adduser -D -u 10001 app
COPY --from=builder /webui/.next/standalone ./
COPY --from=builder /webui/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
