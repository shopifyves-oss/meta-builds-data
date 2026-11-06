# WoW Meta Builds — data прототип

Скриптове, които събират мета билдове от топ играчи:
- **Mythic+**: топ 5% по M+ score в спека (Raider.IO API + статистики от Blizzard)
- **PvP**: топ играчи в ладъра (Blizzard API)

## Настройка (веднъж)
1. Нужен е Node.js 18+ (`node -v` в Terminal).
2. Копирай `.env.example` като `.env` и попълни `BLIZZARD_CLIENT_ID` и `BLIZZARD_CLIENT_SECRET`.

## Всички спекове наведнъж (препоръчително)
```
cd ~/Desktop/"WOW MOBILE APP"
caffeinate -i node pipeline/run-all.mjs
```
`caffeinate -i` пречи на Mac-а да заспи по време на работа.
- Всички 40 спека × режими mplus, shuffle, blitz, 2v2, 3v3, rbg за US.
- Пази лимита на Blizzard (~34 000 заявки/час). Пълен US ≈ 5–7 часа.
- По-бързо: `--maxPlayers 300` (таван на M+ извадката на спек) ≈ 2–3 часа.
- Ако го спрете (Ctrl+C), при ново пускане прескача спековете, обновени в последните 12 часа (`--fresh 12`). `--force` обновява всичко.
- Накрая автоматично обновява данните на приложението (app/src/data/specs.json).
- Опции: `--regions us,eu`, `--modes mplus,shuffle`, `--specs mage-frost,priest-holy`.

## Един спек (за тестове)
```
cd ~/Desktop/"WOW MOBILE APP"
node pipeline/mplus.mjs --class mage --spec frost --region us
node pipeline/pvp.mjs   --class mage --spec frost --bracket shuffle --region us
node pipeline/pvp.mjs   --class mage --spec frost --bracket 3v3 --top 50
```
Резултатът е в `data/mplus/` и `data/pvp/` като JSON. Суровите данни за играчите се пазят в `data/raw/`.

Ако променим само начина на изчисляване (без нужда от ново теглене):
```
node pipeline/rebuild.mjs
```

### Какво съдържа JSON-ът
- `builds` — по един запис за всеки hero tree: % играчи, **препоръчан import string** (реалният билд на топ играча,
  най-близък до консенсуса), гъвкави таланти (20–80%), % на всеки талант, най-честите точни билдове, stat priority.
- `stats`, `gear`, `enchants`, `gems`, `pvpTalents` — общо за целия спек.

Опции: `--region us|eu|kr|tw`, `--bracket shuffle|blitz|2v2|3v3|rbg`, `--top 100`, `--periods 4` (седмици M+ ладъри), `--maxPlayers 0` (0 = всички от топ 5%).
Класове/спекове с две думи се пишат с тире: `--class death-knight --spec unholy`, `--class demon-hunter --spec havoc`.

## Бележки
- Топ 5% за M+ е **оценка**: популация на региона × дял на спека в пула от топ рънове.
- Данните идват от Raider.IO и Blizzard; публичното приложение трябва да има линк към raider.io.
- Папката `_to_delete/` съдържа тестови файлове от проверката — можеш да я изтриеш.
