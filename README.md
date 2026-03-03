# spotify-viewer

Single-user Spotify analytics dashboard — Go backend (Fiber + GORM/SQLite) with a statically-exported Next.js frontend embedded into the binary. Designed to run locally or in a Docker container on port any port of your choosing.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Go | 1.24+ | Backend build |
| Node.js | 20+ | Frontend build |
| npm | 10+ | Comes with Node |
| Docker | 24+ | Only needed for container deployment |

## Spotify Developer Setup

1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create App**.
3. Give it any name (e.g. "spotify-viewer") and description.
4. In **Redirect URIs**, add every origin you will use to access the app, each with the `/auth/callback` path. For example:
   ```
   http://127.0.0.1:<PORT>/auth/callback
   http://localhost:<PORT>/auth/callback
   http://<your-tailscale-hostname>:<PORT>/auth/callback
   ```
   Replace <PORT> with the port you plan to run the server on. **The port in each redirect URI must match the `port` value in your `config.yaml`** — Spotify will reject the OAuth callback otherwise.
   > The app determines the correct redirect URI automatically based on the hostname you use in your browser, so there is nothing to configure beyond registering the URIs with Spotify.
5. Note the **Client ID** and **Client Secret** — you will need these for the config file.

## Configuration

Copy the example config and fill in your credentials:

```bash
cp backend/config.example.yaml backend/config.yaml
```

Edit `backend/config.yaml`:

```yaml
port: <PORT>                # Port the server listens on (change as needed)
db_path: spotify.db
spotify:
  client_id: <YOUR_SPOTIFY_CLIENT_ID>
  client_secret: <YOUR_SPOTIFY_CLIENT_SECRET>
```

> **Important:** If you change the port, make sure every redirect URI registered in the Spotify Developer Dashboard uses the new port.

> **Do not commit `config.yaml` to source control** — it contains secrets. The `.gitignore` already excludes it.

## Quick Start (Local)

The control script builds the frontend and backend, then starts the server in the background:

```bash
# Start (builds everything automatically)
./spotify-viewer.sh start

# Stop and clean up build artifacts
./spotify-viewer.sh stop

# Restart
./spotify-viewer.sh restart
```

The app will be available at **http://127.0.0.1:<PORT>**.

## Docker

Build and run with Docker (no local Go/Node toolchain required):

```bash
# Build the image (multi-stage: Node → Go → Alpine runtime)
docker build -t spotify-viewer .

# Run — mount your config.yaml into the container
docker run -d \
  --name spotify-viewer \
  -p <PORT>:<PORT>0 \
  -v "$(pwd)/backend/config.yaml:/app/config.yaml" \
  spotify-viewer
```

If you changed the port in `config.yaml`, update the `-p` flag to match (e.g. `-p 9090:9090`).

The SQLite database is stored inside the container at `/app/spotify.db`. To persist it across container restarts, also mount a volume:

```bash
docker run -d \
  --name spotify-viewer \
  -p <PORT>:<PORT> \
  -v "$(pwd)/backend/config.yaml:/app/config.yaml" \
  -v spotify-viewer-data:/app \
  spotify-viewer
```

## Project Structure

```
spotify-viewer/
├── Dockerfile               # Multi-stage build (Node + Go + Alpine)
├── .dockerignore
├── spotify-viewer.sh        # Start/stop/restart control script
├── backend/
│   ├── cmd/server/main.go   # Entry point, embeds frontend
│   ├── config/              # YAML config loader
│   ├── handlers/            # HTTP route handlers (auth, analytics, import)
│   ├── importer/            # Spotify data export importer
│   ├── models/              # GORM models
│   ├── config.example.yaml  # Template config
│   ├── go.mod / go.sum
│   └── Makefile
└── frontend/
    ├── pages/               # Next.js pages (index, dashboard, import)
    ├── next.config.js       # Static export config
    └── package.json
```

## Dashboard Features

| Tab | Description |
|-----|-------------|
| 🎵 Overview | Top artists and tracks at a glance |
| 🕐 Recently Played | Timeline of last 50 plays with timestamps |
| 📊 Time Range | Toggle between 4-week, 6-month, and all-time data |
| 🎸 Genres | Genre tag cloud derived from your top artists |
| ⏰ Listening Clock | Hour-of-day and day-of-week listening distribution |
| 🎤 Artist Dominance | Bar chart of most-played artists in recent history |
| 🔍 Discovery Stats | Unique artist/track counts and diversity score |
| 📈 All-Time | Imported all-time most-played tracks (requires data import) |

Additional features:
- **Now Playing** indicator in the dashboard header (auto-refreshes)
- **Data Import** page — upload your Spotify extended data export (ZIP or JSON)

## License

MIT
