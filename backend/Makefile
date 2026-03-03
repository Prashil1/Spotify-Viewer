.PHONY: build run

BUILD_OUT = spotify-viewer

build:
	# build frontend static export first
	cd ../frontend && npm ci --no-audit --no-fund && npm run build
	# copy exported out to backend/frontend_out for go:embed
	rm -rf cmd/server/frontend_out || true
	mkdir -p cmd/server/frontend_out
	# use rsync to reliably copy contents into cmd/server for go:embed
	rsync -a ../frontend/out/ cmd/server/frontend_out/
	# then build backend (which embeds frontend/out)
	go build -o $(BUILD_OUT) ./cmd/server

dev:
	@echo "Run backend with CONFIG=config.yaml for local testing"

run: build
	@if [ -z "$(CONFIG)" ]; then \
		echo "Please provide CONFIG=path/to/config.yaml"; exit 2; \
	fi
	./$(BUILD_OUT) -config $(CONFIG)
