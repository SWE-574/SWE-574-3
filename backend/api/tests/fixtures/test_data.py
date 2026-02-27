"""
Reusable test data fixtures
"""
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

# Sample user data
SAMPLE_USERS = [
    {
        'email': 'testuser1@example.com',
        'first_name': 'Test',
        'last_name': 'User1',
        'timebank_balance': Decimal('5.00'),
        'karma_score': 10,
    },
    {
        'email': 'testuser2@example.com',
        'first_name': 'Test',
        'last_name': 'User2',
        'timebank_balance': Decimal('3.00'),
        'karma_score': 5,
    },
]

# Sample service data
SAMPLE_SERVICES = [
    {
        'title': 'Cooking Lesson',
        'description': 'Learn to cook traditional dishes',
        'type': 'Offer',
        'duration': Decimal('2.00'),
        'location_type': 'In-Person',
        'location_area': 'Beşiktaş',
        'max_participants': 2,
    },
    {
        'title': 'Need Help with Tech',
        'description': 'Looking for help setting up my computer',
        'type': 'Need',
        'duration': Decimal('1.50'),
        'location_type': 'Online',
        'max_participants': 1,
    },
]

# Sample tag data
SAMPLE_TAGS = [
    {'id': 'Q8476', 'name': 'Cooking'},
    {'id': 'Q7186', 'name': 'Chess'},
    {'id': 'Q11466', 'name': 'Technology'},
]

# Sample handshake statuses for testing
HANDSHAKE_STATUSES = ['pending', 'accepted', 'completed', 'cancelled', 'denied']

# Sample reputation data
SAMPLE_REPUTATION = {
    'is_punctual': True,
    'is_helpful': True,
    'is_kind': True,
    'comment': 'Great service, very helpful!',
}

# Test timestamps
NOW = timezone.now()
ONE_DAY_AGO = NOW - timedelta(days=1)
ONE_WEEK_AGO = NOW - timedelta(days=7)
ONE_MONTH_AGO = NOW - timedelta(days=30)
