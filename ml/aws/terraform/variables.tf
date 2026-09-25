###############################################################################
# loveAI persona model — Terraform variables
###############################################################################

# ---------------------------------------------------------------- naming/region
variable "name_prefix" {
  description = "Prefix for every resource name and the Name tag."
  type        = string
  default     = "loveai-persona"
}

variable "region" {
  description = "AWS region. Pick one close to your users and with t4g availability."
  type        = string
  default     = "us-east-1"
}

# ---------------------------------------------------------------- instance
variable "instance_type" {
  description = <<-DESC
    EC2 instance type. t4g.small (Graviton2, 2 vCPU / 2 GiB) is recommended:
    free for 750 h/month through 2026-12-31, and 2 GiB is enough for the Q4_K_M
    GGUF build. Use t4g.medium (4 GiB) or t3.medium for the PyTorch/container
    path; g4dn.xlarge only if you want GPU-grade latency (~$380/mo).
  DESC
  type        = string
  default     = "t4g.small"
}

variable "instance_architecture" {
  description = "arm64 (Graviton, recommended) or x86_64 — selects the Amazon Linux 2023 AMI and the llama.cpp build."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.instance_architecture)
    error_message = "instance_architecture must be arm64 or x86_64."
  }
}

variable "ami_id" {
  description = "Override the Amazon Linux 2023 AMI (empty = latest AL2023 kernel 6.1 for the chosen architecture)."
  type        = string
  default     = ""
}

variable "root_volume_gb" {
  description = <<-DESC
    Root volume size (gp3, encrypted). Budget: OS ~2 GB + llama.cpp ~0.4 GB +
    GGUF model 0.8-1.1 GB + swap + logs. 16 GB (= $1.28/mo) is plenty; the
    container path with a PyTorch image needs 25-30 GB.
  DESC
  type        = number
  default     = 16
}

variable "cpu_credits" {
  description = "Burstable CPU mode: unlimited (default, no throttling, possible surplus charges) or standard (hard $0 ceiling, throttles at baseline)."
  type        = string
  default     = "unlimited"

  validation {
    condition     = contains(["unlimited", "standard"], var.cpu_credits)
    error_message = "cpu_credits must be \"unlimited\" or \"standard\"."
  }
}

variable "swap_gb" {
  description = "Swapfile size in GB (0 disables). Insurance against a spike rather than a crutch — the GGUF setup measured ~1.0 GB RSS."
  type        = number
  default     = 2
}

# ---------------------------------------------------------------- access
variable "ssh_cidr" {
  description = "CIDR allowed to SSH. Empty = no SSH rule at all (use SSM Session Manager: aws ssm start-session --target <id>). Never leave this at 0.0.0.0/0."
  type        = string
  default     = ""

  validation {
    condition     = var.ssh_cidr == "" || can(cidrnetmask(var.ssh_cidr)) || can(cidrhost(var.ssh_cidr, 0))
    error_message = "ssh_cidr must be empty or a valid CIDR such as 203.0.113.7/32."
  }
}

variable "public_key_path" {
  description = "Path to a public key to create a key pair from (e.g. ~/.ssh/id_ed25519.pub). Empty = no key pair (SSM only)."
  type        = string
  default     = ""
}

