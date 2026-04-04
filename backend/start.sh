#!/bin/bash
set -e

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -d venv ]; then
  source venv/bin/activate
fi

PORT="${PORT:-8000}"
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
