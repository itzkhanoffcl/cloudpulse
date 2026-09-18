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


# =========================================================
# SECURITY GROUP
# =========================================================

resource "aws_security_group" "cloudpulse" {

  name = "cloudpulse-sg"

  description = "Security group for CloudPulse"


  ingress {

    description = "SSH from my IP"

    from_port = 22

    to_port = 22

    protocol = "tcp"

    cidr_blocks = [
      "223.178.81.168/32"
    ]
  }


  ingress {

    description = "HTTP"

    from_port = 80

    to_port = 80

    protocol = "tcp"

    cidr_blocks = [
      "0.0.0.0/0"
    ]
  }


  ingress {

    description = "HTTPS"

    from_port = 443

    to_port = 443

    protocol = "tcp"

    cidr_blocks = [
      "0.0.0.0/0"
    ]
  }


  ingress {

    description = "CloudPulse API"

    from_port = 8000

    to_port = 8000

    protocol = "tcp"

    cidr_blocks = [
      "0.0.0.0/0"
    ]
  }


  egress {

    from_port = 0

    to_port = 0

    protocol = "-1"

    cidr_blocks = [
      "0.0.0.0/0"
    ]
  }


  tags = {

    Name = "CloudPulse-SG"

    Project = "CloudPulse"

  }

}


# =========================================================
# IAM ROLE
# =========================================================

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

    Name = "CloudPulse-EC2-Role"

    Project = "CloudPulse"

  }

}


# =========================================================
# CLOUDWATCH POLICY
# =========================================================

resource "aws_iam_role_policy_attachment" "cloudpulse_cloudwatch" {

  role = aws_iam_role.cloudpulse_ec2_role.name

  policy_arn =
    "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"

}


# =========================================================
# SSM POLICY
# =========================================================

resource "aws_iam_role_policy_attachment" "cloudpulse_ssm" {

  role = aws_iam_role.cloudpulse_ec2_role.name

  policy_arn =
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"

}


# =========================================================
# CLOUDPULSE READ ONLY POLICY
# =========================================================

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


# =========================================================
# INSTANCE PROFILE
# =========================================================

resource "aws_iam_instance_profile" "cloudpulse_profile" {

  name = "cloudpulse-ec2-profile"

  role = aws_iam_role.cloudpulse_ec2_role.name

}


# =========================================================
# EC2
# =========================================================

resource "aws_instance" "cloudpulse" {

  ami = "ami-0c0fd09cfe77b59dc"

  instance_type = "t3.micro"


  vpc_security_group_ids = [

    aws_security_group.cloudpulse.id

  ]


  iam_instance_profile =
    aws_iam_instance_profile.cloudpulse_profile.name


  user_data_replace_on_change = true


  user_data = <<-EOF
              #!/bin/bash

              apt-get update -y

              apt-get install -y \
                python3-pip \
                python3-venv \
                git \
                curl

              snap install amazon-ssm-agent --classic || true

              systemctl enable \
                snap.amazon-ssm-agent.amazon-ssm-agent.service || true

              systemctl start \
                snap.amazon-ssm-agent.amazon-ssm-agent.service || true

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

    Name = "CloudPulse-Server"

    Project = "CloudPulse"

    Environment = "Development"

  }

}