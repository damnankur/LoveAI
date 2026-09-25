#!/bin/bash
# =============================================================================
# loveAI persona model — EC2 bootstrap (Amazon Linux 2023, arm64 or x86_64)
# =============================================================================
# Converges a fresh instance into a serving host for the fine-tuned persona model:
# swap → packages → llama.cpp (prebuilt) → model weights (S3/HF) → API key →
# systemd service → nginx → optional Let's Encrypt TLS → self-verification.
#
# Idempotent: completed work is skipped; exits early once
# /var/lib/loveai/bootstrap.done exists (FORCE=1 re-runs everything).
#
# Delivered as gzipped+base64 user-data (terraform/main.tf) because the raw script
# exceeds EC2's 16 KB user-data limit. Helper scripts, systemd units and nginx
# configs are NOT embedded — they arrive as a versioned S3 bundle
# (DEPLOY_BUNDLE_URI), so they can be updated without touching user-data.
#
# CONFIG (Terraform writes /etc/loveai/deploy.env first; it wins over defaults):
#   API_HOST          api.loveai.damnankur.com  public DNS name (nginx server_name)
#   API_PORT          8000                      loopback port of the model server
#   LETSENCRYPT_EMAIL (empty)                   empty = HTTP only, no TLS
#   LLM_MODEL         loveai-persona-1b         model alias reported by the API
#   LLM_API_KEY       (generated on box)        never logged, never committed
#   MODEL_SOURCE      s3 | hf | none            where the weights come from
#   MODEL_BUCKET/     (empty) / models/persona  S3 location of the GGUF      [s3]
#   MODEL_PREFIX
#   HF_REPO/HF_FILE/  (empty)                   Hugging Face repo + file       [hf]
#   HF_TOKEN
#   DEPLOY_BUNDLE_URI (empty)                   s3://bucket/deploy/loveai-deploy.tar.gz
#   MODEL_FILE        (auto)                    target filename; empty = newest *.gguf
#   MODEL_DIR         /opt/loveai/models
#   MERGED_DIR        $MODEL_DIR/persona-merged safetensors dir (docker mode)
#   CTX_SIZE          6144                      KV context tokens (shared pool)
#   N_PARALLEL        2                         server slots (keeps prefix caches warm)
#   N_THREADS         nproc
#   N_BATCH/UBATCH    512 / 256                 prompt batching
#   SWAP_GB           2
#   SKIP_TLS          0
#   FORCE             0
# =============================================================================

set -euo pipefail

LOG_FILE="${LOG_FILE:-/var/log/loveai-bootstrap.log}"
STATE_DIR="/var/lib/loveai"
ENV_FILE="/etc/loveai/deploy.env"

mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

log()  { echo "[loveai $(date -u +%H:%M:%S)] $*"; }
warn() { echo "[loveai $(date -u +%H:%M:%S)] WARNING: $*" >&2; }
die()  { echo "[loveai $(date -u +%H:%M:%S)] FATAL: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. config
# ---------------------------------------------------------------------------
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

: "${API_HOST:=}"
: "${API_PORT:=8000}"
: "${LETSENCRYPT_EMAIL:=}"
: "${LLM_MODEL:=loveai-persona-1b}"
: "${LLM_API_KEY:=}"
: "${MODEL_SOURCE:=none}"
: "${MODEL_BUCKET:=}"
: "${MODEL_PREFIX:=models/persona}"
: "${HF_REPO:=}"
: "${HF_FILE:=}"
: "${HF_TOKEN:=}"
: "${DEPLOY_BUNDLE_URI:=}"
: "${MODEL_FILE:=}"
: "${MODEL_DIR:=/opt/loveai/models}"
: "${MERGED_DIR:=$MODEL_DIR/persona-merged}"
: "${CTX_SIZE:=6144}"
: "${N_PARALLEL:=2}"
: "${N_THREADS:=$(nproc)}"
: "${N_BATCH:=512}"
: "${UBATCH_SIZE:=256}"
: "${SWAP_GB:=2}"
: "${SKIP_TLS:=0}"
: "${FORCE:=0}"
: "${LLAMA_CPP_VERSION:=b10941}"   # pin the build: llama.cpp flags move between releases

mkdir -p "$STATE_DIR" "$MODEL_DIR" "$MERGED_DIR" /etc/loveai /opt/loveai/nginx

log "=== loveAI bootstrap start ==="
log "arch=$(uname -m) kernel=$(uname -r) nproc=$N_THREADS mem=$(free -m | awk '/^Mem:/{print $2"MB"}')"
if [ -f "$STATE_DIR/bootstrap.done" ] && [ "$FORCE" != "1" ]; then
  log "already bootstrapped — nothing to do (FORCE=1 to re-run)."
  exit 0
fi

imds() { # IMDSv2 (Terraform sets http_tokens=required)
  local token
  token="$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 300" --max-time 5 || true)"
  curl -sS --max-time 5 -H "X-aws-ec2-metadata-token: $token" \
    "http://169.254.169.254/latest/meta-data/$1" || true
}
INSTANCE_ID="$(imds instance-id)"
PUBLIC_IP="$(imds public-ipv4)"
log "instance=$INSTANCE_ID public_ip=${PUBLIC_IP:-none} api_host=${API_HOST:-unset}"

