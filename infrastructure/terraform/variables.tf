# Terraform Variables for OpenAnalyst

variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "eu-north-1"
}

variable "environment" {
  description = "Environment name (production, staging, development)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be one of: production, staging, development."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "openanalyst.com"
}

variable "brain_cpu" {
  description = "CPU units for Brain service"
  type        = number
  default     = 512
}

variable "brain_memory" {
  description = "Memory (MB) for Brain service"
  type        = number
  default     = 1024
}

variable "agno_cpu" {
  description = "CPU units for Agno service"
  type        = number
  default     = 512
}

variable "agno_memory" {
  description = "Memory (MB) for Agno service"
  type        = number
  default     = 1024
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "enable_monitoring" {
  description = "Enable CloudWatch Container Insights"
  type        = bool
  default     = true
}
