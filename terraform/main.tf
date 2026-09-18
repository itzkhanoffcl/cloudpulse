terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }

  required_version = ">= 1.6.0"
}

provider "aws" {
  region = "ap-south-1"
}

data "aws_caller_identity" "current" {}

# ============================================================
# CLOUDPULSE SECURITY GROUP
# ============================================================

resource "aws_security_group" "cloudpulse" {
  name        = "cloudpulse-sg"
  description = "Security group for CloudPulse"

  ingress {
    description = "SSH from my IP"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["223.178.81.168/32"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "CloudPulse API"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "CloudPulse-SG"
    Project = "CloudPulse"
  }
}

# ============================================================
# EC2 IAM ROLE
# ============================================================

resource "aws_iam_role" "cloudpulse_ec2_role" {
  name = "cloudpulse-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Service = "ec2.amazonaws.com"
        }

        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name    = "CloudPulse-EC2-Role"
    Project = "CloudPulse"
  }
}

resource "aws_iam_role_policy_attachment" "cloudpulse_cloudwatch" {
  role       = aws_iam_role.cloudpulse_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy_attachment" "cloudpulse_ssm" {
  role       = aws_iam_role.cloudpulse_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "cloudpulse_ec2_readonly" {
  name = "cloudpulse-ec2-readonly"
  role = aws_iam_role.cloudpulse_ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "ce:GetCostAndUsage"
        ]

        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "cloudpulse_profile" {
  name = "cloudpulse-ec2-profile"
  role = aws_iam_role.cloudpulse_ec2_role.name
}

# ============================================================
# EC2 INSTANCE
# ============================================================

resource "aws_instance" "cloudpulse" {
  ami           = "ami-0c0fd09cfe77b59dc"
  instance_type = "t3.micro"

  vpc_security_group_ids = [
    aws_security_group.cloudpulse.id
  ]

  iam_instance_profile = aws_iam_instance_profile.cloudpulse_profile.name

  user_data_replace_on_change = true

  user_data = <<-EOF
              #!/bin/bash

              apt-get update -y
              apt-get install -y python3-pip python3-venv git curl

              snap install amazon-ssm-agent --classic || true

              systemctl enable snap.amazon-ssm-agent.amazon-ssm-agent.service || true
              systemctl start snap.amazon-ssm-agent.amazon-ssm-agent.service || true

              mkdir -p /opt/cloudpulse
              cd /opt/cloudpulse

              python3 -m venv venv
              source venv/bin/activate

              pip install --upgrade pip
              pip install fastapi uvicorn boto3

              cat > /etc/systemd/system/cloudpulse.service <<'SERVICE'

              [Unit]
              Description=CloudPulse FastAPI Service
              After=network.target

              [Service]
              User=root
              WorkingDirectory=/opt/cloudpulse
              ExecStart=/opt/cloudpulse/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
              Restart=always
              RestartSec=5

              [Install]
              WantedBy=multi-user.target

              SERVICE

              systemctl daemon-reload
              systemctl enable cloudpulse
              systemctl start cloudpulse

              EOF

  lifecycle {
    ignore_changes = [
      user_data
    ]
  }

  tags = {
    Name        = "CloudPulse-Server"
    Project     = "CloudPulse"
    Environment = "Development"
  }
}

# ============================================================
# GITHUB ACTIONS OIDC PROVIDER
# ============================================================

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com"
  ]

  tags = {
    Name    = "GitHub-Actions-OIDC"
    Project = "CloudPulse"
  }
}

# ============================================================
# GITHUB ACTIONS DEPLOYMENT ROLE
# ============================================================

resource "aws_iam_role" "cloudpulse_github_actions" {
  name = "cloudpulse-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }

        Action = "sts:AssumeRoleWithWebIdentity"

        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }

          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:itzkhanoffcl@200930026/cloudpulse@1370136681:ref:refs/heads/main"
          }
        }
      }
    ]
  })

  tags = {
    Name    = "CloudPulse-GitHub-Actions"
    Project = "CloudPulse"
  }
}

# ============================================================
# GITHUB ACTIONS DEPLOYMENT PERMISSIONS
# ============================================================

resource "aws_iam_role_policy" "cloudpulse_github_deploy" {
  name = "cloudpulse-github-deploy"
  role = aws_iam_role.cloudpulse_github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Sid    = "SendDeploymentCommand"
        Effect = "Allow"

        Action = [
          "ssm:SendCommand"
        ]

        Resource = [
          "arn:aws:ssm:ap-south-1::document/AWS-RunShellScript",
          "arn:aws:ec2:ap-south-1:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.cloudpulse.id}"
        ]
      },

      {
        Sid    = "ReadDeploymentCommand"
        Effect = "Allow"

        Action = [
          "ssm:GetCommandInvocation",
          "ssm:ListCommandInvocations",
          "ssm:ListCommands"
        ]

        Resource = "*"
      },

      {
        Sid    = "CheckEC2"
        Effect = "Allow"

        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus"
        ]

        Resource = "*"
      }
    ]
  })
}

# ============================================================
# OUTPUTS
# ============================================================

output "cloudpulse_instance_id" {
  value = aws_instance.cloudpulse.id
}

output "cloudpulse_public_ip" {
  value = aws_instance.cloudpulse.public_ip
}

output "github_actions_role_arn" {
  value = aws_iam_role.cloudpulse_github_actions.arn
}

