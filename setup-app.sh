#!/bin/bash
# Създава/обновява Expo приложението в папка app/.
# Пускане (от папката WOW MOBILE APP):  bash setup-app.sh
set -e
cd "$(dirname "$0")"

if [ ! -d app ]; then
  echo "→ Създавам Expo проект (app/)..."
  npx --yes create-expo-app@latest app --template blank-typescript
fi

cd app
echo "→ Инсталирам нужните пакети..."
npx expo install expo-clipboard react-native-safe-area-context expo-status-bar expo-image expo-linear-gradient react-native-svg @react-native-async-storage/async-storage

echo "→ Копирам кода на приложението..."
cp ../app-src/App.tsx ./App.tsx
mkdir -p src
cp -R ../app-src/src/. ./src/
rm -f src/data/specs.json   # данните вече идват от CDN

if [ -f ../cdn-url.txt ]; then
  URL=$(cat ../cdn-url.txt)
  echo "export const CDN_BASE = '$URL';" > src/config.ts
  echo "→ CDN: $URL"
else
  echo "! Липсва cdn-url.txt — първо пусни: bash publish-github.sh"
fi

# Тъмен интерфейс
node -e "const f='app.json';const j=require('./'+f);j.expo.userInterfaceStyle='dark';j.expo.backgroundColor='#090B10';j.expo.name='Meta Builds';require('fs').writeFileSync(f,JSON.stringify(j,null,2))"

echo ""
echo "Готово! Стартирай с:  cd app && npx expo start"
