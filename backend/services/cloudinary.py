import cloudinary
import cloudinary.uploader
import logging
import os

logger = logging.getLogger(__name__)


def configure_cloudinary():
    cloudinary.config(
        cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
        api_key=os.environ.get("CLOUDINARY_API_KEY"),
        api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
        secure=True,
    )


async def upload_to_cloudinary(image_bytes: bytes, filename: str) -> dict:
    """Upload image to Cloudinary for research storage. Fire-and-forget."""
    try:
        configure_cloudinary()
        result = cloudinary.uploader.upload(
            image_bytes,
            public_id=f"splito_research/receipts/{filename}",
            resource_type="image",
        )
        logger.info(f"Cloudinary upload success: {result.get('public_id')}")
        return result
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {e}")
        raise
