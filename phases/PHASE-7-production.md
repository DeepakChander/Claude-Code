# Phase 7: Production Deployment

## Objectives
- Deploy to AWS infrastructure
- Configure security and monitoring
- Set up CI/CD pipeline
- Production hardening

## AWS Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                         VPC                              │
                    │  ┌─────────────────────────────────────────────────┐    │
                    │  │              Public Subnets                      │    │
                    │  │  ┌─────────┐                                    │    │
         Internet ──┼──┼──│   ALB   │                                    │    │
                    │  │  └────┬────┘                                    │    │
                    │  └───────┼──────────────────────────────────────────┘    │
                    │          │                                               │
                    │  ┌───────┼──────────────────────────────────────────┐    │
                    │  │       │      Private Subnets                     │    │
                    │  │  ┌────▼────┐  ┌─────────┐  ┌─────────┐          │    │
                    │  │  │ ECS     │  │ ECS     │  │ ECS     │          │    │
                    │  │  │ Brain   │  │ Agno    │  │ WS Hub  │          │    │
                    │  │  └────┬────┘  └────┬────┘  └────┬────┘          │    │
                    │  │       │            │            │                │    │
                    │  │  ┌────▼────────────▼────────────▼────┐          │    │
                    │  │  │         Internal ALB              │          │    │
                    │  │  └────┬────────────┬────────────┬────┘          │    │
                    │  │       │            │            │                │    │
                    │  │  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐          │    │
                    │  │  │   RDS   │  │  Redis  │  │Windmill │          │    │
                    │  │  │Postgres │  │ElastiC. │  │  ECS    │          │    │
                    │  │  └─────────┘  └─────────┘  └─────────┘          │    │
                    │  └──────────────────────────────────────────────────┘    │
                    └─────────────────────────────────────────────────────────┘
```

## Security Configuration

### Authentication
```typescript
// JWT Configuration
const jwtConfig = {
  algorithm: 'RS256',
  expiresIn: '1h',
  refreshExpiresIn: '7d',
  issuer: 'openanalyst.io'
};
```

### Environment Variables (Production)
```bash
# .env.production
NODE_ENV=production
JWT_SECRET=${aws_secretsmanager:openanalyst/jwt-secret}
ANTHROPIC_API_KEY=${aws_secretsmanager:openanalyst/anthropic-key}
DATABASE_URL=${aws_secretsmanager:openanalyst/database-url}
REDIS_URL=${aws_secretsmanager:openanalyst/redis-url}
WINDMILL_TOKEN=${aws_secretsmanager:openanalyst/windmill-token}
```

## Terraform Infrastructure

### Main Configuration
**File**: `infrastructure/main.tf`

```hcl
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket = "openanalyst-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  default = "us-east-1"
}

variable "environment" {
  default = "production"
}
```

### VPC Module
**File**: `infrastructure/vpc.tf`

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"
  
  name = "openanalyst-vpc"
  cidr = "10.0.0.0/16"
  
  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  
  enable_nat_gateway = true
  single_nat_gateway = false
  
  tags = {
    Environment = var.environment
    Project     = "openanalyst"
  }
}
```

### RDS PostgreSQL
**File**: `infrastructure/rds.tf`

```hcl
resource "aws_db_instance" "postgres" {
  identifier     = "openanalyst-db"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t3.medium"
  
  allocated_storage     = 100
  max_allocated_storage = 500
  storage_encrypted     = true
  
  db_name  = "openanalyst"
  username = "openanalyst_admin"
  password = var.db_password
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  
  backup_retention_period = 7
  multi_az               = true
  deletion_protection    = true
  
  performance_insights_enabled = true
}

resource "aws_db_subnet_group" "main" {
  name       = "openanalyst-db-subnet"
  subnet_ids = module.vpc.private_subnets
}
```

### ElastiCache Redis
**File**: `infrastructure/elasticache.tf`

```hcl
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "openanalyst-redis"
  engine               = "redis"
  node_type            = "cache.t3.medium"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  
  security_group_ids = [aws_security_group.redis.id]
  subnet_group_name  = aws_elasticache_subnet_group.main.name
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "openanalyst-redis-subnet"
  subnet_ids = module.vpc.private_subnets
}
```

