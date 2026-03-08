"""
MinIO bucket initialisation utility.

Called once from ApiConfig.ready() so the bucket (and its public-read
policy) exists before the first upload attempt.
"""
import json
import logging
import os

logger = logging.getLogger(__name__)


def ensure_minio_bucket() -> bool:
    """
    Create the MinIO bucket and apply a public-read policy if it doesn't
    already exist.  Returns True on success, False on any failure (so the
    app still starts even if MinIO is temporarily unavailable).
    """
    endpoint    = os.getenv('MINIO_ENDPOINT',    'localhost:9000')
    access_key  = os.getenv('MINIO_ACCESS_KEY',  'minioadmin')
    secret_key  = os.getenv('MINIO_SECRET_KEY',  'minioadmin123')
    bucket_name = os.getenv('MINIO_BUCKET_NAME', 'hive-media')
    use_ssl     = os.getenv('MINIO_USE_SSL', 'false').lower() == 'true'

    try:
        import boto3
        from botocore.exceptions import ClientError

        s3 = boto3.client(
            's3',
            endpoint_url          = f"{'https' if use_ssl else 'http'}://{endpoint}",
            aws_access_key_id     = access_key,
            aws_secret_access_key = secret_key,
            region_name           = 'us-east-1',
        )

        # ── Check / create bucket ──────────────────────────────────────
        try:
            s3.head_bucket(Bucket=bucket_name)
            logger.info(f"MinIO bucket '{bucket_name}' already exists")
        except ClientError as exc:
            code = exc.response.get('Error', {}).get('Code')
            if code in ('404', 'NoSuchBucket'):
                s3.create_bucket(Bucket=bucket_name)
                logger.info(f"Created MinIO bucket '{bucket_name}'")
            else:
                logger.error(f"MinIO head_bucket error: {exc}")
                return False

        # ── Apply public-read policy (idempotent) ──────────────────────
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect":    "Allow",
                    "Principal": {"AWS": "*"},
                    "Action":    ["s3:GetBucketLocation", "s3:ListBucket"],
                    "Resource":  f"arn:aws:s3:::{bucket_name}",
                },
                {
                    "Effect":    "Allow",
                    "Principal": {"AWS": "*"},
                    "Action":    "s3:GetObject",
                    "Resource":  f"arn:aws:s3:::{bucket_name}/*",
                },
            ],
        }
        s3.put_bucket_policy(Bucket=bucket_name, Policy=json.dumps(policy))
        logger.info(f"Public-read policy applied to bucket '{bucket_name}'")
        return True

    except ImportError:
        logger.warning("boto3 not installed — skipping MinIO bucket setup")
        return False
    except Exception as exc:
        logger.warning(f"MinIO setup failed (will retry on next restart): {exc}")
        return False
