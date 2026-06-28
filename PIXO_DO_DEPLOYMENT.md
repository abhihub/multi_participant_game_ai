# Pixo DigitalOcean Deployment

This repo is deployed on the Pixo ops droplet as the AI audio game moderator.

## Runtime

- Droplet: `pixo-ops-01`
- Public IP: `64.23.166.48`
- Tailscale IP: `100.113.62.47`
- Install path: `/opt/pixo-ai-moderator`
- Env path: `/etc/pixo-ai-moderator`
- Game API service: `pixo-game-api.service`
- Moderator worker service: `pixo-game-moderator.service`
- Game API port: `3010`
- LiveKit agent name: `pixo-game-moderator`

The Game API creates sessions and explicitly dispatches the named LiveKit
moderator worker into the session room. This is required for Pixo because Pixo
rooms may already exist before the user asks to add the moderator.

## Commands

```bash
ssh root@64.23.166.48

systemctl status pixo-game-api.service pixo-game-moderator.service
systemctl restart pixo-game-api.service pixo-game-moderator.service
journalctl -u pixo-game-api -u pixo-game-moderator -f

curl http://127.0.0.1:3010/internal/v1/health
```

## Required Env

`/etc/pixo-ai-moderator/game-api.env`:

```bash
PORT=3010
HOST=0.0.0.0
LOG_LEVEL=info
API_KEY=...
INTERNAL_AUTH_TOKEN=...
LIVEKIT_URL=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_AGENT_NAME=pixo-game-moderator
```

`/etc/pixo-ai-moderator/moderator.env`:

```bash
LIVEKIT_URL=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_AGENT_NAME=pixo-game-moderator
GAME_API_URL=http://127.0.0.1:3010
GAME_API_INTERNAL_TOKEN=...
OPENAI_API_KEY=...
DEEPGRAM_API_KEY=...
CARTESIA_API_KEY=...
```

Do not commit these env files or secret values.

## Deploy Update

From the Mac:

```bash
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude .env \
  --exclude .env.local \
  --exclude 'moderator/.env.local' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  /Users/gobi/Desktop/Code2/MultiParticipantGameAI/ \
  root@64.23.166.48:/opt/pixo-ai-moderator/

ssh root@64.23.166.48 '
  cd /opt/pixo-ai-moderator &&
  npm ci &&
  npm run build &&
  cd moderator &&
  uv sync &&
  systemctl restart pixo-game-api.service pixo-game-moderator.service
'
```

## Smoke Test

The smoke test should create a trivia session, start it, dispatch the moderator,
and show logs like:

- `received job request`
- `pre-connect: room=... session_id=...`
- `joined room=...`
- `attached to session ... as moderator-ai`
- `video HUD track published`
- `audio track published`

The deployment currently reaches that point. Full spoken trivia still requires
valid `OPENAI_API_KEY` and `CARTESIA_API_KEY`; placeholder values return 401.

## Notes for Pixo Integration

- `pcconnect` should call this Game API server-side; mobile and TV clients must
  not receive the Game API key.
- Use `http://100.113.62.47:3010` from other Tailscale-connected Pixo services.
- MVP game type should be `trivia`.
- Pixo should pass its existing LiveKit `room_name` when creating the session.
