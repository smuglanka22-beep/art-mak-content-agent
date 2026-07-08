# art-mak-content-agent
Дашборд конкурентов и контент-агент для Art Mak

Сайт на React + Vite с двумя инструментами:
- **Контент-агент** — планирование недели постов/сторис/reels для Art Mak
- **Анализ конкурентов** — поиск вирусных Reels через Apify и адаптация сценариев через Claude

## Локальный запуск

```bash
npm install
npm run dev
```

## Деплой

При каждом пуше в `main` GitHub Actions (`.github/workflows/deploy.yml`) собирает
проект и публикует его на GitHub Pages. Один раз нужно включить источник Pages:
Settings → Pages → Build and deployment → Source → **GitHub Actions**.

## Ключи

Оба AI-инструмента используют Claude API напрямую из браузера — ключ Anthropic
вводится в разделе «Настройки» на самом сайте и хранится только в localStorage
браузера. Apify-токен вводится в разделе «Скан» дашборда конкурентов.
