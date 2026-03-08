"""
Automated achievement assignment utilities

Extended achievement system with community engagement, time giving milestones,
and reputation-based achievements.
"""
from collections import defaultdict
from decimal import Decimal
from typing import Dict, List
from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import (
    Badge, Handshake, ReputationRep, Service, User, UserBadge,
    Comment, NegativeRep, TransactionHistory
)

ACHIEVEMENT_DEFAULTS: Dict[str, Dict[str, any]] = {
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
    "seniority": {
        "name": "Seniority",
        "description": "Completed 5+ services as consumer or provider.",
        "icon_url": "",
        "karma_points": 10,
        "is_hidden": False,
    },
    "registered-3-months": {
        "name": "Registered for 3 Months",
        "description": "Active member for 3 months.",
        "icon_url": "",
        "karma_points": 5,
        "is_hidden": False,
    },
    "registered-6-months": {
        "name": "Registered for 6 Months",
        "description": "Active member for 6 months.",
        "icon_url": "",
        "karma_points": 10,
        "is_hidden": False,
    },
    "registered-9-months": {
        "name": "Registered for 9 Months",
        "description": "Active member for 9 months.",
        "icon_url": "",
        "karma_points": 15,
        "is_hidden": False,
    },
    "registered-1-year": {
        "name": "Registered for 1 Year",
        "description": "Active member for 1 year.",
        "icon_url": "",
        "karma_points": 20,
        "is_hidden": False,
    },
    "registered-2-years": {
        "name": "Registered for 2 Years",
        "description": "Active member for 2 years.",
        "icon_url": "",
        "karma_points": 25,
        "is_hidden": False,
    },
    "registered-3-years": {
        "name": "Registered for 3+ Years",
        "description": "Active member for 3+ years.",
        "icon_url": "",
        "karma_points": 30,
        "is_hidden": False,
    },
}

ACHIEVEMENT_REQUIREMENTS: Dict[str, tuple] = {
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
    'seniority': ('completed_services', 5),
    'registered-3-months': ('months_registered', 3),
    'registered-6-months': ('months_registered', 6),
    'registered-9-months': ('months_registered', 9),
    'registered-1-year': ('years_registered', 1),
    'registered-2-years': ('years_registered', 2),
    'registered-3-years': ('years_registered', 3),
}


def check_and_assign_badges(user: User) -> List[str]:
    """
    Assign new achievements to the user based on their stats.
    
    Returns a list of newly assigned achievement IDs.
    Note: Function name kept for backward compatibility.
    """
    existing_achievements = set(
        UserBadge.objects.filter(user=user).values_list('badge_id', flat=True)
    )

    stats = get_user_stats(user)
    newly_assigned: List[str] = []
    
    for achievement_id, (stat_key, threshold) in ACHIEVEMENT_REQUIREMENTS.items():
        stat_value = stats.get(stat_key, 0)
        
        if achievement_id == 'perfect-record':
            if (stats.get('completed_services', 0) >= threshold and 
                stats.get('negative_rep_count', 0) == 0 and
                achievement_id not in existing_achievements):
                assign_achievement(user, achievement_id)
                newly_assigned.append(achievement_id)
        elif stat_value >= threshold and achievement_id not in existing_achievements:
            assign_achievement(user, achievement_id)
            newly_assigned.append(achievement_id)

    return newly_assigned


