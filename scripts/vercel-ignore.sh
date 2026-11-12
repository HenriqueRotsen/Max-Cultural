#!/usr/bin/env bash
# "Ignored Build Step" da Vercel (vercel.json → ignoreCommand), para gastar menos.
#   exit 0 → NÃO compila   ·   exit 1 → compila
#
# Regras:
# 1) Só compila na main (produção) e na develop. Branches de feature, PR e o
#    "main de volta na develop" não geram build: a CI do GitHub já testa tudo.
# 2) Na main/develop, só compila o app que mudou desde o último deploy dele
#    (o próprio app, os pacotes compartilhados ou as dependências da raiz).
# 3) Na dúvida (sem o commit anterior), compila.
#
# Uso (a partir da pasta do app): bash ../../scripts/vercel-ignore.sh <app>
set -u
app="${1:?informe o app}"
ref="${VERCEL_GIT_COMMIT_REF:-}"
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
cur="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [ "$ref" != "main" ] && [ "$ref" != "develop" ]; then
  echo "⏭  $app: branch '$ref' não publica (só main e develop)."
  exit 0
fi

root="$(git rev-parse --show-toplevel 2>/dev/null || echo ../..)"
cd "$root" || exit 1

if [ -z "$prev" ]; then
  echo "▶  $app: sem deploy anterior conhecido; compilando."
  exit 1
fi
if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=100 origin "$ref" 2>/dev/null || true
fi
if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  echo "▶  $app: commit anterior ($prev) indisponível; compilando."
  exit 1
fi

if git diff --quiet "$prev" "$cur" -- "apps/$app" packages package.json package-lock.json; then
  echo "⏭  $app: nada mudou em apps/$app nem no código compartilhado desde $prev."
  exit 0
fi
echo "▶  $app: houve mudança; compilando."
exit 1
