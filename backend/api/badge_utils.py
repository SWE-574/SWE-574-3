"""
Automated badge assignment utilities

Extended badge system with community engagement, time giving milestones,
and reputation-based achievements.
"""
from collections import defaultdict
from decimal import Decimal
from typing import Dict, List

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce

from .models import (
    Badge, Handshake, ReputationRep, Service, User, UserBadge,
    Comment, NegativeRep, TransactionHistory
)

# Achievement definitions with metadata and karma rewards
# Format: badge_id -> {name, description, icon_url, karma_points, is_hidden}
BADGE_DEFAULTS: Dict[str, Dict[str, any]] = {
    "first-service": {
        "name": "First Service",
        "description": "Completed the first timebank exchange.",
        "icon_url": "",
        "karma_points": 5,
        "is_hidden": False,
    },
    "10-offers": {
        "name": "10+ Offers",
        "description": "Shared at least ten offers with the community.",
        "icon_url": "",
        "karma_points": 10,
        "is_hidden": False,
    },
    "kindness-hero": {
        "name": "Kindness Hero",
        "description": "Received consistent kindness feedback from neighbours.",
        "icon_url": "",
        "karma_points": 15,
        "is_hidden": False,
    },
    "super-helper": {
        "name": "Super Helper",
        "description": "Recognised for above-and-beyond support.",
        "icon_url": "",
        "karma_points": 15,
        "is_hidden": False,
    },
    "punctual-pro": {
        "name": "Punctual Pro",
        "description": "Always on time for confirmed handshakes.",
        "icon_url": "",
        "karma_points": 12,
        "is_hidden": False,
    },
    "community-voice": {
        "name": "Community Voice",
        "description": "Active contributor with 10+ comments in the community.",
        "icon_url": "",
        "karma_points": 8,
        "is_hidden": False,
    },
    "time-giver-bronze": {
        "name": "Time Giver (Bronze)",
        "description": "Generously shared 10+ hours with the community.",
        "icon_url": "",
        "karma_points": 10,
        "is_hidden": False,
    },
    "trusted-member": {
        "name": "Trusted Member",
        "description": "Reliable community member with 25+ completed exchanges.",
        "icon_url": "",
        "karma_points": 20,
        "is_hidden": False,
    },
    "perfect-record": {
        "name": "Perfect Record",
        "description": "Maintained excellence with 10+ completed handshakes and zero negative feedback.",
        "icon_url": "",
        "karma_points": 25,
        "is_hidden": True,
    },
    "top-rated": {
        "name": "Top Rated",
        "description": "Exceptional reputation with 50+ positive feedback points.",
        "icon_url": "",
        "karma_points": 30,
        "is_hidden": True,
    },
}

# Achievement requirements mapping: badge_id -> (stat_key, threshold)
# Only 10 achievements are active
BADGE_REQUIREMENTS: Dict[str, tuple] = {
    'first-service': ('completed_services', 1),
    '10-offers': ('offer_count', 10),
    'kindness-hero': ('kindness_count', 20),
    'super-helper': ('helpful_count', 15),
    'punctual-pro': ('punctual_count', 15),
    'community-voice': ('comments_posted', 10),
    'time-giver-bronze': ('hours_given', 10),
    'trusted-member': ('completed_services', 25),
    'perfect-record': ('completed_no_negative', 10),
    'top-rated': ('total_positive_reputation', 50),
}


def check_and_assign_badges(user: User) -> List[str]:
    """
    Assign new badges to the user based on their stats.
    
    Returns a list of newly assigned badge IDs.
    """
    existing_badges = set(
        UserBadge.objects.filter(user=user).values_list('badge_id', flat=True)
    )

    stats = get_user_stats(user)
    newly_assigned: List[str] = []
    
    for badge_id, (stat_key, threshold) in BADGE_REQUIREMENTS.items():
        stat_value = stats.get(stat_key, 0)
        
        # Handle special case for perfect-record (requires both conditions)
        if badge_id == 'perfect-record':
            if (stats.get('completed_services', 0) >= threshold and 
                stats.get('negative_rep_count', 0) == 0 and
                badge_id not in existing_badges):
                assign_badge(user, badge_id)
                newly_assigned.append(badge_id)
        elif stat_value >= threshold and badge_id not in existing_badges:
            assign_badge(user, badge_id)
            newly_assigned.append(badge_id)

    return newly_assigned


