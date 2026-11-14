# LiveKit SFU для «Моего Канбана»

Этот каталог — минимальный самостоятельный контур LiveKit для перехода с публичного
`meet.jit.si` на собственный SFU. Приложение уже умеет работать в двух режимах:

- `VITE_LIVEKIT_URL` не задан — комната открывается на Jitsi (текущий production);
- `VITE_LIVEKIT_URL` задан — комната открывается через LiveKit, токен выдаёт `/api/meetings/livekit-token`.

## Что нужно

- VPS с Ubuntu 22.04/24.04, 2 vCPU, 4 ГБ RAM (для 10 участников);
- домен, например `livekit.example.com`, A-запись на IP VPS;
- открытые порты:
  - `80/tcp`, `443/tcp` — Caddy и WSS;
  - `7881/tcp` — WebRTC TCP fallback;
  - `50000–50100/udp` — медиапотоки.
- Docker и Docker Compose.

## Быстрый старт

```bash
# на VPS (Ubuntu/Debian, Docker уже установлен)
git clone https://github.com/nalfeynsh/kanban.git
cd kanban/deploy/livekit
sudo bash install.sh meet.example.ru
```

Скрипт создаст `.env`, сгенерирует ключи, откроет порты в UFW (если он активен),
запустит контейнеры и выведет значения для Layero.

Либо вручную:

```bash
git clone https://github.com/nalfeynsh/kanban.git
cd kanban/deploy/livekit
cp .env.example .env
# заполнить LIVEKIT_DOMAIN, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
docker compose up -d
docker compose logs -f livekit
```

Проверка:

```bash
curl -fsS https://livekit.example.com
# ожидается HTTP-ответ LiveKit (не 502)
```

Дальше в панели Layero:

1. Добавить переменные **сервера**:
   - `LIVEKIT_URL=wss://livekit.example.com`
   - `LIVEKIT_API_KEY=<ключ>`
   - `LIVEKIT_API_SECRET=<секрет>`
2. Добавить переменную **сборки**:
   - `VITE_LIVEKIT_URL=wss://livekit.example.com`
3. Пересобрать и задеплоить приложение.
4. Открыть `https://kanban.layero.app/api/vks/status` — должно быть
   `"livekit":{"configured":true,...}`.
5. Создать встречу, открыть комнату, разрешить камеру/микрофон.

Если `VITE_LIVEKIT_URL` не задан, приложение продолжает использовать Jitsi — это безопасный
fallback на время настройки.

## Важно про TURN

Если участники за строгим NAT/корпоративным firewall не подключаются, нужен TURN.
Для 10 участников обычно достаточно UDP-портов LiveKit; если оператор блокирует UDP,
добавьте coturn или TURN-конфигурацию LiveKit и откройте `3478/udp` и `5349/tcp`.

## Запись

Сейчас в приложении работает **локальная запись вкладки** (beta). Серверная запись
LiveKit Egress требует:

- отдельный S3/MinIO bucket;
- Redis;
- Egress-контейнер;
- политику хранения записей.

Это следующий этап после того, как SFU стабильно заработает. Не включайте Egress
на том же слабом VPS без запаса CPU/RAM.

## Безопасность

- `LIVEKIT_API_SECRET` хранится только в переменных сервера и никогда не попадает в браузер.
- Токен выдаётся только после проверки Supabase-сессии и доступа к встрече через RLS.
- Токен живёт 2 часа, комната ограничена именем `kanban-<room_token>`.
- Не коммитьте `.env`.
