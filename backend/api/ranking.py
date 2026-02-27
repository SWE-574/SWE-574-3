"""
Hot score ranking algorithm for services.

Formula: Score = (P - N + C) / (T + 2)^1.5

Where:
- P = Positive reputation count (service owner's total: is_punctual + is_helpful + is_kind)
- N = Negative reputation count (service owner's total: is_late + is_unhelpful + is_rude)
- C = Comment count on the service
- T = Hours since service creation
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

if TYPE_CHECKING:
    from .models import Service


def calculate_hot_score(service: Service) -> float:
    """
    Calculate the hot score for a service based on the ranking algorithm.
    
    Higher scores indicate more "hot" or trending services.
    New services with positive reputation and engagement get higher scores.
    """
    from .models import ReputationRep, NegativeRep, Comment
    
    user = service.user
    
    # P: Positive reputation count (sum of all positive traits)
    positive_stats = ReputationRep.objects.filter(receiver=user).aggregate(
        punctual=Coalesce(Count('id', filter=Q(is_punctual=True)), 0),
        helpful=Coalesce(Count('id', filter=Q(is_helpful=True)), 0),
        kind=Coalesce(Count('id', filter=Q(is_kind=True)), 0),
    )
    positive_count = (
        positive_stats['punctual'] + 
        positive_stats['helpful'] + 
        positive_stats['kind']
    )
    
    # N: Negative reputation count (sum of all negative traits)
    negative_stats = NegativeRep.objects.filter(receiver=user).aggregate(
        late=Coalesce(Count('id', filter=Q(is_late=True)), 0),
        unhelpful=Coalesce(Count('id', filter=Q(is_unhelpful=True)), 0),
        rude=Coalesce(Count('id', filter=Q(is_rude=True)), 0),
    )
    negative_count = (
        negative_stats['late'] + 
        negative_stats['unhelpful'] + 
        negative_stats['rude']
    )
    
    # C: Comment count on this service (excluding deleted)
    comment_count = Comment.objects.filter(
        service=service,
        is_deleted=False
    ).count()
    
    # T: Hours since service creation
    time_delta = timezone.now() - service.created_at
    hours_since_creation = time_delta.total_seconds() / 3600
    
    # Apply the formula: Score = (P - N + C) / (T + 2)^1.5
    # Clamp to minimum of 0 to avoid complex numbers from negative bases
    # (can happen with future timestamps due to clock skew or testing)
    numerator = positive_count - negative_count + comment_count
    base = max(hours_since_creation + 2, 0)
    denominator = base ** 1.5
    
    # Prevent division by zero
    if denominator == 0:
        return 0.0
    
    score = numerator / denominator
    return round(score, 6)


def calculate_hot_scores_batch(services) -> dict:
    """
    Calculate hot scores for multiple services efficiently using batch queries.
    
    Returns a dict mapping service_id -> hot_score
    """
    from .models import ReputationRep, NegativeRep, Comment
    
    if not services:
        return {}
    
    # Get all unique user IDs
    user_ids = set(s.user_id for s in services)
    
    # Batch query for positive reputation counts per user
    positive_by_user = {}
    positive_stats = ReputationRep.objects.filter(
        receiver_id__in=user_ids
    ).values('receiver_id').annotate(
        punctual=Count('id', filter=Q(is_punctual=True)),
        helpful=Count('id', filter=Q(is_helpful=True)),
        kind=Count('id', filter=Q(is_kind=True)),
    )
    for stat in positive_stats:
        positive_by_user[stat['receiver_id']] = (
            stat['punctual'] + stat['helpful'] + stat['kind']
        )
    
    # Batch query for negative reputation counts per user
    negative_by_user = {}
    negative_stats = NegativeRep.objects.filter(
        receiver_id__in=user_ids
    ).values('receiver_id').annotate(
        late=Count('id', filter=Q(is_late=True)),
        unhelpful=Count('id', filter=Q(is_unhelpful=True)),
        rude=Count('id', filter=Q(is_rude=True)),
    )
    for stat in negative_stats:
        negative_by_user[stat['receiver_id']] = (
            stat['late'] + stat['unhelpful'] + stat['rude']
        )
    
    # Batch query for comment counts per service
    service_ids = [s.id for s in services]
    comment_counts = {}
    comment_stats = Comment.objects.filter(
        service_id__in=service_ids,
        is_deleted=False
    ).values('service_id').annotate(count=Count('id'))
    for stat in comment_stats:
        comment_counts[stat['service_id']] = stat['count']
    
    # Calculate scores
    now = timezone.now()
    scores = {}
    
    for service in services:
        positive_count = positive_by_user.get(service.user_id, 0)
        negative_count = negative_by_user.get(service.user_id, 0)
        comment_count = comment_counts.get(service.id, 0)
        
        time_delta = now - service.created_at
        hours_since_creation = time_delta.total_seconds() / 3600
        
        numerator = positive_count - negative_count + comment_count
        # Clamp to minimum of 0 to avoid complex numbers from negative bases
        base = max(hours_since_creation + 2, 0)
        denominator = base ** 1.5
        
        if denominator == 0:
            scores[service.id] = 0.0
        else:
            scores[service.id] = round(numerator / denominator, 6)
    
    return scores
