"""
Tests for hierarchical TagStrategy (parent traversal and entity_type filtering).

Phase 2.1 RED tests — these should fail until search_filters.py is updated.
"""
from decimal import Decimal
from django.test import TestCase

from api.models import Service, Tag, User
from api.search_filters import TagStrategy


class HierarchicalTagStrategyTestCase(TestCase):
    """Test TagStrategy with parent_qid traversal and entity_type filtering."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='testuser@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00'),
        )

        # Tags with hierarchy
        self.tag_prog_lang = Tag.objects.create(
            id='Q9143', name='Programming language',
            entity_type='technology',
        )
        self.tag_python = Tag.objects.create(
            id='Q28865', name='Python',
            parent_qid='Q9143', entity_type='technology', depth=1,
        )
        self.tag_django = Tag.objects.create(
            id='Q290053', name='Django',
            parent_qid='Q1330336', entity_type='technology', depth=1,
        )
        self.tag_cooking = Tag.objects.create(
            id='Q25403900', name='Cooking',
            parent_qid='Q2095', entity_type='food', depth=1,
        )

        # Services
        self.svc_python = Service.objects.create(
            user=self.user, title='Python Tutoring',
            description='Learn Python', type='Offer',
            duration=Decimal('2.00'), location_type='Online',
            max_participants=1, schedule_type='One-Time',
        )
        self.svc_python.tags.add(self.tag_python)

        self.svc_django = Service.objects.create(
            user=self.user, title='Django Help',
            description='Django web framework', type='Offer',
            duration=Decimal('2.00'), location_type='Online',
            max_participants=1, schedule_type='One-Time',
        )
        self.svc_django.tags.add(self.tag_django)

        self.svc_cooking = Service.objects.create(
            user=self.user, title='Cooking Class',
            description='Learn to cook', type='Offer',
            duration=Decimal('3.00'), location_type='In-Person',
            max_participants=5, schedule_type='Recurrent',
        )
        self.svc_cooking.tags.add(self.tag_cooking)

        self.strategy = TagStrategy()

    def test_direct_tag_match_still_works(self):
        """Backward compat: direct tag ID match works as before."""
        qs = Service.objects.filter(status='Active')
        result = list(self.strategy.apply(qs, {'tag': 'Q28865'}))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].title, 'Python Tutoring')

    def test_finds_services_via_parent_qid(self):
        """Searching for parent tag Q9143 finds Python service (parent_qid=Q9143)."""
        qs = Service.objects.filter(status='Active')
        result = list(self.strategy.apply(qs, {'tag': 'Q9143'}))
        titles = [s.title for s in result]
        self.assertIn('Python Tutoring', titles)

    def test_entity_type_filter(self):
        """Search by entity_type='technology' finds tech-tagged services only."""
        qs = Service.objects.filter(status='Active')
        result = list(self.strategy.apply(qs, {'entity_type': 'technology'}))
        titles = [s.title for s in result]
        self.assertIn('Python Tutoring', titles)
        self.assertIn('Django Help', titles)
        self.assertNotIn('Cooking Class', titles)

    def test_no_false_positives(self):
        """Searching for food entity_type does not return tech services."""
        qs = Service.objects.filter(status='Active')
        result = list(self.strategy.apply(qs, {'entity_type': 'food'}))
        titles = [s.title for s in result]
        self.assertIn('Cooking Class', titles)
        self.assertNotIn('Python Tutoring', titles)
        self.assertNotIn('Django Help', titles)

    def test_parent_qid_and_direct_combined(self):
        """Multiple tag IDs including a parent find both direct and child matches."""
        qs = Service.objects.filter(status='Active')
        result = list(self.strategy.apply(qs, {'tags': ['Q9143', 'Q25403900']}))
        titles = [s.title for s in result]
        # Q9143 matches Python via parent_qid, Q25403900 matches Cooking directly
        self.assertIn('Python Tutoring', titles)
        self.assertIn('Cooking Class', titles)
