###############################################################################
# loveAI — AWS deployment for the fine-tuned persona model (GGUF + llama.cpp)
#
# Creates: VPC + public subnet + IGW, security group (22 from your IP, 80/443
# public, port 8000 deliberately NOT open), IAM role for S3 model pull + SSM
# Session Manager, optional S3 bucket for weights and the deploy bundle, an
# Elastic IP, and an Amazon Linux 2023 instance running ml/aws/user-data.sh.
#
# Typical use:
#   cd ml/aws/terraform
#   cp terraform.tfvars.example terraform.tfvars   # edit ssh_cidr + api_host
#   terraform init && terraform apply
#
# Cost: t4g.small is free for 750 h/month through 2026-12-31 (AWS T4g free trial).
# Without the trial: instance $12.26/mo + gp3 $0.08/GB-mo + public IPv4 $3.60/mo.
# See ../DEPLOYMENT_PLAYBOOK.md §6 for the full table.
###############################################################################

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.60, < 7.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.tags
  }
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

# Amazon Linux 2023 via the public SSM parameter (no hardcoded AMI IDs).
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-${var.instance_architecture}"
}

locals {
  name        = var.name_prefix
  account_id  = data.aws_caller_identity.current.account_id
  az          = data.aws_availability_zones.available.names[0]
  ami_id      = var.ami_id != "" ? var.ami_id : data.aws_ssm_parameter.al2023.value
  model_bucket = var.create_model_bucket ? aws_s3_bucket.models[0].bucket : var.model_bucket

  tags = {
    Project   = "loveai"
    Component = "persona-inference"
    ManagedBy = "terraform"
  }

  # ---------------------------------------------------------------- bootstrap
  # /etc/loveai/deploy.env is written BEFORE the script runs, so these values win
  # over the in-script defaults (see ml/aws/user-data.sh "CONFIG" block).
  # NOTE: keep this heredoc flush-left — the LOVEAI_ENV terminator must sit at
  # column 0 for bash to close the heredoc.
  deploy_env = <<-ENV
    API_HOST=${var.api_host}
    API_PORT=${var.api_port}
    LETSENCRYPT_EMAIL=${var.letsencrypt_email}
    LLM_MODEL=${var.llm_model}
    MODEL_SOURCE=${var.model_source}
    MODEL_BUCKET=${local.model_bucket}
    MODEL_PREFIX=${var.model_prefix}
    HF_REPO=${var.hf_repo}
    HF_FILE=${var.hf_file}
    DEPLOY_BUNDLE_URI=${var.deploy_bundle_uri}
    MODEL_FILE=${var.model_file}
    CTX_SIZE=${var.ctx_size}
    N_PARALLEL=${var.n_parallel}
    N_THREADS=${var.n_threads}
    N_BATCH=${var.n_batch}
    UBATCH_SIZE=${var.ubatch_size}
    SWAP_GB=${var.swap_gb}
    SKIP_TLS=${var.letsencrypt_email == "" ? 1 : 0}
    LLAMA_CPP_VERSION=${var.llama_cpp_version}
  ENV

  # EC2 caps user data at 16 KB, so the bootstrap goes out gzipped+base64
  # (cloud-init detects the gzip magic). Assembled size: ~8.6 KB.
  user_data = <<-EOT
#!/bin/bash
set -euo pipefail
mkdir -p /etc/loveai /opt/loveai/models
cat > /etc/loveai/deploy.env <<'LOVEAI_ENV'
${local.deploy_env}
LOVEAI_ENV
chmod 700 /etc/loveai/deploy.env
${file("${path.module}/../user-data.sh")}
EOT
}

###############################################################################
# Network
###############################################################################

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-igw" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 1)
  availability_zone       = local.az
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.name}-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

###############################################################################
# Security group
#
# Only 22 (restricted to var.ssh_cidr), 80 and 443 are open. The model server
# binds 127.0.0.1:8000 and is reached exclusively through nginx, so port 8000 is
# never exposed — even by accident. SSH can be omitted entirely (leave ssh_cidr
# empty) and you can use SSM Session Manager instead: the instance role below
# grants the required permissions.
###############################################################################

