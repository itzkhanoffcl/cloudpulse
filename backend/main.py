from datetime import datetime, timedelta, timezone

import boto3
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


# ============================================================
# CONFIG
# ============================================================

REGION = "ap-south-1"
INSTANCE_ID = "i-0ad789def877cc2ad"

app = FastAPI(
    title="CloudPulse API",
    description="AWS Cloud Infrastructure Monitoring & Cost Visibility Platform",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# AWS CLIENTS
# ============================================================

ec2 = boto3.client(
    "ec2",
    region_name=REGION,
)

cloudwatch = boto3.client(
    "cloudwatch",
    region_name=REGION,
)

cost_explorer = boto3.client(
    "ce",
    region_name="us-east-1",
)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():
    return {
        "project": "CloudPulse",
        "description": "AWS Cloud Infrastructure Monitoring & Cost Visibility Platform",
        "version": "2.0.0",
        "status": "online",
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "cloudpulse-api",
        "region": REGION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================
# EC2 INFORMATION
# ============================================================

@app.get("/ec2")
def get_ec2():

    response = ec2.describe_instances(
        InstanceIds=[INSTANCE_ID]
    )

    instance = response["Reservations"][0]["Instances"][0]

    return {
        "instance_id": instance["InstanceId"],
        "instance_type": instance["InstanceType"],
        "state": instance["State"]["Name"],
        "public_ip": instance.get("PublicIpAddress"),
        "private_ip": instance.get("PrivateIpAddress"),
        "availability_zone": instance["Placement"]["AvailabilityZone"],
        "launch_time": instance["LaunchTime"].isoformat(),
    }


# ============================================================
# GENERIC CLOUDWATCH METRIC
# ============================================================

def get_metric(
    namespace,
    metric_name,
    dimensions,
    statistic="Average",
    period=300,
):

    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(minutes=15)

    response = cloudwatch.get_metric_statistics(
        Namespace=namespace,
        MetricName=metric_name,
        Dimensions=dimensions,
        StartTime=start_time,
        EndTime=end_time,
        Period=period,
        Statistics=[statistic],
    )

    datapoints = response.get("Datapoints", [])

    if not datapoints:
        return {
            "metric": metric_name,
            "value": 0,
            "unit": "Percent",
            "timestamp": None,
        }

    latest = max(
        datapoints,
        key=lambda x: x["Timestamp"],
    )

    return {
        "metric": metric_name,
        "value": round(latest.get(statistic, 0), 2),
        "unit": latest.get("Unit", "Percent"),
        "timestamp": latest["Timestamp"].isoformat(),
    }


# ============================================================
# CPU
# ============================================================

@app.get("/metrics")
def get_cpu():

    return get_metric(
        namespace="AWS/EC2",
        metric_name="CPUUtilization",
        dimensions=[
            {
                "Name": "InstanceId",
                "Value": INSTANCE_ID,
            }
        ],
    )


# ============================================================
# MEMORY
# ============================================================

@app.get("/memory")
def get_memory():

    return get_metric(
        namespace="CWAgent",
        metric_name="mem_used_percent",
        dimensions=[
            {
                "Name": "InstanceId",
                "Value": INSTANCE_ID,
            }
        ],
    )


# ============================================================
# DISK
# ============================================================

@app.get("/disk")
def get_disk():

    return get_metric(
        namespace="CWAgent",
        metric_name="disk_used_percent",
        dimensions=[
            {
                "Name": "path",
                "Value": "/",
            },
            {
                "Name": "InstanceId",
                "Value": INSTANCE_ID,
            },
            {
                "Name": "device",
                "Value": "nvme0n1p1",
            },
            {
                "Name": "fstype",
                "Value": "ext4",
            },
        ],
    )


# ============================================================
# NETWORK
# ============================================================

@app.get("/network")
def get_network():

    network_in = get_metric(
        namespace="AWS/EC2",
        metric_name="NetworkIn",
        dimensions=[
            {
                "Name": "InstanceId",
                "Value": INSTANCE_ID,
            }
        ],
        statistic="Average",
    )

    network_out = get_metric(
        namespace="AWS/EC2",
        metric_name="NetworkOut",
        dimensions=[
            {
                "Name": "InstanceId",
                "Value": INSTANCE_ID,
            }
        ],
        statistic="Average",
    )

    return {
        "network_in": network_in,
        "network_out": network_out,
    }


# ============================================================
# MONITORING SUMMARY
# ============================================================

@app.get("/monitoring")
def monitoring():

    return {
        "cpu": get_cpu(),
        "memory": get_memory(),
        "disk": get_disk(),
        "network": get_network(),
    }


# ============================================================
# SYSTEM HEALTH
# ============================================================

@app.get("/system-health")
def system_health():

    response = ec2.describe_instance_status(
        InstanceIds=[INSTANCE_ID],
        IncludeAllInstances=True,
    )

    statuses = response.get("InstanceStatuses", [])

    if not statuses:
        return {
            "instance_id": INSTANCE_ID,
            "instance_status": "unknown",
            "system_status": "unknown",
            "overall": "unknown",
        }

    status = statuses[0]

    instance_status = status["InstanceStatus"]["Status"]
    system_status = status["SystemStatus"]["Status"]

    overall = (
        "healthy"
        if instance_status == "ok"
        and system_status == "ok"
        else "attention"
    )

    return {
        "instance_id": INSTANCE_ID,
        "instance_status": instance_status,
        "system_status": system_status,
        "overall": overall,
    }


# ============================================================
# COST
# ============================================================

@app.get("/cost")
def get_cost():

    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=30)

    response = cost_explorer.get_cost_and_usage(
        TimePeriod={
            "Start": start.isoformat(),
            "End": end.isoformat(),
        },
        Granularity="MONTHLY",
        Metrics=["UnblendedCost"],
    )

    results = response.get("ResultsByTime", [])

    if not results:
        return {
            "period": "30_days",
            "amount": 0,
            "currency": "USD",
        }

    amount = results[0]["Total"]["UnblendedCost"]["Amount"]
    currency = results[0]["Total"]["UnblendedCost"]["Unit"]

    return {
        "period": "30_days",
        "amount": round(float(amount), 2),
        "currency": currency,
    }