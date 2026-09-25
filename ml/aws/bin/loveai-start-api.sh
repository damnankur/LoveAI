#!/bin/bash
# loveAI persona model — Docker (serve.py / FastAPI) launcher.
#
# Started by loveai-api.service. Runs the ml/aws/Dockerfile.aws image in the
# foreground so systemd owns the lifecycle and restarts it on failure.
#
# USE THE GGUF PATH (loveai-llama.service) ON A 2 GiB INSTANCE. This container
# serves the bf16/fp16 safetensors merged model through PyTorch, which needs
# ~4.5 GB RSS at float32 and ~2.7 GB at float16 — see DEPLOYMENT_PLAYBOOK.md §2.
# It is the right choice on >= 4 GiB instances (t4g.medium/t3.medium) or when you
# want the exact unquantized weights.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/loveai/deploy.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

DOCKER_IMAGE="${DOCKER_IMAGE:-loveai-persona-api:0.1.0}"
CONTAINER_NAME="${CONTAINER_NAME:-loveai-api}"
API_PORT="${API_PORT:-8000}"
MODEL_DIR="${MODEL_DIR:-/opt/loveai/models}"
MERGED_DIR="${MERGED_DIR:-$MODEL_DIR/persona-merged}"
PERSONA_DTYPE="${PERSONA_DTYPE:-float16}"
MAX_NEW_TOKENS_CAP="${MAX_NEW_TOKENS_CAP:-512}"
API_KEY_FILE="${API_KEY_FILE:-/etc/loveai/api-keys}"

if ! docker image inspect "$DOCKER_IMAGE" >/dev/null 2>&1; then
  echo "loveai: image $DOCKER_IMAGE not present. Build/bake it first:" >&2
  echo "  cd ml && docker build -f aws/Dockerfile.aws -t $DOCKER_IMAGE ." >&2
  exit 1
fi

if [ ! -d "$MERGED_DIR" ]; then
  echo "loveai: merged model dir missing: $MERGED_DIR (see DEPLOYMENT_PLAYBOOK.md §4)" >&2
  exit 1
fi

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

# NOTE: no --rm here — Docker rejects --rm together with --restart. systemd owns
# cleanup: the service's ExecStop runs `docker stop`, and the launcher removes any
# leftover container (same name) before starting.
exec docker run \
  --name "$CONTAINER_NAME" \
  --init \
  --publish "127.0.0.1:${API_PORT}:8000" \
  --mount "type=bind,src=${MERGED_DIR},dst=/app/models/persona-merged,readonly" \
  --env "LLM_API_KEY=$(head -n1 "$API_KEY_FILE" 2>/dev/null || true)" \
  --env "PERSONA_MODEL_DIR=/app/models/persona-merged" \
  --env "PERSONA_DTYPE=${PERSONA_DTYPE}" \
  --env "TORCH_NUM_THREADS=${N_THREADS:-$(nproc)}" \
  --env "MAX_NEW_TOKENS_CAP=${MAX_NEW_TOKENS_CAP}" \
  --env "LLM_MODEL=${LLM_MODEL:-loveai-persona-1b}" \
  --env "PORT=8000" \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \
  --restart unless-stopped \
  "$DOCKER_IMAGE"
