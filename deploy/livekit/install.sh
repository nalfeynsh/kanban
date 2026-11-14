#!/usr/bin/env bash
# Установка своего LiveKit SFU на Ubuntu/Debian.
# Использование: sudo bash install.sh meet.example.ru
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Использование: sudo bash install.sh meet.example.ru" >&2
  exit 1
fi
if [[ "$DOMAIN" == http* || "$DOMAIN" == */* ]]; then
  echo "Укажите домен без https:// и без пути, например meet.example.ru" >&2
  exit 1
fi
if [[ "${EUID}" -ne 0 ]]; then
  echo "Запустите от root: sudo bash install.sh $DOMAIN" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker не установлен. Установите Docker Engine и Docker Compose plugin." >&2
  echo "https://docs.docker.com/engine/install/" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Не найден 'docker compose'. Установите Docker Compose plugin." >&2
  exit 1
fi

cd "$(dirname "$0")"

ENV_FILE=".env"
if [[ -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE уже существует — не перезаписываю. Удалите его вручную для перегенерации."
else
  API_KEY="kanban-$(openssl rand -hex 6)"
  API_SECRET="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<EOF
LIVEKIT_DOMAIN=$DOMAIN
LIVEKIT_API_KEY=$API_KEY
LIVEKIT_API_SECRET=$API_SECRET
EOF
  chmod 600 "$ENV_FILE"
  echo "Создан $ENV_FILE"
fi

# shellcheck disable=SC1091
source "$ENV_FILE"

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi active; then
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 7881/tcp
  ufw allow 50000:50100/udp
fi

docker compose up -d

cat <<EOF

LiveKit запущен.
Проверка: https://${LIVEKIT_DOMAIN}

Добавьте в Layero (серверные переменные):
LIVEKIT_URL=wss://${LIVEKIT_DOMAIN}
LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}

Затем перезапустите приложение и проверьте:
https://kanban.layero.app/api/vks/status
EOF
