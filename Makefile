.PHONY: install run build test test-integration test-all lint webui-install webui-dev webui-build webui-check webui-test docker-build

install:
	go mod download

run:
	go run ./cmd/server

webui-install:
	cd webui && pnpm install --frozen-lockfile

webui-dev: webui-install
	cd webui && pnpm dev

webui-build: webui-install
	cd webui && pnpm build
	touch webui/dist/.gitkeep

webui-check: webui-install
	cd webui && pnpm check

webui-test: webui-install
	cd webui && pnpm test

build: webui-build
	mkdir -p bin
	go build -o bin/papi2 ./cmd/server

test:
	go test -race -count=1 ./...

test-integration:
	go test -race -count=1 -tags=integration -timeout=5m ./...

test-all: test test-integration webui-check webui-test

lint:
	go vet ./...

docker-build:
	docker build -t papi2:local .
