#!/bin/sh
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  (sleep 1; open "http://127.0.0.1:8765" 2>/dev/null || xdg-open "http://127.0.0.1:8765" 2>/dev/null || true) &
  python3 -m http.server 8765
else
  echo "Python 3 nincs telepitve; nyisd meg az index.html fajlt kozvetlenul."
  exit 1
fi