resource "aws_security_group" "api" {
  name        = "${local.name}-api"
  description = "loveAI persona API: SSH (restricted), HTTP/HTTPS. Port 8000 stays private."
  vpc_id      = aws_vpc.main.id

  dynamic "ingress" {
    for_each = var.ssh_cidr == "" ? [] : [var.ssh_cidr]
    content {
      description = "SSH from operator CIDR only"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  ingress {
    description = "HTTP (ACME challenge + redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS - the public API endpoint"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "dnf, GitHub (llama.cpp), S3, HF, Lets Encrypt"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-api" }
}

###############################################################################
# Storage for weights + deploy bundle (optional: set create_model_bucket=false to
# reuse an existing bucket via var.model_bucket)
###############################################################################

resource "aws_s3_bucket" "models" {
  count         = var.create_model_bucket ? 1 : 0
  bucket        = var.model_bucket_name != "" ? var.model_bucket_name : "${local.name}-models-${local.account_id}"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "models" {
  count                   = var.create_model_bucket ? 1 : 0
  bucket                  = aws_s3_bucket.models[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "models" {
  count  = var.create_model_bucket ? 1 : 0
  bucket = aws_s3_bucket.models[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

###############################################################################
# IAM: read the weights/bundle from S3 + SSM Session Manager (keyless shell)
###############################################################################

data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${local.name}-instance"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
}

data "aws_iam_policy_document" "model_read" {
  statement {
    sid     = "ListModelBucket"
    actions = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [
      "arn:aws:s3:::${local.model_bucket}",
    ]
  }
  statement {
    sid     = "ReadModelObjects"
    actions = ["s3:GetObject"]
    resources = [
      "arn:aws:s3:::${local.model_bucket}/${var.model_prefix}/*",
      "arn:aws:s3:::${local.model_bucket}/deploy/*",
    ]
  }
}

resource "aws_iam_role_policy" "model_read" {
  name   = "${local.name}-model-read"
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.model_read.json
}

# Lets you use Session Manager / Run Command instead of SSH — the recommended way
# to read the generated API key off the box without opening port 22.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "${local.name}-instance"
  role = aws_iam_role.instance.name
}

###############################################################################
# SSH key (optional: set public_key_path to create one, or use an existing
# var.key_name, or neither and rely on Session Manager)
###############################################################################

resource "aws_key_pair" "deploy" {
  count      = var.public_key_path == "" ? 0 : 1
  key_name   = "${local.name}-deploy"
  public_key = file(pathexpand(var.public_key_path))
}

###############################################################################
# Instance
#
# t4g.small (Graviton2, 2 vCPU / 2 GiB) is the sweet spot: free for 750 h/month
# through 2026-12-31, and it comfortably serves the Q4_K_M GGUF build of the
# persona model (~1.0 GB RSS measured). Choose a larger type only for the
# PyTorch/safetensors container path — see the playbook §2/§4.
###############################################################################

resource "aws_instance" "api" {
  ami                    = local.ami_id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.api.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name
  key_name               = var.public_key_path != "" ? aws_key_pair.deploy[0].key_name : (var.key_name != "" ? var.key_name : null)

  user_data_base64 = base64gzip(local.user_data)
  user_data_replace_on_change = true

  # Burst credits: "unlimited" never throttles but can bill surplus CPU
  # ($0.04/vCPU-hour above baseline) if average utilisation stays above 40% for
  # 24 h. A personal chatbot is bursty and self-funds its credits; if you want a
  # hard $0 ceiling with no chance of surplus, set this to "standard" and accept
  # throttling instead. The CloudWatch alarm below warns before it matters.
  credit_specification {
    cpu_credits = var.cpu_credits
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    delete_on_termination = true
  }

  # IMDSv2 only: the bootstrap reads instance metadata with a session token.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  # Detailed monitoring is billed ($3.50/mo) — basic metrics are enough here.
  monitoring = false

  tags = { Name = "${local.name}-api" }

  lifecycle {
    # user_data changes roll the instance (see user_data_replace_on_change);
    # protect the volume holding the model from accidental clobbering.
    ignore_changes = [ami]
  }
}

resource "aws_eip" "api" {
  domain = "vpc"
  tags   = { Name = "${local.name}-api" }
}

resource "aws_eip_association" "api" {
  instance_id   = aws_instance.api.id
  allocation_id = aws_eip.api.id
}

###############################################################################
# Observability + spend guard rails
###############################################################################

resource "aws_sns_topic" "alerts" {
  count = var.alarm_email == "" ? 0 : 1
  name  = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# t4g.small baseline is 20% per vCPU (24 credits/hour earned). Draining credits
# means sustained inference — i.e. either real traffic or a runaway loop.
resource "aws_cloudwatch_metric_alarm" "cpu_credit_balance" {
  alarm_name          = "${local.name}-cpu-credit-balance-low"
  alarm_description   = "EC2 CPU credit balance low: sustained CPU above the t4g.small baseline (surplus charges possible in unlimited mode)."
  namespace           = "AWS/EC2"
  metric_name         = "CPUCreditBalance"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = var.cpu_credit_alarm_threshold
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = { InstanceId = aws_instance.api.id }

  alarm_actions = var.alarm_email == "" ? [] : [aws_sns_topic.alerts[0].arn]
  ok_actions    = var.alarm_email == "" ? [] : [aws_sns_topic.alerts[0].arn]
}

resource "aws_cloudwatch_metric_alarm" "status_check" {
  alarm_name          = "${local.name}-status-check-failed"
  alarm_description   = "Instance or system status check failed — the persona API is likely down."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = { InstanceId = aws_instance.api.id }

  alarm_actions = var.alarm_email == "" ? [] : [aws_sns_topic.alerts[0].arn]
}

# Budgets: the first two budgets per account are free. This is the guard rail
# that actually protects a $0-$5/month target.
resource "aws_budgets_budget" "monthly" {
  count        = var.alarm_email == "" ? 0 : 1
  name         = "${local.name}-monthly-budget"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alarm_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alarm_email]
  }
}
