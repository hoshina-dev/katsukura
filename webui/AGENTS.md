# Web UI

Vite and React. `pnpm dev` proxies `/api` to the Go server on port 8082.
`pnpm build` writes static files to `dist/`. The API serves that directory
when `STATIC_DIR` points at it.
