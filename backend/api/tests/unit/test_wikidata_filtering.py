"""
Tests for WikiData autocomplete entity-type filtering.

Phase 3 tests — verify that search results are filtered to allowed entity types
and that the WikidataSearchView returns entity_type in responses.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from unittest.mock import patch, MagicMock

from api.wikidata import classify_and_filter_results


class ClassifyAndFilterResultsTestCase(TestCase):
    """Tests for classify_and_filter_results()."""

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_allows_programming_languages(self, mock_claims):
        """P31=Q9143 (programming language) passes filter."""
        mock_claims.return_value = {
            'instance_of': ['Q9143'],
            'subclass_of': [],
        }

        results = [{'id': 'Q28865', 'label': 'Python', 'description': 'programming language'}]
        filtered = classify_and_filter_results(results)

        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]['entity_type'], 'technology')

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_allows_skills(self, mock_claims):
        """P31=Q205961 (skill) passes filter."""
        mock_claims.return_value = {
            'instance_of': ['Q205961'],
            'subclass_of': [],
        }

        results = [{'id': 'Q123', 'label': 'Juggling', 'description': 'a skill'}]
        filtered = classify_and_filter_results(results)

        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]['entity_type'], 'activity')

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_blocks_places(self, mock_claims):
        """P31=Q515 (city) is filtered out."""
        mock_claims.return_value = {
            'instance_of': ['Q515'],
            'subclass_of': [],
        }

        results = [{'id': 'Q84', 'label': 'London', 'description': 'capital of England'}]
        filtered = classify_and_filter_results(results)

        self.assertEqual(len(filtered), 0)

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_blocks_people(self, mock_claims):
        """P31=Q5 (human) is filtered out."""
        mock_claims.return_value = {
            'instance_of': ['Q5'],
            'subclass_of': [],
        }

        results = [{'id': 'Q937', 'label': 'Albert Einstein', 'description': 'physicist'}]
        filtered = classify_and_filter_results(results)

        self.assertEqual(len(filtered), 0)

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_blocks_countries(self, mock_claims):
        """P31=Q6256 (country) is filtered out."""
        mock_claims.return_value = {
            'instance_of': ['Q6256'],
            'subclass_of': [],
        }

        results = [{'id': 'Q30', 'label': 'United States', 'description': 'country'}]
        filtered = classify_and_filter_results(results)

        self.assertEqual(len(filtered), 0)

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_allows_unknown_on_api_failure(self, mock_claims):
        """When P31 fetch fails, include the result (fail open for UX)."""
        mock_claims.return_value = None

        results = [{'id': 'Q999', 'label': 'Something', 'description': 'unknown'}]
        filtered = classify_and_filter_results(results)

        # Fail open: include with entity_type=None
        self.assertEqual(len(filtered), 1)
        self.assertIsNone(filtered[0].get('entity_type'))

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_mixed_results(self, mock_claims):
        """Mix of allowed and blocked types filters correctly."""
        def side_effect(qid):
            if qid == 'Q28865':
                return {'instance_of': ['Q9143'], 'subclass_of': []}
            elif qid == 'Q84':
                return {'instance_of': ['Q515'], 'subclass_of': []}
            return None

        mock_claims.side_effect = side_effect

        results = [
            {'id': 'Q28865', 'label': 'Python', 'description': 'programming language'},
            {'id': 'Q84', 'label': 'London', 'description': 'capital of England'},
        ]
        filtered = classify_and_filter_results(results)

        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]['id'], 'Q28865')


class WikidataSearchViewEntityTypeTests(APITestCase):
    """Test WikidataSearchView returns entity_type in response."""

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('wikidata-search')

    @patch('api.wikidata.classify_and_filter_results')
    @patch('api.wikidata.search_wikidata_items')
    def test_returns_entity_type_in_response(self, mock_search, mock_classify):
        """Response includes entity_type for each result."""
        mock_search.return_value = [
            {'id': 'Q28865', 'label': 'Python', 'description': 'programming language'},
        ]
        mock_classify.return_value = [
            {'id': 'Q28865', 'label': 'Python', 'description': 'programming language', 'entity_type': 'technology'},
        ]

        response = self.client.get(self.url, {'q': 'python'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['entity_type'], 'technology')
