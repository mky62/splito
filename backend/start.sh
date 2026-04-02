#!/bin/bash
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0
