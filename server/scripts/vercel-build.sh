#!/bin/sh
# Builds the API for Vercel. With a Postgres DATABASE_URL (e.g. from the Neon
# integration) the demo data goes into that shared database; without one it
# falls back to a SQLite file copied into each function instance.
set -e
cd "$(dirname "$0")/.."
case "$DATABASE_URL" in
  postgres://*|postgresql://*)
    sed 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma > prisma/schema.vercel.prisma
    npx prisma generate --schema prisma/schema.vercel.prisma
    # Schema changes and the seed go through the direct (unpooled) connection when there is one.
    DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" npx prisma db push --schema prisma/schema.vercel.prisma --skip-generate
    DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" npx tsx prisma/seed.ts
    ;;
  *)
    npx prisma generate
    DATABASE_URL=file:./demo.db npx prisma db push --skip-generate
    DATABASE_URL=file:./demo.db npx tsx prisma/seed.ts
    ;;
esac
npx esbuild src/app.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/app.mjs
