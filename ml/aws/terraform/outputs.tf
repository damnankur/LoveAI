###############################################################################
# loveAI persona model — Terraform outputs
#
# Everything the next steps (DNS, TLS, Vercel env) need, without ever printing a
# secret: the API key is generated ON the instance and is not in state.
###############################################################################

output "instance_id" {
  description = "EC2 instance id."
  value       = aws_instance.api.id
}

output "elastic_ip" {
  description = "Elastic IP — point your DNS A record at this."
  value       = aws_eip.api.public_ip
}

output "api_endpoint" {
  description = "Public HTTPS endpoint to put in LLM_URL once DNS + TLS are done."
  value       = "https://${var.api_host}"
}

output "health_url" {
  description = "Liveness endpoint (public, no auth)."
  value       = "https://${var.api_host}/health"
}

output "dns_record" {
  description = "DNS record to create (Route 53 or your registrar)."
  value       = "A  ${var.api_host}  ->  ${aws_eip.api.public_ip}"
}

output "model_bucket" {
  description = "S3 bucket holding the GGUF weights and the deploy bundle."
  value       = local.model_bucket
}

output "ssm_session_command" {
  description = "Shell on the box without SSH (bootstrap log, service status, API key)."
  value       = "aws ssm start-session --target ${aws_instance.api.id} --region ${var.region}"
}

output "read_api_key_command" {
  description = "Retrieve the generated API key (never log or commit it)."
  value       = "aws ssm send-command --instance-ids ${aws_instance.api.id} --document-name AWS-RunShellScript --parameters 'commands=cat /etc/loveai/api-keys' --query 'Command.CommandId' --output text"
}

output "vercel_env" {
  description = <<-DESC
    Values to paste into the Vercel dashboard (Settings → Environment Variables,
    Production + Preview), then redeploy. LLM_API_KEY is NOT here on purpose —
    read it from the instance with read_api_key_command.
  DESC
  value = {
    LLM_URL       = "https://${var.api_host}"
    LLM_CHAT_PATH = "/v1/chat/completions"
    LLM_MODEL     = var.llm_model
    LLM_MOCK      = "false"
    LLM_TIMEOUT_MS = "150000"
  }
}

output "tls_command" {
  description = "Run after the DNS record resolves to the Elastic IP (also automatic on boot when letsencrypt_email is set)."
  value       = "sudo /usr/local/bin/loveai-setup-tls.sh"
}

output "ssh_command" {
  description = "SSH command, when an SSH rule + key pair exist."
  value       = var.public_key_path == "" && var.key_name == "" ? "(no key pair configured — use ssm_session_command)" : "ssh ec2-user@${aws_eip.api.public_ip}"
}
