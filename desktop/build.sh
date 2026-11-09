#!/usr/bin/env bash
# Сборка Vesna.exe (Windows x64) из Linux/macOS/Windows. Нужен Go 1.21+.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www && mkdir www
cp -r ../index.html ../css ../js ../icons ../fonts ../library ../manifest.webmanifest ../version.json www/
# ресурсы (иконка, манифест DPI, сведения о версии) — если есть llvm-windres
if command -v llvm-windres-18 >/dev/null || command -v llvm-windres >/dev/null; then
  WR=$(command -v llvm-windres-18 || command -v llvm-windres)
  (cd res && "$WR" --target=pe-x86-64 -i vesna.rc -o ../rsrc_windows_amd64.syso)
fi
mkdir -p ../dist
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o ../dist/Vesna.exe .
echo "✓ dist/Vesna.exe ($(du -h ../dist/Vesna.exe | cut -f1))"
