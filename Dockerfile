# Build the UI on the native platform. The output is static files, so the
# target architecture only matters for the Go binary below.
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /src
RUN npm install -g pnpm@11.25.0
COPY webui/package.json webui/pnpm-lock.yaml webui/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY webui/ ./
RUN pnpm build

# Cross-compile on the native platform so the arm64 image doesn't build under QEMU.
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS builder
ARG TARGETOS TARGETARCH
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -o /katsukura ./cmd/server

FROM alpine:3.23
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
WORKDIR /app
COPY --from=builder /katsukura ./katsukura
COPY --from=web /src/dist ./web
ENV STATIC_DIR=/app/web
USER app
EXPOSE 8082
CMD ["./katsukura"]
