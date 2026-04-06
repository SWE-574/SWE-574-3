"""
Tests for weighted search scoring (FR-SEA-01).

Phase 2.2 RED tests — these should fail until ScoringStrategy is implemented.
"""
from decimal import Decimal
from django.test import TestCase

from api.models import Service, Tag, User
from api.search_filters import SearchEngine


class SearchScoringTestCase(TestCase):
    """Test annotation-based weighted scoring in SearchEngine."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='testuser@test.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00'),
        )

        self.tag_python = Tag.objects.create(
            id='Q28865', name='Python',
            parent_qid='Q9143', entity_type='technology', depth=1,
        )
        self.tag_prog_lang = Tag.objects.create(
            id='Q9143', name='Programming language',
            entity_type='technology',
        )
        self.tag_cooking = Tag.objects.create(
            id='Q25403900', name='Cooking',
            parent_qid='Q2095', entity_type='food', depth=1,
        )

        # Service with "Python" in title AND tagged Python
        self.svc_title_and_tag = Service.objects.create(
            user=self.user, title='Python Tutoring',
            description='Expert Python help', type='Offer',
            duration=Decimal('2.00'), location_type='Online',
            max_participants=1, schedule_type='One-Time',
        )
        self.svc_title_and_tag.tags.add(self.tag_python)

        # Service with Python tag but NO title match
        self.svc_tag_only = Service.objects.create(
            user=self.user, title='Programming Help',
            description='Various programming', type='Offer',
            duration=Decimal('2.00'), location_type='Online',
            max_participants=1, schedule_type='One-Time',
        )
        self.svc_tag_only.tags.add(self.tag_python)

        # Service with "Python" in description only
        self.svc_desc_only = Service.objects.create(
            user=self.user, title='Coding Class',
            description='Learn Python and more', type='Offer',
            duration=Decimal('2.00'), location_type='Online',
            max_participants=1, schedule_type='One-Time',
        )

        # Completely unrelated service
        self.svc_unrelated = Service.objects.create(
            user=self.user, title='Cooking Class',
            description='Learn to cook', type='Offer',
            duration=Decimal('3.00'), location_type='In-Person',
            max_participants=5, schedule_type='Recurrent',
        )
        self.svc_unrelated.tags.add(self.tag_cooking)

        self.engine = SearchEngine()

    def test_title_match_scores_highest(self):
        """Service with search term in title has the highest score."""
        qs = Service.objects.filter(status='Active')
        result = self.engine.search(qs, {'search': 'Python'})
        scored = list(result)

        # svc_title_and_tag should have title+tag score, highest
        self.assertTrue(hasattr(scored[0], 'search_score'))
        self.assertEqual(scored[0].id, self.svc_title_and_tag.id)

    def test_tag_id_match_scores_0_8(self):
        """Service with direct tag ID match gets score of 0.8."""
        qs = Service.objects.filter(status='Active')
        # Search by tag ID, not text
        result = self.engine.search(qs, {'tag': 'Q28865'})
        scored = {s.id: s.search_score for s in result if hasattr(s, 'search_score')}

        tag_score = scored.get(self.svc_tag_only.id, 0)
        self.assertGreaterEqual(tag_score, 0.8)

    def test_scores_additive(self):
        """Title + tag match scores higher than tag match alone."""
        qs = Service.objects.filter(status='Active')
        result = self.engine.search(qs, {'search': 'Python'})
        scored = {s.id: s.search_score for s in result if hasattr(s, 'search_score')}

        title_and_tag = scored.get(self.svc_title_and_tag.id, 0)
        tag_only = scored.get(self.svc_tag_only.id, 0)
        self.assertGreater(title_and_tag, tag_only)

    def test_results_ordered_by_score(self):
        """Results are in descending score order."""
        qs = Service.objects.filter(status='Active')
        result = list(self.engine.search(qs, {'search': 'Python'}))

        scores = [getattr(s, 'search_score', 0) for s in result]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_no_search_no_scoring(self):
        """Without search/tag params, no search_score annotation."""
        qs = Service.objects.filter(status='Active')
        result = list(self.engine.search(qs, {}))

        for s in result:
            self.assertFalse(hasattr(s, 'search_score'))

    def test_description_match_included(self):
        """Service with search term in description is found."""
        qs = Service.objects.filter(status='Active')
        result = list(self.engine.search(qs, {'search': 'Python'}))
        result_ids = [s.id for s in result]
        self.assertIn(self.svc_desc_only.id, result_ids)

    def test_unrelated_not_in_results(self):
        """Unrelated service is not in search results."""
        qs = Service.objects.filter(status='Active')
        result = list(self.engine.search(qs, {'search': 'Python'}))
        result_ids = [s.id for s in result]
        self.assertNotIn(self.svc_unrelated.id, result_ids)
