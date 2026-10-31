#!/usr/bin/env bash
# SeptiSense - 1-Click Push to GitHub
set -e

cd "$(dirname "$0")"

echo "========================================================"
echo "  SeptiSense GitHub Deployment Helper"
echo "========================================================"

if ! gh auth status &>/dev/null; then
  echo "[1/2] Connecting to your GitHub account..."
  echo "Opening browser to authenticate..."
  gh auth login --web -p https
fi

echo "[2/2] Pushing code and trained models to GitHub repo: septisense..."
if ! git remote get-url origin &>/dev/null; then
  gh repo create septisense --public --source=. --remote=origin --push
else
  git push -u origin main
fi

echo ""
echo "========================================================"
echo "  SUCCESS! Your repository is live on GitHub!"
echo "========================================================"