def get_user_stats(user: User) -> Dict[str, int]:
    """
    Return comprehensive user stats for badge evaluation.
    
    Stats include:
    - Service and handshake counts
    - Reputation metrics (positive and negative)
    - Community engagement (comments)
    - Time giving totals
    """
    stats: Dict[str, int] = defaultdict(int)

    # === Service and Handshake Stats ===
    stats['completed_services'] = (
        Handshake.objects.filter(
            Q(requester=user) | Q(service__user=user),
            status='completed'
        ).count()
    )

    stats['offer_count'] = (
        Service.objects.filter(
            user=user, 
            type='Offer', 
            status__in=['Active', 'Completed']
        ).count()
    )

    # === Positive Reputation Stats ===
    rep_counts = ReputationRep.objects.filter(receiver=user).aggregate(
        helpful=Count('id', filter=Q(is_helpful=True)),
        kind=Count('id', filter=Q(is_kind=True)),
        punctual=Count('id', filter=Q(is_punctual=True)),
    )

    stats['helpful_count'] = rep_counts['helpful'] or 0
    stats['kindness_count'] = rep_counts['kind'] or 0
    stats['punctual_count'] = rep_counts['punctual'] or 0
    stats['total_positive_reputation'] = (
        stats['helpful_count'] + 
        stats['kindness_count'] + 
        stats['punctual_count']
    )

    # === Negative Reputation Stats ===
    negative_counts = NegativeRep.objects.filter(receiver=user).aggregate(
        late=Count('id', filter=Q(is_late=True)),
        unhelpful=Count('id', filter=Q(is_unhelpful=True)),
        rude=Count('id', filter=Q(is_rude=True)),
        total=Count('id'),
    )
    
    stats['late_count'] = negative_counts['late'] or 0
    stats['unhelpful_count'] = negative_counts['unhelpful'] or 0
    stats['rude_count'] = negative_counts['rude'] or 0
    stats['negative_rep_count'] = negative_counts['total'] or 0

    # === Community Engagement Stats ===
    stats['comments_posted'] = (
        Comment.objects.filter(user=user, is_deleted=False).count()
    )
    
    # Comments received on user's services
    stats['comments_on_services'] = (
        Comment.objects.filter(
            service__user=user,
            is_deleted=False
        ).exclude(user=user).count()  # Exclude self-comments
    )

    # === Time Giving Stats ===
    # Calculate total hours given as provider (transfer transactions where user received hours)
    hours_given_result = TransactionHistory.objects.filter(
        user=user,
        transaction_type='transfer',
        amount__gt=0  # Positive = received as provider
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0')))
    
    stats['hours_given'] = int(hours_given_result['total'] or 0)

    # Calculate completed handshakes with no negative rep for perfect-record badge
    completed_handshakes = Handshake.objects.filter(
        Q(requester=user) | Q(service__user=user),
        status='completed'
    )
    
    # Check if user has negative rep on any completed handshake
    handshakes_with_negative = NegativeRep.objects.filter(
        receiver=user,
        handshake__in=completed_handshakes
    ).values('handshake').distinct().count()
    
    stats['completed_no_negative'] = stats['completed_services'] if handshakes_with_negative == 0 else 0

    return stats


def assign_badge(user: User, badge_id: str) -> bool:
    """
    Assign a badge to a user and award karma points.
    
    Returns True if badge was newly assigned, False if already had it.
    """
    defaults = BADGE_DEFAULTS.get(
        badge_id,
        {
            "name": badge_id.replace("-", " ").replace("_", " ").title(),
            "description": "",
            "icon_url": "",
            "karma_points": 0,
            "is_hidden": False,
        },
    )
    badge, _ = Badge.objects.get_or_create(id=badge_id, defaults=defaults)
    _, created = UserBadge.objects.get_or_create(user=user, badge=badge)
    
    # Award karma points when badge is newly assigned
    if created:
        karma_points = defaults.get("karma_points", 0)
        if karma_points > 0:
            user.karma_score += karma_points
            user.save(update_fields=['karma_score'])
    
    return created


def get_badge_progress(user: User) -> Dict[str, Dict]:
    """
    Get progress towards all badges for a user.
    
    Returns dict with badge info, current progress, and whether earned.
    """
    stats = get_user_stats(user)
    existing_badges = set(
        UserBadge.objects.filter(user=user).values_list('badge_id', flat=True)
    )
    
    progress = {}
    
    for badge_id, (stat_key, threshold) in BADGE_REQUIREMENTS.items():
        current = stats.get(stat_key, 0)
        
        # Special handling for perfect-record
        if badge_id == 'perfect-record':
            has_negative = stats.get('negative_rep_count', 0) > 0
            current = stats.get('completed_services', 0) if not has_negative else 0
        
        badge_info = BADGE_DEFAULTS.get(badge_id, {})
        is_hidden = badge_info.get('is_hidden', False)
        
        progress[badge_id] = {
            'badge': {
                'name': badge_info.get('name', badge_id),
                'description': badge_info.get('description', ''),
                'icon_url': badge_info.get('icon_url', ''),
                'karma_points': badge_info.get('karma_points', 0),
                'is_hidden': is_hidden,
            },
            'earned': badge_id in existing_badges,
            'current': current if (badge_id in existing_badges or not is_hidden) else None,
            'threshold': threshold if (badge_id in existing_badges or not is_hidden) else None,
            'progress_percent': min(100, int((current / threshold) * 100)) if threshold > 0 and (badge_id in existing_badges or not is_hidden) else 0,
        }
    
    return progress