variable "key_name" {
  description = "Name of an existing EC2 key pair to reuse when public_key_path is empty."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------- network edge
variable "api_host" {
  description = "Public DNS name for the API (nginx server_name + Let's Encrypt). Create an A record for it pointing at the Elastic IP output."
  type        = string
  default     = "api.loveai.damnankur.com"
}

variable "letsencrypt_email" {
  description = "Contact address for Let's Encrypt. Empty = skip TLS entirely (HTTP only, TLS skipped in the bootstrap)."
  type        = string
  default     = ""
}

variable "api_port" {
  description = "Loopback port the model server listens on (never exposed publicly; nginx proxies to it)."
  type        = number
  default     = 8000
}

# ---------------------------------------------------------------- model source
variable "model_source" {
  description = "s3 | hf | none — where the bootstrap fetches the GGUF weights from."
  type        = string
  default     = "s3"

  validation {
    condition     = contains(["s3", "hf", "none"], var.model_source)
    error_message = "model_source must be s3, hf or none."
  }
}

variable "create_model_bucket" {
  description = "Create an S3 bucket for the weights + deploy bundle. false = reuse var.model_bucket."
  type        = bool
  default     = true
}

variable "model_bucket_name" {
  description = "Explicit bucket name when create_model_bucket = true (empty = <name_prefix>-models-<account id>)."
  type        = string
  default     = ""
}

variable "model_bucket" {
  description = "Existing bucket name when create_model_bucket = false."
  type        = string
  default     = ""
}

variable "model_prefix" {
  description = "Key prefix holding the .gguf weights inside the bucket."
  type        = string
  default     = "models/persona"
}

variable "model_file" {
  description = "Exact filename to download (empty = sync every *.gguf under model_prefix)."
  type        = string
  default     = "persona-q4_k_m.gguf"
}

variable "hf_repo" {
  description = "Hugging Face repo id when model_source = hf (e.g. you/loveai-persona-gguf)."
  type        = string
  default     = ""
}

variable "hf_file" {
  description = "Filename inside hf_repo when model_source = hf."
  type        = string
  default     = ""
}

variable "deploy_bundle_uri" {
  description = <<-DESC
    s3:// URI of loveai-deploy.tar.gz (bin/ + systemd/ + nginx/ from ml/aws).
    The bootstrap installs helper scripts, systemd units and nginx configs from it.
    Build + upload before apply:
      tar czf loveai-deploy.tar.gz -C ml/aws bin nginx systemd
      aws s3 cp loveai-deploy.tar.gz s3://<bucket>/deploy/loveai-deploy.tar.gz
    Empty = the instance bootstraps the model server but you must install the
    artifacts by hand (the bootstrap prints the exact commands).
  DESC
  type        = string
  default     = ""
}

variable "llama_cpp_version" {
  description = "Pinned llama.cpp release tag for the prebuilt arm64/x64 binaries (e.g. b10941)."
  type        = string
  default     = "b10941"
}

# ---------------------------------------------------------------- serving knobs
variable "llm_model" {
  description = "Model alias reported by the API and set as LLM_MODEL in Vercel (informational; the server ignores it)."
  type        = string
  default     = "loveai-persona-1b"
}

variable "ctx_size" {
  description = <<-DESC
    KV context in tokens. The persona/RAG system prompt measured ~1060 tokens and
    the client allows 12 history turns + 220 output tokens, so >= 4096 is needed;
    6144 leaves headroom for two concurrent conversations (~180 MB of KV).
  DESC
  type        = number
  default     = 6144
}

variable "n_parallel" {
  description = "Server slots. Each slot keeps its own KV prefix cache, so a second user does not evict the first one's cached persona prompt."
  type        = number
  default     = 2
}

variable "n_threads" {
  description = "CPU threads for generation. 0 = auto (nproc, i.e. 2 on t4g.small)."
  type        = number
  default     = 0
}

variable "n_batch" {
  description = "Logical batch size for prompt processing."
  type        = number
  default     = 512
}

variable "ubatch_size" {
  description = "Physical batch size for prompt processing (lower = less RAM per token)."
  type        = number
  default     = 256
}

# ---------------------------------------------------------------- guard rails
variable "alarm_email" {
  description = "Email for CloudWatch alarms + the monthly budget. Empty = no alarms, no budget, no SNS."
  type        = string
  default     = ""
}

variable "cpu_credit_alarm_threshold" {
  description = "Alarm when CPUCreditBalance drops below this (t4g.small earns 24 credits/hour)."
  type        = number
  default     = 40
}

variable "monthly_budget_usd" {
  description = "Monthly cost budget for the account, in USD."
  type        = number
  default     = 5
}

# ---------------------------------------------------------------- network sizing
variable "vpc_cidr" {
  description = "CIDR for the dedicated VPC (10.42.0.0/16 gives plenty of room and avoids collisions with defaults)."
  type        = string
  default     = "10.42.0.0/16"
}
