#!/bin/bash
# loveAI persona model — llama.cpp server launcher.
#
# Started by loveai-llama.service. Kept as a wrapper (instead of a long ExecStart
# line) for three reasons:
#   1. The API key is passed with --api-key-file, not --api-key: a key passed as an
#      argument is visible to every local user in `ps aux`.
#   2. Every flag stays optional/conditional (no systemd `${VAR}` quoting games).
#   3. Model discovery (`ls *.gguf`) lives here, so swapping runtimes is just a restart.
#
# Config comes from /etc/loveai/deploy.env (see ml/aws/user-data.sh).
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/loveai/deploy.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

MODEL_DIR="${MODEL_DIR:-/opt/loveai/models}"
MODEL_FILE="${MODEL_FILE:-}"
API_PORT="${API_PORT:-8000}"
CTX_SIZE="${CTX_SIZE:-6144}"
N_PARALLEL="${N_PARALLEL:-2}"
N_THREADS="${N_THREADS:-$(nproc)}"
N_BATCH="${N_BATCH:-512}"
UBATCH_SIZE="${UBATCH_SIZE:-256}"
ALIAS="${LLM_MODEL:-loveai-persona-1b}"
API_KEY_FILE="${API_KEY_FILE:-/etc/loveai/api-keys}"
LLAMA_SERVER="${LLAMA_SERVER:-/usr/local/bin/llama-server}"
# mmap: the model lives in the page cache and is not duplicated per process; on a
# 2 GiB box that is the difference between serving and swapping. Use "mlock" only
# with >= 4 GiB RAM.
LOAD_MODE="${LOAD_MODE:-mmap}"

if [ ! -x "$LLAMA_SERVER" ]; then
  echo "loveai: llama-server not found at $LLAMA_SERVER" >&2
  exit 1
fi

MODEL_PATH="$MODEL_FILE"
case "$MODEL_PATH" in
  /*) ;;                                              # absolute path
  "") MODEL_PATH="$(ls -1t "$MODEL_DIR"/*.gguf 2>/dev/null | head -1 || true)" ;;
  *)  MODEL_PATH="$MODEL_DIR/$MODEL_FILE" ;;
esac
if [ -z "$MODEL_PATH" ] || [ ! -f "$MODEL_PATH" ]; then
  echo "loveai: no .gguf model found (MODEL_DIR=$MODEL_DIR MODEL_FILE=${MODEL_FILE:-<auto>})" >&2
  ls -la "$MODEL_DIR" >&2 || true
  exit 1
fi

args=(
  -m "$MODEL_PATH"
  --host 127.0.0.1
  --port "$API_PORT"
  -c "$CTX_SIZE"
  -np "$N_PARALLEL"
  -t "$N_THREADS"
  -tb "$N_THREADS"
  -b "$N_BATCH"
  -ub "$UBATCH_SIZE"
  -a "$ALIAS"
  --load-mode "$LOAD_MODE"
  --no-webui          # no bundled UI: less RAM, smaller attack surface
  --metrics           # /metrics for CloudWatch/curl ops
  # warmup stays ENABLED (default): it faults the weights into RAM and warms the
  # thread pool, so the first user request is not the one that pays for it.
  # Optional tuning, kept off by default:
  #   --cache-reuse 256        reuse KV chunks when the conversation prefix shifts
  #   --flash-attn on          CPU: measured no gain on Graviton2, reduces KV RAM
  #   -ctk q8_0 -ctv q8_0      halve KV memory if you raise CTX_SIZE
)

# Escape hatch for ops without editing this file: LLAMA_EXTRA_ARGS="--cache-reuse 256"
if [ -n "${LLAMA_EXTRA_ARGS:-}" ]; then
  # shellcheck disable=SC2206
  args+=(${LLAMA_EXTRA_ARGS})
fi

if [ -s "$API_KEY_FILE" ]; then
  args+=(--api-key-file "$API_KEY_FILE")
  echo "loveai: api key auth enabled ($API_KEY_FILE)"
else
  echo "loveai: WARNING api key file missing/empty ($API_KEY_FILE) — endpoint is UNAUTHENTICATED" >&2
fi

echo "loveai: starting llama-server model=$MODEL_PATH ctx=$CTX_SIZE parallel=$N_PARALLEL threads=$N_THREADS"
exec "$LLAMA_SERVER" "${args[@]}"
