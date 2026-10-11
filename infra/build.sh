#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${REPO_ROOT}/infra/template.yaml"
HANDLERS="${REPO_ROOT}/infra/lambda/handlers.py"

if command -v cfn-lint >/dev/null 2>&1; then
  CFN_LINT="$(command -v cfn-lint)"
elif [[ -x "${REPO_ROOT}/.venv/bin/cfn-lint" ]]; then
  CFN_LINT="${REPO_ROOT}/.venv/bin/cfn-lint"
else
  echo "cfn-lint is required. Install it with: .venv/bin/python -m pip install cfn-lint" >&2
  exit 1
fi

if [[ -x "${REPO_ROOT}/.venv/bin/python" ]]; then
  PYTHON="${REPO_ROOT}/.venv/bin/python"
else
  PYTHON="$(command -v python3)"
fi

echo "Linting ${TEMPLATE}"
"${CFN_LINT}" "${TEMPLATE}"
echo "Compiling Lambda handlers"
"${PYTHON}" -m py_compile "${HANDLERS}"
echo "Infra baseline checks passed."
