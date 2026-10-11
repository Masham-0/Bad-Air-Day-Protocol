#!/usr/bin/env bash
# Package the shared backend for every Lambda into .build/backend (CodeUri in template.yaml).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .build/backend && mkdir -p .build/backend/api
cp -r data contracts mocks .build/backend/
cp -r agent/src/bad_air_agent .build/backend/
cp -r api/handlers .build/backend/api/
touch .build/backend/api/__init__.py .build/backend/api/handlers/__init__.py .build/backend/data/alerts/__init__.py
find .build/backend -name __pycache__ -prune -exec rm -rf {} +
# Lambda is Linux x86_64 / python3.12: install wheels for that target, not this machine.
pip install -q -r infra/requirements.txt -t .build/backend \
  --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all:
echo "built .build/backend ($(du -sh .build/backend | cut -f1))"
