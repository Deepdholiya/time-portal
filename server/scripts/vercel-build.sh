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
    npx prisma db push --schema prisma/schema.vercel.prisma --skip-generate
    npx tsx prisma/seed.ts
    ;;
  *)
    npx prisma generate
    DATABASE_URL=file:./demo.db npx prisma db push --skip-generate
    DATABASE_URL=file:./demo.db npx tsx prisma/seed.ts
    ;;
esac
npx esbuild src/app.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/app.mjs
