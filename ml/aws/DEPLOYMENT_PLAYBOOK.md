# loveAI Persona Model — AWS Deployment Playbook

Deploys the fine-tuned Gemma-3-1B persona model (output of `kaggle/loveai-persona-train.ipynb`) behind a public HTTPS endpoint that `web/lib/llm.ts` calls via `LLM_URL` + `LLM_API_KEY`.

## 0. Current status / resume

**Status (2026-09-16): NOT deployed. The blocker is the model artifact — no `persona-merged/` and no `.gguf` exist yet** (`ml/models/kaggle-output/` is empty; no `*.gguf` anywhere in the repo). Training is still pending, so steps 5–8 below cannot run.

Verified ready (recon ran `init`/`plan` only — **no `apply`, no AWS resources created**):

| Item | State |
|---|---|
| AWS creds | resolve (account `527930216224`, root) |
| `terraform init` | OK — aws provider v6.64.0 |
| `terraform plan` | **15 to add, 0 to change, 0 to destroy**, no errors |
| S3 bucket | `loveai-persona-models-527930216224` exists; `deploy/loveai-deploy.tar.gz` (6.4 KB) present |
| Deploy bundle | built at `ml/aws/loveai-deploy.tar.gz` (6.4 KB, byte-identical to S3 copy) |
| `terraform.tfvars` | free-tier path: `t4g.small` / arm64 / `us-east-1` / `create_model_bucket = false` |
| TLS + alarms | **disabled** — `letsencrypt_email` and `alarm_email` are empty (HTTP-only, no budget/alerts) |
| HF Space | demo path only (ZeroGPU, 5 GPU-min/day) — not production |

Two `main.tf` bugs found by `plan` and fixed during recon: an apostrophe/em-dash in SG `description` (AWS regex rejects them) and a wrong AMI SSM path (needs the `/aws/service/ami-amazon-linux-latest/` prefix).

**Resume sequence once `persona-merged/` exists:**

1. **Convert to GGUF** (on the GPU box — never on `t4g.small`):
   `python llama.cpp/convert_hf_to_gguf.py ml/models/persona-merged --outfile persona-q4_k_m.gguf --outtype q4_k_m`
2. **Upload to S3:** `aws s3 cp persona-q4_k_m.gguf s3://loveai-persona-models-527930216224/models/persona/`
   (and refresh the bundle: `tar czf ml/aws/loveai-deploy.tar.gz -C ml/aws bin nginx systemd` → `aws s3 cp ml/aws/loveai-deploy.tar.gz s3://loveai-persona-models-527930216224/deploy/`)
3. **Apply infra:** `cd ml/aws/terraform && terraform apply` (15 resources, ~2–3 min).
4. **DNS:** create the A record from `terraform output dns_record`, then `sudo /usr/local/bin/loveai-setup-tls.sh` on the box (or set `letsencrypt_email` and re-apply).
5. **Vercel env** (Production + Preview) from `terraform output vercel_env`: `LLM_URL`, `LLM_CHAT_PATH`, `LLM_MODEL`, `LLM_MOCK=false`, `LLM_TIMEOUT_MS`; plus `LLM_API_KEY` read off the instance via `read_api_key_command`. Redeploy.
6. **Verify:** `curl https://api.loveai.damnankur.com/health` → `{"status":"ok",...}`; then `curl https://loveai-brown.vercel.app/api/health` → `llm: "http https://api.loveai.damnankur.com"` (the field reports `http <url>`, not `"available"` as §9 states).

## Table of contents