set_env_var() { # key value — replace, never duplicate, so re-runs stay clean
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp="$(mktemp)"
  grep -v "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

ensure_aws_cli() {
  command -v aws >/dev/null 2>&1 && return 0
  log "installing AWS CLI v2"
  local arch="aarch64" tmp
  [ "$(uname -m)" = "x86_64" ] && arch="x86_64"
  tmp="$(mktemp -d)"
  curl -fsSL --retry 3 -o "$tmp/awscliv2.zip" \
    "https://awscli.amazonaws.com/awscli-exe-linux-${arch}.zip" || die "aws cli download failed"
  unzip -q "$tmp/awscliv2.zip" -d "$tmp"
  "$tmp/aws/install" --update >/dev/null
  rm -rf "$tmp"
}

# ---------------------------------------------------------------------------
# 1. swap — insurance, not a crutch. The recommended GGUF setup measured ~1.0 GB
#    RSS on a 2 GiB instance, so swap just converts a spike into latency instead
#    of an OOM kill (and gives the PyTorch/docker build room to breathe).
# ---------------------------------------------------------------------------
if [ "${SWAP_GB}" -gt 0 ] && ! swapon --show | grep -q '/swapfile'; then
  log "creating ${SWAP_GB}G swapfile"
  fallocate -l "${SWAP_GB}G" /swapfile 2>/dev/null \
    || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -q -w vm.swappiness=10        # keep the weights resident, not swapped
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
else
  log "swap already configured (or disabled)"
fi

# ---------------------------------------------------------------------------
# 2. packages (certbot is installed on demand by loveai-setup-tls.sh, so a repo
#    without it cannot break the bootstrap)
# ---------------------------------------------------------------------------
log "installing packages"
dnf -y install --setopt=install_weak_deps=False \
  nginx curl unzip tar gzip openssl jq shadow-utils procps-ng docker >/dev/null
systemctl enable --now docker >/dev/null 2>&1 || warn "docker enable failed (docker mode unavailable)"

# ---------------------------------------------------------------------------
# 3. service account
# ---------------------------------------------------------------------------
id loveai >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/loveai --shell /sbin/nologin loveai
usermod -aG docker loveai 2>/dev/null || true

# ---------------------------------------------------------------------------
# 4. deploy bundle: helper scripts + systemd units + nginx configs
#    (ml/aws/bin, ml/aws/systemd, ml/aws/nginx — built and uploaded by the
#    playbook step "build the deploy bundle")
# ---------------------------------------------------------------------------
install_bundle() {
  local tmp
  tmp="$(mktemp -d)"
  ensure_aws_cli
  log "fetching deploy bundle $DEPLOY_BUNDLE_URI"
  aws s3 cp "$DEPLOY_BUNDLE_URI" "$tmp/loveai-deploy.tar.gz" --only-show-errors || return 1
  tar -xzf "$tmp/loveai-deploy.tar.gz" -C "$tmp" || return 1
  [ -d "$tmp/bin" ] || return 1
  install -m 0755 "$tmp"/bin/loveai-*.sh /usr/local/bin/
  install -m 0644 "$tmp"/systemd/*.service /etc/systemd/system/
  install -m 0644 "$tmp"/nginx/loveai-api.https.conf /opt/loveai/nginx/
  install -m 0644 "$tmp"/nginx/loveai-api.http.conf /etc/nginx/conf.d/loveai-api.conf
  systemctl daemon-reload
  log "deploy bundle installed"
  rm -rf "$tmp"
}

if [ -n "$DEPLOY_BUNDLE_URI" ]; then
  install_bundle || warn "deploy bundle install failed — see the manual commands below"
else
  warn "DEPLOY_BUNDLE_URI is empty: helper scripts/units/nginx confs are NOT installed."
fi
if [ ! -x /usr/local/bin/loveai-start-llama.sh ]; then
  warn "install the artifacts from the repo, then re-run with FORCE=1:"
  warn "  scp -r ml/aws/bin ml/aws/nginx ml/aws/systemd ec2-user@\$HOST:/tmp/loveai-artifacts/"
  warn "  sudo install -m755 /tmp/loveai-artifacts/bin/loveai-*.sh /usr/local/bin/"
  warn "  sudo install -m644 /tmp/loveai-artifacts/systemd/*.service /etc/systemd/system/ && sudo systemctl daemon-reload"
  warn "  sudo install -m644 /tmp/loveai-artifacts/nginx/loveai-api.https.conf /opt/loveai/nginx/"
  warn "  sudo install -m644 /tmp/loveai-artifacts/nginx/loveai-api.http.conf /etc/nginx/conf.d/loveai-api.conf"
fi

# ---------------------------------------------------------------------------
# 5. llama.cpp — prebuilt release (no compiling on a 2 vCPU box)
# ---------------------------------------------------------------------------
install_llama_cpp() {
  local arch asset url tmp dir
  case "$(uname -m)" in
    aarch64 | arm64) arch="arm64" ;;
    x86_64)          arch="x64" ;;
    *) die "unsupported architecture $(uname -m)" ;;
  esac
  asset="llama-${LLAMA_CPP_VERSION}-bin-ubuntu-${arch}.tar.gz"
  url="https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/${asset}"
  tmp="$(mktemp -d)"
  log "downloading $asset"
  curl -fL --retry 3 --retry-delay 2 -o "$tmp/llama.tar.gz" "$url" || die "download failed: $url"
  tar -xzf "$tmp/llama.tar.gz" -C "$tmp"
  dir="$(find "$tmp" -maxdepth 2 -name llama-server -type f -printf '%h\n' | head -1)"
  [ -n "$dir" ] || die "llama-server not found inside $asset"
  rm -rf /opt/llama.cpp && mkdir -p /opt/llama.cpp
  cp -a "$dir"/. /opt/llama.cpp/
  chmod 0755 /opt/llama.cpp/llama-server
  ln -sf /opt/llama.cpp/llama-server /usr/local/bin/llama-server
  # Shared libs live next to the binary; make the loader find them via the symlink too.
  echo "/opt/llama.cpp" > /etc/ld.so.conf.d/loveai-llama.conf
  ldconfig
  rm -rf "$tmp"
  log "llama-server: $(/usr/local/bin/llama-server --version 2>&1 | head -1)"
}
[ -x /usr/local/bin/llama-server ] || install_llama_cpp

# ---------------------------------------------------------------------------
# 6. model weights
# ---------------------------------------------------------------------------
fetch_model() {
  local out auth
  case "$MODEL_SOURCE" in
    s3)
      [ -n "$MODEL_BUCKET" ] || die "MODEL_SOURCE=s3 but MODEL_BUCKET is empty"
      ensure_aws_cli
      if [ -n "$MODEL_FILE" ]; then
        log "s3 cp s3://$MODEL_BUCKET/$MODEL_PREFIX/$MODEL_FILE"
        aws s3 cp "s3://$MODEL_BUCKET/$MODEL_PREFIX/$MODEL_FILE" "$MODEL_DIR/$MODEL_FILE" --only-show-errors
      else
        log "s3 sync s3://$MODEL_BUCKET/$MODEL_PREFIX (only *.gguf)"
        aws s3 sync "s3://$MODEL_BUCKET/$MODEL_PREFIX" "$MODEL_DIR" \
          --exclude '*' --include '*.gguf' --only-show-errors
      fi
      ;;
    hf)
      [ -n "$HF_REPO" ] && [ -n "$HF_FILE" ] || die "MODEL_SOURCE=hf requires HF_REPO and HF_FILE"
      out="$MODEL_DIR/${MODEL_FILE:-$HF_FILE}"
      auth=()
      [ -n "$HF_TOKEN" ] && auth=(-H "Authorization: Bearer $HF_TOKEN")
      log "downloading https://huggingface.co/$HF_REPO/resolve/main/$HF_FILE"
      curl -fL --retry 3 --retry-delay 2 "${auth[@]}" -o "$out.part" \
        "https://huggingface.co/$HF_REPO/resolve/main/$HF_FILE?download=true" \
        || die "hugging face download failed"
      mv "$out.part" "$out"
      ;;
    none) log "MODEL_SOURCE=none — upload weights into $MODEL_DIR yourself" ;;
    *) die "unknown MODEL_SOURCE=$MODEL_SOURCE (s3|hf|none)" ;;
  esac
}
fetch_model

MODEL_PATH="$(ls -1t "$MODEL_DIR"/*.gguf 2>/dev/null | head -1 || true)"
if [ -n "$MODEL_PATH" ]; then
  SIZE_MB=$(du -m "$MODEL_PATH" | cut -f1)
  log "model: $MODEL_PATH (${SIZE_MB} MB) sha256=$(sha256sum "$MODEL_PATH" | cut -d' ' -f1)"
  [ "$SIZE_MB" -gt 100 ] || warn "model looks too small (${SIZE_MB} MB) — incomplete download?"
else
  warn "no .gguf in $MODEL_DIR — the service will start once weights are present"
fi
chown -R loveai:loveai /opt/loveai

# ---------------------------------------------------------------------------
# 7. API key — generated on the instance so the secret never reaches git,
#    Terraform state, user-data (readable via the console) or a chat transcript.
# ---------------------------------------------------------------------------
API_KEY_FILE="${API_KEY_FILE:-/etc/loveai/api-keys}"
if [ -z "$LLM_API_KEY" ]; then
  if [ -s "$API_KEY_FILE" ]; then
    LLM_API_KEY="$(head -n1 "$API_KEY_FILE")"
    log "reusing api key from $API_KEY_FILE"
  else
    LLM_API_KEY="sk-loveai-$(openssl rand -hex 24)"
    log "generated a new api key"
  fi
fi
printf '%s\n' "$LLM_API_KEY" > "$API_KEY_FILE"
chown loveai:loveai "$API_KEY_FILE"
chmod 0600 "$API_KEY_FILE"
# Persisted for the services (docker mode reads LLM_API_KEY from the env).
set_env_var API_KEY_FILE "$API_KEY_FILE"
set_env_var LLM_API_KEY "$LLM_API_KEY"
set_env_var MODEL_DIR "$MODEL_DIR"
set_env_var MERGED_DIR "$MERGED_DIR"
set_env_var API_PORT "$API_PORT"
set_env_var LLM_MODEL "$LLM_MODEL"
set_env_var CTX_SIZE "$CTX_SIZE"
set_env_var N_PARALLEL "$N_PARALLEL"
set_env_var N_THREADS "$N_THREADS"
set_env_var N_BATCH "$N_BATCH"
set_env_var UBATCH_SIZE "$UBATCH_SIZE"
[ -n "$API_HOST" ] && set_env_var API_HOST "$API_HOST"
chmod 0600 "$ENV_FILE"
log "api key stored at $API_KEY_FILE (prefix ${LLM_API_KEY:0:6}…)"

# ---------------------------------------------------------------------------
# 8. model server service
# ---------------------------------------------------------------------------
if [ -f /etc/systemd/system/loveai-llama.service ]; then
  log "starting loveai-llama.service"
  systemctl enable loveai-llama >/dev/null 2>&1 || warn "enable failed"
  systemctl restart loveai-llama || warn "start failed — journalctl -u loveai-llama -n 50"
else
  warn "loveai-llama.service not installed — skipping service start"
fi

# ---------------------------------------------------------------------------
# 9. nginx reverse proxy (HTTP now; HTTPS in step 10)
# ---------------------------------------------------------------------------
if [ -n "$API_HOST" ] && [ -f /opt/loveai/nginx/loveai-api.http.conf ]; then
  log "configuring nginx for $API_HOST"
  install -m 0644 /opt/loveai/nginx/loveai-api.http.conf /etc/nginx/conf.d/loveai-api.conf
  sed -i "s/__API_HOST__/${API_HOST}/g" /etc/nginx/conf.d/loveai-api.conf
  # The stock AL2023 server block also claims :80 default_server — disable it.
  if [ -f /etc/nginx/conf.d/default.conf ]; then
    mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.disabled
  fi
  if nginx -t; then
    systemctl enable --now nginx >/dev/null 2>&1 || warn "nginx enable failed"
    systemctl reload nginx || true
    log "nginx serving http://$API_HOST/ → 127.0.0.1:$API_PORT"
  else
    warn "nginx config test failed — not reloading"
  fi
else
  warn "nginx not configured (API_HOST empty or conf missing)"
fi

# ---------------------------------------------------------------------------
# 10. TLS once DNS points here (otherwise: run loveai-setup-tls.sh later)
# ---------------------------------------------------------------------------
if [ "${SKIP_TLS}" = "1" ] || [ -z "$LETSENCRYPT_EMAIL" ] || [ -z "$API_HOST" ]; then
  warn "TLS skipped (SKIP_TLS=$SKIP_TLS email=${LETSENCRYPT_EMAIL:+set} host=${API_HOST:-unset})"
elif [ -z "$PUBLIC_IP" ]; then
  warn "no public IPv4 — TLS skipped"
elif [ ! -x /usr/local/bin/loveai-setup-tls.sh ]; then
  warn "loveai-setup-tls.sh missing — install the deploy bundle, then run it manually"
else
  log "waiting for DNS $API_HOST → $PUBLIC_IP (max 10 min)"
  resolved=""
  for _ in $(seq 1 30); do
    resolved="$(getent hosts "$API_HOST" 2>/dev/null | awk '{print $1}' | head -1 || true)"
    [ "$resolved" = "$PUBLIC_IP" ] && break
    sleep 20
  done
  if [ "$resolved" = "$PUBLIC_IP" ]; then
    /usr/local/bin/loveai-setup-tls.sh || warn "TLS failed — re-run /usr/local/bin/loveai-setup-tls.sh"
  else
    warn "DNS mismatch (got '${resolved:-none}', want $PUBLIC_IP). Create the A record, then:"
    warn "  sudo /usr/local/bin/loveai-setup-tls.sh"
  fi
fi

# ---------------------------------------------------------------------------
# 11. self-check
# ---------------------------------------------------------------------------
log "waiting for the model server on 127.0.0.1:$API_PORT"
HEALTH=""
for _ in $(seq 1 60); do
  HEALTH="$(curl -fsS --max-time 5 "http://127.0.0.1:$API_PORT/health" 2>/dev/null || true)"
  [ -n "$HEALTH" ] && break
  sleep 5
done
[ -n "$HEALTH" ] && log "local /health → $HEALTH" \
  || warn "no local /health after 5 min — journalctl -u loveai-llama -n 80"

# ---------------------------------------------------------------------------
# 12. runbook + done marker
# ---------------------------------------------------------------------------
cat > /opt/loveai/README.txt <<RUNBOOK
loveAI persona inference host (${INSTANCE_ID:-unknown})
-------------------------------------------------------
model server : llama-server (GGUF) on 127.0.0.1:${API_PORT} — unit loveai-llama
public entry : nginx :80/:443 for ${API_HOST:-<API_HOST unset>}
model dir    : ${MODEL_DIR}
api key file : ${API_KEY_FILE}   (sudo cat it — never paste into chat or git)
config       : ${ENV_FILE}

daily commands
  systemctl status loveai-llama
  journalctl -u loveai-llama -f
  systemctl restart loveai-llama
  curl -s localhost:${API_PORT}/health
  curl -s localhost:${API_PORT}/metrics | head
  tail -f ${LOG_FILE}

tls:  sudo /usr/local/bin/loveai-setup-tls.sh ; sudo certbot renew --dry-run
model update: aws s3 cp s3://<bucket>/<key>/persona.gguf ${MODEL_DIR}/persona.gguf
              sudo systemctl restart loveai-llama
RUNBOOK

date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STATE_DIR/bootstrap.done"
cat <<SUMMARY

================= loveAI bootstrap complete =================
instance      : ${INSTANCE_ID:-unknown} (${PUBLIC_IP:-no public ip})
health (local): ${HEALTH:-<no response>}
health (https): ${API_HOST:+https://$API_HOST/health}
api key       : sudo cat ${API_KEY_FILE}
next
  1. DNS A record: ${API_HOST:-<API_HOST>} → ${PUBLIC_IP:-<elastic-ip>} (then re-run loveai-setup-tls.sh)
  2. Vercel env (Production + Preview), then redeploy:
       LLM_URL=https://${API_HOST:-api.loveai.example.com}
       LLM_CHAT_PATH=/v1/chat/completions
       LLM_MODEL=${LLM_MODEL}
       LLM_MOCK=false
       LLM_API_KEY=<contents of ${API_KEY_FILE}>
       LLM_TIMEOUT_MS=150000
  3. curl -s https://${API_HOST:-api.loveai.example.com}/health
=============================================================
SUMMARY
log "=== bootstrap done ==="
