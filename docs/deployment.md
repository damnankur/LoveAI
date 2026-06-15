# AWS Deployment Guide

## Prerequisites

- AWS CLI configured
- Docker installed
- Terraform (optional)

## Infrastructure

### 1. S3 Bucket
- Store training data and model weights
- Bucket name: `loveai-models-{env}`

### 2. SageMaker
- Fine-tuning jobs
- Endpoint for inference

### 3. EC2
- Backend API server
- PostgreSQL database

## Deployment Steps

```bash
# Build Docker image
docker build -t loveai-server ./server

# Push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin {account}.dkr.ecr.{region}.amazonaws.com
docker tag loveai-server:latest {account}.dkr.ecr.{region}.amazonaws.com/loveai-server:latest
docker push {account}.dkr.ecr.{region}.amazonaws.com/loveai-server:latest

# Deploy to EC2
ssh -i key.pem ec2-user@{ip}
docker pull {account}.dkr.ecr.{region}.amazonaws.com/loveai-server:latest
docker run -d -p 3001:3001 loveai-server
```

## Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@host:5432/loveai
AWS_REGION=us-east-1
S3_BUCKET=loveai-models-prod
SAGEMAKER_ENDPOINT=loveai-endpoint
```
