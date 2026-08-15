"""Verify that the configured S3-compatible test bucket is private and writable."""

import os
import uuid

import boto3
from botocore.exceptions import ClientError


bucket = os.environ["AWS_STORAGE_BUCKET_NAME"]
client = boto3.client(
    "s3",
    endpoint_url=os.environ["AWS_S3_ENDPOINT_URL"],
    region_name=os.getenv("AWS_S3_REGION_NAME", "us-east-1"),
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)

try:
    client.head_bucket(Bucket=bucket)
except ClientError:
    client.create_bucket(Bucket=bucket)

try:
    client.put_public_access_block(
        Bucket=bucket,
        PublicAccessBlockConfiguration={
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True,
        },
    )
except ClientError as error:
    if error.response["Error"]["Code"] != "MalformedXML":
        raise
    # Older S3-compatible MinIO releases reject the AWS-only public access
    # block API. A missing bucket policy still means anonymous access is denied.
    try:
        client.get_bucket_policy(Bucket=bucket)
    except ClientError as policy_error:
        if policy_error.response["Error"]["Code"] not in {"NoSuchBucketPolicy", "NoSuchPolicy"}:
            raise
    else:
        raise AssertionError("The integration-test bucket has an unexpected access policy.")
key = f"ci-smoke/{uuid.uuid4()}"
payload = b"dentotime-private-storage-smoke"
put_options = {"ServerSideEncryption": "AES256"} if os.getenv("AWS_S3_SERVER_SIDE_ENCRYPTION") else {}
client.put_object(Bucket=bucket, Key=key, Body=payload, **put_options)
response = client.get_object(Bucket=bucket, Key=key)
assert response["Body"].read() == payload
client.delete_object(Bucket=bucket, Key=key)
print("Private object-storage smoke test passed.")