def get_user_stats(user: User) -> Dict[str, int]:
    """
    Return comprehensive user stats for achievement evaluation.
    
    Stats include:
    - Service and handshake counts
    - Reputation metrics (positive and negative)
    - Community engagement (comments)
    - Time giving totals
    - Time-based registration stats
    """
    stats: Dict[str, int] = defaultdict(int)

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

    stats['comments_posted'] = (
        Comment.objects.filter(user=user, is_deleted=False).count()
    )
    
    stats['comments_on_services'] = (
        Comment.objects.filter(
            service__user=user,
            is_deleted=False
        ).exclude(user=user).count()
    )

    hours_given_result = TransactionHistory.objects.filter(
        user=user,
        transaction_type='transfer',
        amount__gt=0
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0')))
    
    stats['hours_given'] = int(hours_given_result['total'] or 0)

    completed_handshakes = Handshake.objects.filter(
        Q(requester=user) | Q(service__user=user),
        status='completed'
    )
    
    handshakes_with_negative = NegativeRep.objects.filter(
        receiver=user,
        handshake__in=completed_handshakes
    ).values('handshake').distinct().count()
    
    stats['completed_no_negative'] = stats['completed_services'] if handshakes_with_negative == 0 else 0

    time_since_registration = timezone.now() - user.date_joined
    stats['months_registered'] = time_since_registration.days // 30
    stats['years_registered'] = time_since_registration.days // 365

    return stats


def assign_achievement(user: User, achievement_id: str) -> bool:
    """
    Assign an achievement to a user and award karma points.
    Note: This is the new function name. For backward compatibility,
    assign_badge is aliased to this function.
    
    Returns True if achievement was newly assigned, False if already had it.
    """
    achievement_info = ACHIEVEMENT_DEFAULTS.get(
        achievement_id,
        {
            "name": achievement_id.replace("-", " ").replace("_", " ").title(),
            "description": "",
            "icon_url": "",
            "karma_points": 0,
            "is_hidden": False,
        },
    )
    # Badge model only has: id, name, description, icon_url
    # Don't include karma_points or is_hidden in defaults
    badge_defaults = {
        "name": achievement_info.get("name", achievement_id.replace("-", " ").replace("_", " ").title()),
        "description": achievement_info.get("description", ""),
        "icon_url": achievement_info.get("icon_url", ""),
    }
    badge, _ = Badge.objects.get_or_create(id=achievement_id, defaults=badge_defaults)
    _, created = UserBadge.objects.get_or_create(user=user, badge=badge)
    
    if created:
        karma_points = achievement_info.get("karma_points", 0)
        if karma_points > 0:
            user.karma_score += karma_points
            user.save(update_fields=['karma_score'])
    
    return created


def get_achievement_progress(user: User) -> Dict[str, Dict]:
    """
    Get progress towards all achievements for a user.
    
    Returns dict with achievement info, current progress, and whether earned.
    """
    stats = get_user_stats(user)
    existing_achievements = set(
        UserBadge.objects.filter(user=user).values_list('badge_id', flat=True)
    )
    
    progress = {}
    
    for achievement_id, (stat_key, threshold) in ACHIEVEMENT_REQUIREMENTS.items():
        current = stats.get(stat_key, 0)
        
        if achievement_id == 'perfect-record':
            has_negative = stats.get('negative_rep_count', 0) > 0
            current = stats.get('completed_services', 0) if not has_negative else 0
        
        achievement_info = ACHIEVEMENT_DEFAULTS.get(achievement_id, {})
        is_hidden = achievement_info.get('is_hidden', False)
        
        progress[achievement_id] = {
            'achievement': {
                'name': achievement_info.get('name', achievement_id),
                'description': achievement_info.get('description', ''),
                'icon_url': achievement_info.get('icon_url', ''),
                'karma_points': achievement_info.get('karma_points', 0),
                'is_hidden': is_hidden,
            },
            'earned': achievement_id in existing_achievements,
            'current': current if (achievement_id in existing_achievements or not is_hidden) else None,
            'threshold': threshold if (achievement_id in existing_achievements or not is_hidden) else None,
            'progress_percent': min(100, int((current / threshold) * 100)) if threshold > 0 and (achievement_id in existing_achievements or not is_hidden) else 0,
        }
    
    return progress


# Backward compatibility aliases
assign_badge = assign_achievement
get_badge_progress = get_achievement_progress


def is_newcomer(user: User) -> bool:
    """
    Check if user is a newcomer (registered less than 30 days ago).
    This is a tag/indicator, not an achievement.
    """
    time_since_registration = timezone.now() - user.date_joined
    return time_since_registration.days < 30


def get_seniority_indicator(user: User) -> str | None:
    """
    Get seniority indicator based on completed services and registration time.
    Returns None if user doesn't qualify for seniority, otherwise returns indicator string.
    """
    stats = get_user_stats(user)
    
    if stats.get('completed_services', 0) >= 5:
        years = stats.get('years_registered', 0)
        months = stats.get('months_registered', 0)
        
        if years >= 3:
            return "Registered for 3+ Years"
        elif years >= 2:
            return "Registered for 2 Years"
        elif years >= 1:
            return "Registered for 1 Year"
        elif months >= 9:
            return "Registered for 9 Months"
        elif months >= 6:
            return "Registered for 6 Months"
        elif months >= 3:
            return "Registered for 3 Months"
    
    return None
