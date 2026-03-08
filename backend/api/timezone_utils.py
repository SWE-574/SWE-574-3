"""
Timezone utilities for consistent datetime handling across the application
"""
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.timezone import get_current_timezone, make_aware
from datetime import datetime
from typing import Optional, Tuple


def validate_and_normalize_datetime(datetime_str: str) -> Tuple[Optional[datetime], Optional[str]]:
    """
    Validate and normalize a datetime string to a timezone-aware datetime object.
    
    Args:
        datetime_str: ISO format datetime string (may be naive or aware)
    
    Returns:
        Tuple of (normalized_datetime, error_message)
        - If successful: (datetime_object, None)
        - If failed: (None, error_message)
    """
    if not datetime_str:
        return None, "Datetime string is required"
    
    # Parse the datetime string
    parsed_time = parse_datetime(datetime_str)
    
    if not parsed_time:
        return None, "Invalid datetime format. Expected ISO format (YYYY-MM-DDTHH:MM:SS)"
    
    # Make timezone-aware if naive
    if timezone.is_naive(parsed_time):
        current_tz = get_current_timezone()
        parsed_time = make_aware(parsed_time, current_tz)
    
    return parsed_time, None


def validate_future_datetime(dt: datetime) -> Optional[str]:
    """
    Validate that a datetime is in the future.
    
    Args:
        dt: Timezone-aware datetime object
    
    Returns:
        Error message if validation fails, None if valid
    """
    if not dt:
        return "Datetime is required"
    
    if timezone.is_naive(dt):
        return "Datetime must be timezone-aware"
    
    if dt <= timezone.now():
        return "Scheduled time must be in the future"
    
    return None
