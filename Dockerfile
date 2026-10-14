FROM node:22-alpine AS webui
WORKDIR /webui
RUN npm install -g pnpm@11.25.0
COPY webui/package.json webui/pnpm-lock.yaml webui/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY webui/ ./
RUN pnpm build

FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=webui /webui/dist ./webui/dist
RUN CGO_ENABLED=0 go build -trimpath -o /papi2 ./cmd/server

FROM alpine:3.23
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
WORKDIR /app
COPY --from=builder /papi2 ./papi2
USER app
EXPOSE 8082
CMD ["./papi2"]
