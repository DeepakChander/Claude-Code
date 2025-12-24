# ECS Service Definitions for OpenAnalyst

# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_execution" {
  name = "openanalyst-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# IAM Role for ECS Tasks
resource "aws_iam_role" "ecs_task" {
  name = "openanalyst-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "brain" {
  name              = "/ecs/openanalyst/brain"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "websocket_hub" {
  name              = "/ecs/openanalyst/websocket-hub"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "agno" {
  name              = "/ecs/openanalyst/agno"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/openanalyst/frontend"
  retention_in_days = 30
}

# Task Definitions
resource "aws_ecs_task_definition" "brain" {
  family                   = "openanalyst-brain"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "brain"
      image     = "${aws_ecr_repository.brain.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3456
          hostPort      = 3456
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "PORT", value = "3456" },
        { name = "NODE_ENV", value = "production" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.brain.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "brain"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3456/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

resource "aws_ecs_task_definition" "websocket_hub" {
  family                   = "openanalyst-websocket-hub"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "websocket-hub"
      image     = "${aws_ecr_repository.websocket_hub.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 8002
          hostPort      = 8002
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "PORT", value = "8002" },
        { name = "NODE_ENV", value = "production" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.websocket_hub.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "websocket-hub"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "agno" {
  family                   = "openanalyst-agno"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "agno"
      image     = "${aws_ecr_repository.agno.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 8001
          hostPort      = 8001
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "PORT", value = "8001" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.agno.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "agno"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "frontend" {
  family                   = "openanalyst-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = "${aws_ecr_repository.frontend.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.frontend.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "frontend"
        }
      }
    }
  ])
}

# ECS Services
resource "aws_ecs_service" "brain" {
  name            = "brain"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.brain.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }
}

resource "aws_ecs_service" "websocket_hub" {
  name            = "websocket-hub"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.websocket_hub.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }
}

resource "aws_ecs_service" "agno" {
  name            = "agno"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.agno.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }
}

resource "aws_ecs_service" "frontend" {
  name            = "frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }
}
