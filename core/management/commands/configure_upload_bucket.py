from botocore.exceptions import ClientError
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.object_storage import get_s3_client, require_bucket_name


class Command(BaseCommand):
    help = "Configure the private object-storage bucket for direct multipart browser uploads."

    def handle(self, *args, **options):
        origins = list(settings.CORS_ALLOWED_ORIGINS)
        if not origins:
            raise CommandError("CORS_ALLOWED_ORIGINS must contain the frontend origins.")
        client = get_s3_client()
        bucket = require_bucket_name()
        if settings.AWS_S3_SERVER_SIDE_ENCRYPTION:
            client.put_bucket_encryption(
                Bucket=bucket,
                ServerSideEncryptionConfiguration={
                    "Rules": [
                        {
                            "ApplyServerSideEncryptionByDefault": {
                                "SSEAlgorithm": settings.AWS_S3_SERVER_SIDE_ENCRYPTION
                            },
                            "BucketKeyEnabled": False,
                        }
                    ]
                },
            )
        client.put_bucket_cors(
            Bucket=bucket,
            CORSConfiguration={
                "CORSRules": [
                    {
                        "AllowedOrigins": origins,
                        "AllowedMethods": ["PUT"],
                        "AllowedHeaders": ["x-amz-checksum-sha256"],
                        "ExposeHeaders": ["ETag", "x-amz-checksum-sha256"],
                        "MaxAgeSeconds": 600,
                    }
                ]
            },
        )
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
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") not in {"NotImplemented", "XNotImplemented"}:
                raise
            self.stderr.write("Storage provider does not implement S3 public-access-block controls.")
        self.stdout.write(self.style.SUCCESS(f"Configured private upload CORS for {bucket}."))
