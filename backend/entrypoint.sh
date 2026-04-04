#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready"
until psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; do
  echo "PostgreSQL not ready yet, retrying in 2s..."
  sleep 2
done

echo "Running migrations..."
psql "$DATABASE_URL" -f ./migrations/schema.sql

echo "Starting server:"
exec node dist/server.js