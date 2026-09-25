region            = "us-east-1"
name_prefix       = "loveai-persona"

# --- instance ---
instance_type          = "t4g.small"
instance_architecture  = "arm64"
root_volume_gb         = 16
cpu_credits            = "standard"
swap_gb                = 2

# --- access ---
ssh_cidr        = ""
public_key_path = ""
key_name        = ""

# --- public endpoint ---
api_host          = "api.loveai.damnankur.com"
letsencrypt_email = ""

# --- model weights ---
model_source         = "s3"
create_model_bucket  = false
model_bucket         = "loveai-persona-models-527930216224"
model_prefix         = "models/persona"
model_file           = "persona-q4_k_m.gguf"

# --- deploy bundle ---
deploy_bundle_uri = "s3://loveai-persona-models-527930216224/deploy/loveai-deploy.tar.gz"

# --- serving ---
llm_model   = "loveai-persona-1b"
ctx_size    = 6144
n_parallel  = 2
n_threads   = 0

# --- guard rails ---
alarm_email                = ""
monthly_budget_usd         = 5
cpu_credit_alarm_threshold = 40
