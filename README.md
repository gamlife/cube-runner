# Cube Runner

A simple 3D endless runner built with Three.js + Vite.

- Move: `←/→` or `A/D`
- Jump: `Space` / `↑` / `W`
- Restart: `R`

## Development

```bash
npm install
npm run dev          # http://localhost:5173
```

## Production build (Docker)

```bash
docker compose up -d
# open http://localhost:3400
```

## Deploy to Coolify

- `build_pack: dockercompose`
- Port mapping: `3400:80`
- The repo's `docker-compose.yaml` is the source of truth for port mapping.
