#!/usr/bin/env bash
# PROTOTYPE. Package the shared backend for all four Lambdas into .build/backend.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .build/backend && mkdir -p .build/backend
cp -r data agent contracts mocks .build/backend/
cp infra/lambda/handlers.py infra/requirements.txt .build/backend/
find .build/backend -name __pycache__ -prune -exec rm -rf {} +
# Lambda is Linux x86_64 / python3.12: install wheels for that target, not this machine.
pip install -q -r infra/requirements.txt -t .build/backend \
  --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all:
echo "built .build/backend ($(du -sh .build/backend | cut -f1))"
