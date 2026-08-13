import base64
from functools import lru_cache

import boto3
from botocore.config import Config
from django.conf import settings


def _client_settings_key():
    return (
        settings.AWS_ACCESS_KEY_ID,
        settings.AWS_SECRET_ACCESS_KEY,
        settings.AWS_S3_ENDPOINT_URL,
        settings.AWS_S3_REGION_NAME,
        settings.AWS_S3_ADDRESSING_STYLE,
    )


@lru_cache(maxsize=8)
def _build_client(access_key, secret_key, endpoint_url, region, addressing_style):
    return boto3.client(
        "s3",
        aws_access_key_id=access_key or None,
        aws_secret_access_key=secret_key or None,
        endpoint_url=endpoint_url or None,
        region_name=region,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": addressing_style},
            connect_timeout=5,
            read_timeout=30,
            max_pool_connections=32,
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def get_s3_client():
    return _build_client(*_client_settings_key())


def require_bucket_name():
    bucket = settings.AWS_STORAGE_BUCKET_NAME.strip()
    if not bucket:
        raise RuntimeError("AWS_STORAGE_BUCKET_NAME is required for file uploads.")
    return bucket


def begin_multipart_upload(asset):
    response = get_s3_client().create_multipart_upload(
        Bucket=require_bucket_name(),
        Key=asset.storage_key,
        ContentType=asset.claimed_mime,
        ChecksumAlgorithm="SHA256",
        Metadata={
            "asset-id": str(asset.pk),
            "owner-id": str(asset.owner_id),
            "sha256": asset.sha256,
            "purpose": asset.purpose.lower(),
        },
    )
    return response["UploadId"]


def checksum_header(hex_digest):
    return base64.b64encode(bytes.fromhex(hex_digest)).decode("ascii")


def presign_upload_part(session, part_number, checksum_sha256):
    return get_s3_client().generate_presigned_url(
        "upload_part",
        Params={
            "Bucket": require_bucket_name(),
            "Key": session.asset.storage_key,
            "UploadId": session.provider_upload_id,
            "PartNumber": part_number,
            "ChecksumSHA256": checksum_header(checksum_sha256),
        },
        ExpiresIn=settings.AWS_S3_PRESIGN_EXPIRY_SECONDS,
        HttpMethod="PUT",
    )


def list_uploaded_parts(session):
    client = get_s3_client()
    request = {
        "Bucket": require_bucket_name(),
        "Key": session.asset.storage_key,
        "UploadId": session.provider_upload_id,
    }
    parts = []
    while True:
        response = client.list_parts(**request)
        parts.extend(response.get("Parts", ()))
        if not response.get("IsTruncated"):
            return parts
        request["PartNumberMarker"] = response["NextPartNumberMarker"]


def complete_multipart_upload(session, parts):
    completion_parts = []
    for part in parts:
        item = {"ETag": part["ETag"], "PartNumber": part["PartNumber"]}
        if part.get("ChecksumSHA256"):
            item["ChecksumSHA256"] = part["ChecksumSHA256"]
        completion_parts.append(item)
    return get_s3_client().complete_multipart_upload(
        Bucket=require_bucket_name(),
        Key=session.asset.storage_key,
        UploadId=session.provider_upload_id,
        MultipartUpload={"Parts": completion_parts},
    )


def abort_multipart_upload(session):
    get_s3_client().abort_multipart_upload(
        Bucket=require_bucket_name(),
        Key=session.asset.storage_key,
        UploadId=session.provider_upload_id,
    )


def head_asset(asset):
    return get_s3_client().head_object(
        Bucket=require_bucket_name(),
        Key=asset.storage_key,
        ChecksumMode="ENABLED",
    )
