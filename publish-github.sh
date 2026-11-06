#!/bin/bash
# Създава публично GitHub repo с pipeline-а, слага ключовете като скрити Secrets,
# включва GitHub Pages и пуска първото обновяване.
# Пускане (от папката WOW MOBILE APP):  bash publish-github.sh
set -e
cd "$(dirname "$0")"
REPO="${1:-meta-builds-data}"

if ! command -v gh >/dev/null; then
  echo "Нужен е GitHub CLI. Инсталирай го с:  brew install gh"
  echo "(или изтегли от https://cli.github.com) и пусни скрипта отново."
  exit 1
fi
gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https --hostname github.com
OWNER=$(gh api user -q .login)
echo "→ GitHub акаунт: $OWNER, repo: $REPO"

# Проверка: .env никога не влиза в repo-то
grep -qx ".env" .gitignore || { echo "ГРЕШКА: .env липсва в .gitignore"; exit 1; }

# Workflow за нощното обновяване
mkdir -p .github/workflows
cp pipeline/nightly.yml .github/workflows/nightly.yml

[ -d .git ] || git init -b main >/dev/null
git add -A
git commit -m "Meta Builds data pipeline" >/dev/null 2>&1 || true
if git ls-files --error-unmatch .env >/dev/null 2>&1; then echo "ГРЕШКА: .env е в git — спирам."; exit 1; fi

if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public --source . --remote origin --push
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
fi

echo "→ Слагам ключовете като скрити Secrets (четат се от .env, не се показват)..."
val() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"'"'"; }
printf '%s' "$(val BLIZZARD_CLIENT_ID)" | gh secret set BLIZZARD_CLIENT_ID -R "$OWNER/$REPO"
printf '%s' "$(val BLIZZARD_CLIENT_SECRET)" | gh secret set BLIZZARD_CLIENT_SECRET -R "$OWNER/$REPO"
RIO="$(val RAIDERIO_ACCESS_KEY)"; [ -n "$RIO" ] && printf '%s' "$RIO" | gh secret set RAIDERIO_ACCESS_KEY -R "$OWNER/$REPO"

echo "→ Включвам GitHub Pages..."
gh api -X POST "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || \
  gh api -X PUT "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || true

echo "https://$OWNER.github.io/$REPO/v1" > cdn-url.txt
echo "→ Пускам първото обновяване (отнема ~3–4 часа)..."
sleep 8
gh workflow run nightly.yml -R "$OWNER/$REPO" || echo "  (пусни го ръчно от таб Actions → Nightly data → Run workflow)"

echo ""
echo "Готово!"
echo "  Repo:   https://github.com/$OWNER/$REPO"
echo "  Данни:  https://$OWNER.github.io/$REPO/v1/index.json  (след първото обновяване)"
echo "  Прогрес: https://github.com/$OWNER/$REPO/actions"
