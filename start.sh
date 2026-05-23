#!/bin/sh
# Restore from Litestream replica if DB is missing (covers first boot after volume replacement)
if [ -n "$LITESTREAM_S3_BUCKET" ] && [ ! -f "$DB_PATH" ]; then
  echo "Restoring database from Litestream replica…"
  litestream restore -config /etc/litestream.yml "$DB_PATH" || true
fi

if [ -n "$LITESTREAM_S3_BUCKET" ]; then
  # Run Litestream replication in background, then start app
  exec litestream replicate -config /etc/litestream.yml -exec "node /app/dist/index.js"
else
  # No backup configured — run app directly
  exec node /app/dist/index.js
fi