1. [Architecture: two paths](#1-architecture-two-paths)
2. [Which path / instance size?](#2-which-path--instance-size)
3. [Cost table](#3-cost-table)
4. [Prerequisites](#4-prerequisites)
5. [Convert the Kaggle model to GGUF](#5-convert-the-kaggle-model-to-gguf)
6. [Deploy with Terraform (recommended)](#6-deploy-with-terraform-recommended)
7. [Manual deploy (no Terraform)](#7-manual-deploy-no-terraform)
8. [Wire Vercel → AWS](#8-wire-vercel--aws)
9. [Verify](#9-verify)
10. [Operating runbook](#10-operating-runbook)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture: two paths

```
                  Kaggle notebook
                  persona-merged/  (safetensors, ~3 GB)
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
   Path A: GGUF + llama.cpp        Path B: Docker (PyTorch serve.py)
   convert_hf_to_gguf.py            ml/aws/Dockerfile.aws
   persona-q4_k_m.gguf (~0.8 GB)    ml/aws/serve.py (API key auth)
          │                               │
          ▼                               ▼
   t4g.small / t4g.medium     t4g.medium or larger
   (2 GiB+, CPU)              (4 GiB+, for fp16 safetensors)
   llama-server on :8000      FastAPI serve.py on :8000
   --api-key-file             LLM_API_KEY env
          │                               │
          ▼                               ▼
          └───────────────┬───────────────┘
                          ▼
      nginx :80 → 301 → :443 (Let's Encrypt TLS)
                          │
          https://api.loveai.damnankur.com
                          │
                          ▼
   Vercel Next.js  (web/lib/llm.ts POSTs /v1/chat/completions)
```

- **Path A (GGUF)** is the $0 free-tier path. `t4g.small` (2 vCPU / 2 GiB) serves a `Q4_K_M` GGUF. llama.cpp handles auth via `--api-key-file`, so no application code touches the secret.
- **Path B (Docker/PyTorch)** uses `ml/aws/serve.py` (which *does* check `LLM_API_KEY` on `/v1/*`). Needed when you want the exact unquantized weights or a larger model — needs >= 4 GiB RAM (fp16 saftensors ≈ 2.7 GB RSS).

Only enable **one** systemd unit: `loveai-llama` (Path A) or `loveai-api` (Path B). See `ml/aws/systemd/*`.

---

## 2. Which path / instance size?

| Instance       | RAM   | Path A (GGUF) | Path B (Docker) | Free tier               |
|---|---|---|---|---|
| `t4g.small`    | 2 GiB | yes (Q4_K_M)  | no (preflight refuses fp16) | 750 h/mo free until 2026-12-31 |
| `t4g.medium`   | 4 GiB | yes           | yes (fp16)      | — (~$15/mo)             |
| `t3.medium`    | 4 GiB | yes           | yes (fp16)      | — (~$15/mo)             |
| `g4dn.xlarge`  | 16 GiB| yes (GPU)     | yes (GPU)       | — (~$380/mo)            |

**Default recommendation:** `t4g.small` (Graviton2) + GGUF `Q4_K_M` + Path A. The persona model measured ~1.0 GB RSS on a 2 GiB instance, leaving room for swap + llama.cpp buffers.

---

## 3. Cost table

| Resource               | Free tier                         | After free tier (list, us-east-1) |
|---|---|---|
| `t4g.small` instance   | **750 h/mo free through 2026-12-31** (AWS T4g free trial) | $12.26 / mo |
| gp3 root (16 GB)       | 30 GB EBS free (1 yr)             | $1.28 / mo |
| Elastic IP (held / 1 mo) | — | $3.60 / mo (attached = $0) |
| S3 model bucket        | 5 GB standard free                | ~$0.007 / GB-mo |
| **Total (free tier)**  | **$0** (trial)                    | **$17.14/mo** (or $0 with standard credits / always-free if you stay within trial) |

A `$5/month` account budget is wired in `terraform/main.tf` — set `alarm_email` to get notified at 50% and 100%.

---

## 4. Prerequisites

```bash
# 1. AWS CLI (authenticated)
aws configure

# 2. Terraform
#   install via https://developer.hashicorp.com/terraform/downloads

# 3. SSH key (optional — SSM Session Manager works without it)
ssh-keygen -t ed25519 -f ~/.ssh/loveai-deploy -N ""
```

You need a domain (`loveai.damnankur.com`) with an A record. The Terraform output prints the IP to point it at.

---

## 5. Convert the Kaggle model to GGUF

Kaggle outputs `persona-merged/` (HuggingFace safetensors, ~3 GB). You need a quantized GGUF to run on a 2 GiB box.

**On your local GPU machine or a Kaggle code cell:**

```bash
# Get llama.cpp (provides convert_hf_to_gguf.py + llama-quantize):
git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp
pip install -r requirements.txt

# 1) HF safetensors -> GGUF (f16)
python convert_hf_to_gguf.py /kaggle/working/persona-merged \
  --outfile persona-f16.gguf --outtype f16

# 2) Quantize to Q4_K_M (~0.8 GB, the t4g.small target)
./llama-quantize persona-f16.gguf persona-q4_k_m.gguf Q4_K_M
```

Upload to S3:

```bash
aws s3 cp persona-q4_k_m.gguf s3://loveai-persona-models-<acct>/models/persona/
```

> `Q4_K_M` is the recommended quantization: ~6% accuracy drop vs fp16, runs at ~3-8 tok/s on Graviton2. `Q8_0` is closer to base quality but ~1.5 GB (still fits t4g.small with 2 GB swap).

---

## 6. Deploy with Terraform (recommended)

```bash
cd ml/aws/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
region            = "us-east-1"        # or ap-south-1 (Mumbai) / ap-northeast-1 (Tokyo)
name_prefix       = "loveai-persona"
instance_type     = "t4g.small"        # free tier (through 2026-12-31)
instance_architecture = "arm64"        # Graviton2 → matches t4g

api_host          = "api.loveai.damnankur.com"
letsencrypt_email = "you@example.com"   # empty = HTTP only, no TLS

ssh_cidr          = "203.0.113.7/32"    # your IP, or "" to use SSM only
public_key_path   = "~/.ssh/loveai-deploy.pub"

model_source      = "s3"
create_model_bucket = true
model_bucket_name  = "loveai-persona-models"       # your unique name
model_prefix       = "models/persona"
model_file         = "persona-q4_k_m.gguf"

deploy_bundle_uri = "s3://loveai-persona-models-<acct>/deploy/loveai-deploy.tar.gz"
alarm_email       = "you@example.com"     # budgets + CPU alerts

# Leave serving knobs as defaults unless you know what you're doing:
ctx_size     = 6144
n_parallel   = 2
n_threads    = 0    # auto = nproc
```

**Step 1 — build + upload the deploy bundle** (helper scripts, systemd units, nginx confs):

```bash
# from the repo root — the tar must contain bin/, nginx/, systemd/ at top level
# (user-data.sh extracts it and installs "$tmp"/bin/*.sh etc.)
tar czf ml/aws/loveai-deploy.tar.gz -C ml/aws bin nginx systemd
aws s3 cp ml/aws/loveai-deploy.tar.gz s3://loveai-persona-models-<acct>/deploy/loveai-deploy.tar.gz
```

**Step 2 — upload the model:**

```bash
aws s3 cp persona-q4_k_m.gguf s3://loveai-persona-models-<acct>/models/persona/
```

**Step 3 — deploy:**

```bash
cd ml/aws/terraform
terraform init
terraform apply
```

Terraform will:
- Create the VPC, subnet, IGW, security group (only 22/80/443 open), EIP
- Write `/etc/loveai/deploy.env` on the instance
- Run `user-data.sh` which: installs swap, packages, creates the `loveai` user, pulls the deploy bundle, installs llama.cpp, downloads the GGUF from S3, generates an API key, starts `loveai-llama.service`, configures nginx, and attempts TLS if DNS resolves
- Output the public IP and `api_endpoint`

---

## 7. Manual deploy (no Terraform)

If you prefer to manage the EC2 yourself:

```bash
# 1. Launch Amazon Linux 2023 (arm64), t4g.small, with your SSH key.
#    Security group: 22 (your IP), 80, 443.

# 2. Copy assets onto the box
scp -r ml/aws/bin ml/aws/nginx ml/aws/systemd ec2-user@HOST:/tmp/loveai-artifacts/
ssh ec2-user@HOST

# 3. Install everything
sudo INSTALL=1 bash /tmp/loveai-artifacts/bin/loveai-install-manual.sh   # (or just run user-data.sh with FORCE=1)
# or: sudo bash -c 'curl -fsSL https://raw.githubusercontent.com/damnankur/LoveAI/main/ml/aws/user-data.sh \
#    | ENV_FILE=/etc/loveai/deploy.env MODEL_SOURCE=s3 MODEL_BUCKET=<bucket> MODEL_FILE=persona-q4_k_m.gguf API_HOST=api.loveai.damnankur.com FORCE=1 bash'

# 4. Install the deploy bundle
sudo install -m0755 /tmp/loveai-artifacts/bin/loveai-*.sh /usr/local/bin/
sudo install -m0644 /tmp/loveai-artifacts/systemd/*.service /etc/systemd/system/
sudo install -m0644 /tmp/loveai-artifacts/nginx/loveai-api.http.conf /etc/nginx/conf.d/loveai-api.conf
sudo install -m0644 /tmp/loveai-artifacts/nginx/loveai-api.https.conf /opt/loveai/nginx/
sudo systemctl daemon-reload

# 5. Fetch the model + start
sudo aws s3 cp s3://<bucket>/models/persona/persona-q4_k_m.gguf /opt/loveai/models/
sudo chown -R loveai:loveai /opt/loveai
sudo systemctl enable --now loveai-llama
sudo systemctl enable --now nginx

# 6. TLS (after DNS A record points to the instance IP)
sudo /usr/local/bin/loveai-setup-tls.sh
```

---

## 8. Wire Vercel → AWS

In the **Vercel dashboard** (Settings → Environment Variables, set for Production + Preview):

| Key              | Value |
|---|---|
| `LLM_URL`        | `https://api.loveai.damnankur.com` |
| `LLM_CHAT_PATH`  | `/v1/chat/completions` |
| `LLM_MODEL`      | `loveai-persona-1b` (informational) |
| `LLM_MOCK`       | `false` |
| `LLM_API_KEY`    | *(contents of `/etc/loveai/api-keys` on the instance)* |
| `LLM_TIMEOUT_MS` | `150000` (150 s — CPU inference is slow) |

Get the API key from the instance (never paste it into git or chat):

```bash
aws ssm send-command \
  --instance-ids $(terraform output -raw instance_id) \
  --document-name AWS-RunShellScript \
  --parameters 'commands=sudo cat /etc/loveai/api-keys' \
  --query 'Command.CommandId' --output text
```

Or SSH: `ssh ec2-user@<ip>` then `sudo cat /etc/loveai/api-keys`.

Redeploy the Vercel app after setting env vars.

---

## 9. Verify

```bash
# Health (no auth)
curl -fsS https://api.loveai.damnankur.com/health
# → {"status":"ok","device":"cpu","model_loaded":true,"auth":"enabled"}

# Chat (with the key)
KEY=$(sudo cat /etc/loveai/api-keys)
curl -fsS -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"I had a long day and I am feeling drained."}],"max_tokens":128}' \
  https://api.loveai.damnankur.com/v1/chat/completions
```

Then visit the live Vercel app, complete the persona questionnaire, and check that `llm: "available"` (mock off) in `https://loveai-brown.vercel.app/api/health`.

---

## 10. Operating runbook

```bash
# Tail the model server logs
journalctl -u loveai-llama -f

# Restart after a model update
aws s3 cp persona-q4_k_m.gguf s3://<bucket>/models/persona/   # (new version)
# then on the instance:
sudo aws s3 cp s3://<bucket>/models/persona/persona-q4_k_m.gguf /opt/loveai/models/
sudo chown loveai:loveai /opt/loveai/models/persona-q4_k_m.gguf
sudo systemctl restart loveai-llama

# Rotate the API key
sudo loveai-rotate-key.sh     # (add to bin/ or: new=$(openssl rand -hex 24); echo "sk-loveai-$new" | sudo tee /etc/loveai/api-keys; sudo systemctl restart loveai-llama)

# Renew TLS (certbot)
sudo /usr/local/bin/loveai-setup-tls.sh
sudo /usr/bin/systemctl status certbot-renew.timer   # AL2023 ships this
```

The full runbook is also written to `/opt/loveai/README.txt` by the bootstrap.

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `health` returns `model_loaded: false` | llama-server couldn't find the .gguf | `sudo -u loveai ls /opt/loveai/models/*.gguf`; re-upload with `aws s3 cp` |
| `503 model not loaded` (Docker path) | serve.py can't find the model dir | Check `MERGED_DIR` mount in `loveai-start-api.sh` |
| `401 invalid or missing API key` | key mismatch between Vercel and instance | Rotate: `sudo cat /etc/loveai/api-keys`, paste the new value into Vercel env, redeploy |
| `OOM killed` | fp16 safetensors on a 2 GiB box (Path B) | Switch to Path A (GGUF + llama-server) — see §2 |
| `curl: (7) Failed to connect` | nginx not running or SG blocks 443 | `sudo systemctl status nginx`; check SG allows 443 from `0.0.0.0/0` |
| TLS cert fails | DNS A record not pointed at the EIP | `dig api.loveai.damnankur.com`; create the A record, then `sudo /usr/local/bin/loveai-setup-tls.sh` |
| Slow first request (~30-60 s) | llama-server warmup / cold load | Normal; first request loads weights into RAM. Warm the cache with `/health` checks. |