### ECS Cluster
**File**: `infrastructure/ecs.tf`

```hcl
resource "aws_ecs_cluster" "main" {
  name = "openanalyst-cluster"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name
  
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  
  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}
```

### Application Load Balancer
**File**: `infrastructure/alb.tf`

```hcl
resource "aws_lb" "main" {
  name               = "openanalyst-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
  
  enable_deletion_protection = true
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn
  
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}
```

## ECS Task Definitions

### Brain Service
**File**: `infrastructure/ecs-tasks/brain.json`

```json
{
  "family": "openanalyst-brain",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "${execution_role_arn}",
  "taskRoleArn": "${task_role_arn}",
  "containerDefinitions": [
    {
      "name": "brain",
      "image": "${ecr_repo}/brain:${image_tag}",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"}
      ],
      "secrets": [
        {
          "name": "ANTHROPIC_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxx:secret:openanalyst/anthropic-key"
        },
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxx:secret:openanalyst/database-url"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/openanalyst-brain",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

## CI/CD Pipeline

### GitHub Actions
**File**: `.github/workflows/deploy.yml`

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AWS_REGION: us-east-1
  ECR_REGISTRY: ${{ secrets.ECR_REGISTRY }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Run integration tests
        run: npm run test:integration

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [brain, agno, websocket-hub, frontend]
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Build and push Docker image
        run: |
          docker build -t $ECR_REGISTRY/${{ matrix.service }}:${{ github.sha }} ./services/${{ matrix.service }}
          docker push $ECR_REGISTRY/${{ matrix.service }}:${{ github.sha }}
          docker tag $ECR_REGISTRY/${{ matrix.service }}:${{ github.sha }} $ECR_REGISTRY/${{ matrix.service }}:latest
          docker push $ECR_REGISTRY/${{ matrix.service }}:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Update ECS services
        run: |
          aws ecs update-service --cluster openanalyst-cluster --service brain --force-new-deployment
          aws ecs update-service --cluster openanalyst-cluster --service agno --force-new-deployment
          aws ecs update-service --cluster openanalyst-cluster --service websocket-hub --force-new-deployment
          aws ecs update-service --cluster openanalyst-cluster --service frontend --force-new-deployment
```

## Monitoring

### CloudWatch Alarms
**File**: `infrastructure/monitoring/cloudwatch-alarms.tf`

```hcl
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "openanalyst-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "CPU utilization exceeds 80%"
  
  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
  }
  
  alarm_actions = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "memory_high" {
  alarm_name          = "openanalyst-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Memory utilization exceeds 80%"
  
  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
  }
  
  alarm_actions = [aws_sns_topic.alerts.arn]
}

resource "aws_sns_topic" "alerts" {
  name = "openanalyst-alerts"
}
```

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Environment variables configured in AWS Secrets Manager
- [ ] Database migrations ready
- [ ] SSL certificates provisioned
- [ ] DNS configured

### Deployment
- [ ] Deploy infrastructure via Terraform
- [ ] Build and push Docker images
- [ ] Update ECS services
- [ ] Run database migrations
- [ ] Verify health checks passing

### Post-Deployment
- [ ] Monitor error rates in CloudWatch
- [ ] Check application logs
- [ ] Verify all endpoints responding
- [ ] Test critical user flows
- [ ] Notify team of completion

## Rollback Procedure

```bash
# Rollback to previous task definition
aws ecs update-service \
  --cluster openanalyst-cluster \
  --service [service-name] \
  --task-definition [previous-task-def-arn]

# Or rollback Terraform
cd infrastructure
terraform plan -target=module.ecs
terraform apply -auto-approve
```

## Checkpoint
- [ ] Infrastructure provisioned
- [ ] CI/CD pipeline working
- [ ] Monitoring configured
- [ ] Security hardened
- [ ] Documentation complete

🎉 **Congratulations!** You have completed all phases of OpenAnalyst development.
