"""
Tests for Wikidata integration - search endpoint and tag handling
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from unittest.mock import patch, MagicMock
from decimal import Decimal

from api.models import User, Tag, Service
from api.serializers import TagSerializer
from api.wikidata import search_wikidata_items, fetch_wikidata_item


class WikidataSearchViewTests(APITestCase):
    """Tests for the /api/wikidata/search/ endpoint"""

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('wikidata-search')

    @patch('api.wikidata.search_wikidata_items')
    def test_wikidata_search_success(self, mock_search):
        """Test successful Wikidata search returns QID, label, and description"""
        mock_search.return_value = [
            {
                'id': 'Q28865',
                'label': 'Python',
                'description': 'high-level programming language'
            },
            {
                'id': 'Q81',
                'label': 'Python',
                'description': 'genus of reptiles'
            }
        ]

        response = self.client.get(self.url, {'q': 'python'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]['id'], 'Q28865')
        self.assertEqual(response.data[0]['label'], 'Python')
        self.assertEqual(response.data[0]['description'], 'high-level programming language')
        mock_search.assert_called_once_with('python', limit=10)

    def test_wikidata_search_empty_query(self):
        """Test that empty query returns 400 error"""
        response = self.client.get(self.url, {'q': ''})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.get(self.url, {'q': '   '})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_wikidata_search_missing_query(self):
        """Test that missing query parameter returns 400 error"""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('api.wikidata.search_wikidata_items')
    def test_wikidata_search_api_failure(self, mock_search):
        """Test that API failure returns empty list gracefully"""
        mock_search.return_value = []

        response = self.client.get(self.url, {'q': 'nonexistent12345'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    @patch('api.wikidata.search_wikidata_items')
    def test_wikidata_search_with_limit(self, mock_search):
        """Test that limit parameter is passed correctly"""
        mock_search.return_value = []

        response = self.client.get(self.url, {'q': 'python', 'limit': '5'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_search.assert_called_once_with('python', limit=5)

    @patch('api.wikidata.search_wikidata_items')
    def test_wikidata_search_limit_clamped(self, mock_search):
        """Test that limit is clamped between 1 and 20"""
        mock_search.return_value = []

        response = self.client.get(self.url, {'q': 'python', 'limit': '100'})
        mock_search.assert_called_with('python', limit=20)

        response = self.client.get(self.url, {'q': 'python', 'limit': '0'})
        mock_search.assert_called_with('python', limit=1)

        response = self.client.get(self.url, {'q': 'python', 'limit': 'invalid'})
        mock_search.assert_called_with('python', limit=10)


class WikidataUtilityTests(TestCase):
    """Tests for the wikidata.py utility functions"""

    @patch('api.wikidata.requests.get')
    def test_search_wikidata_items_success(self, mock_get):
        """Test search_wikidata_items returns properly formatted results"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'search': [
                {
                    'id': 'Q28865',
                    'label': 'Python',
                    'description': 'high-level programming language'
                }
            ]
        }
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        results = search_wikidata_items('python', limit=5)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], 'Q28865')
        self.assertEqual(results[0]['label'], 'Python')

    @patch('api.wikidata.requests.get')
    def test_search_wikidata_items_api_error(self, mock_get):
        """Test search_wikidata_items returns empty list on API error"""
        import requests as req
        mock_get.side_effect = req.RequestException('API Error')

        results = search_wikidata_items('python')

        self.assertEqual(results, [])

    @patch('api.wikidata.requests.get')
    def test_fetch_wikidata_item_success(self, mock_get):
        """Test fetch_wikidata_item returns item details"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'entities': {
                'Q28865': {
                    'labels': {'en': {'value': 'Python'}},
                    'descriptions': {'en': {'value': 'high-level programming language'}},
                    'aliases': {'en': [{'value': 'Python programming language'}]}
                }
            }
        }
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        result = fetch_wikidata_item('Q28865')

        self.assertIsNotNone(result)
        self.assertEqual(result['id'], 'Q28865')
        self.assertEqual(result['label'], 'Python')
        self.assertEqual(result['description'], 'high-level programming language')

    def test_fetch_wikidata_item_invalid_id(self):
        """Test fetch_wikidata_item returns None for invalid ID"""
        result = fetch_wikidata_item('invalid')
        self.assertIsNone(result)

        result = fetch_wikidata_item('')
        self.assertIsNone(result)

        result = fetch_wikidata_item(None)
        self.assertIsNone(result)


class TagWithWikidataTests(APITestCase):
    """Tests for tag creation and serialization with Wikidata QIDs"""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User',
            timebank_balance=Decimal('10.00')
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_tag_creation_with_qid(self):
        """Test that tags can be created with Wikidata QID as ID"""
        tag = Tag.objects.create(
            id='Q28865',
            name='Python'
        )

        self.assertEqual(tag.id, 'Q28865')
        self.assertEqual(tag.name, 'Python')

    def test_tag_creation_preserves_qid_format(self):
        """Test that QID format is preserved in database"""
        tag = Tag.objects.create(
            id='Q12345678',
            name='Some Concept'
        )

        retrieved_tag = Tag.objects.get(id='Q12345678')
        self.assertEqual(retrieved_tag.id, 'Q12345678')

    @patch('api.wikidata.fetch_wikidata_item')
    def test_tag_serializer_wikidata_enrichment(self, mock_fetch):
        """Test that TagSerializer enriches tags with Wikidata info when ID starts with Q"""
        mock_fetch.return_value = {
            'id': 'Q28865',
            'label': 'Python',
            'description': 'high-level programming language',
            'aliases': ['Python programming language']
        }

        tag = Tag.objects.create(id='Q28865', name='Python')
        serializer = TagSerializer(tag)

        self.assertIn('wikidata_info', serializer.data)
        self.assertEqual(serializer.data['wikidata_info']['label'], 'Python')
        mock_fetch.assert_called_once_with('Q28865')

    def test_tag_serializer_no_enrichment_for_non_qid(self):
        """Test that TagSerializer does not enrich non-QID tags"""
        tag = Tag.objects.create(id='cooking', name='Cooking')
        serializer = TagSerializer(tag)

        self.assertIsNone(serializer.data['wikidata_info'])

    def test_service_creation_with_wikidata_tags(self):
        """Test that services can be created with Wikidata-based tags"""
        tag = Tag.objects.create(id='Q28865', name='Python')

        response = self.client.post('/api/services/', {
            'title': 'Python Tutoring',
            'description': 'Learn Python programming',
            'type': 'Offer',
            'duration': 2,
            'location_type': 'Online',
            'max_participants': 1,
            'schedule_type': 'One-Time',
            'tag_ids': ['Q28865']
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        service = Service.objects.get(id=response.data['id'])
        self.assertEqual(service.tags.count(), 1)
        self.assertEqual(service.tags.first().id, 'Q28865')

    @patch('api.wikidata.fetch_wikidata_item')
    def test_service_creation_auto_creates_wikidata_tag(self, mock_fetch):
        """Test that Wikidata tags are auto-created when they don't exist in DB."""
        self.assertFalse(Tag.objects.filter(id='Q2005').exists())
        
        mock_fetch.return_value = {
            'id': 'Q2005',
            'label': 'JavaScript',
            'description': 'high-level programming language'
        }

        response = self.client.post('/api/services/', {
            'title': 'JavaScript Tutoring',
            'description': 'Learn JavaScript programming',
            'type': 'Offer',
            'duration': 2,
            'location_type': 'Online',
            'max_participants': 1,
            'schedule_type': 'One-Time',
            'tag_ids': ['Q2005']
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        self.assertTrue(Tag.objects.filter(id='Q2005').exists())
        tag = Tag.objects.get(id='Q2005')
        self.assertEqual(tag.name, 'JavaScript')
        
        service = Service.objects.get(id=response.data['id'])
        self.assertEqual(service.tags.count(), 1)
        self.assertEqual(service.tags.first().id, 'Q2005')
        
        mock_fetch.assert_any_call('Q2005')

    @patch('api.wikidata.fetch_wikidata_item')
    def test_service_creation_handles_wikidata_api_failure(self, mock_fetch):
        """Test that service creation succeeds even if Wikidata API fails."""
        self.assertFalse(Tag.objects.filter(id='Q99999').exists())
        
        mock_fetch.return_value = None

        response = self.client.post('/api/services/', {
            'title': 'Mystery Topic Tutoring',
            'description': 'Learn something mysterious',
            'type': 'Offer',
            'duration': 1,
            'location_type': 'Online',
            'max_participants': 1,
            'schedule_type': 'One-Time',
            'tag_ids': ['Q99999']
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        self.assertTrue(Tag.objects.filter(id='Q99999').exists())
        tag = Tag.objects.get(id='Q99999')
        self.assertEqual(tag.name, 'Q99999')
        
        service = Service.objects.get(id=response.data['id'])
        self.assertEqual(service.tags.count(), 1)

    @patch('api.wikidata.fetch_wikidata_item')
    def test_service_creation_with_mixed_existing_and_new_qids(self, mock_fetch):
        """Test creating a service with both existing and new Wikidata tags."""
        Tag.objects.create(id='Q28865', name='Python')
        
        self.assertFalse(Tag.objects.filter(id='Q2005').exists())
        
        mock_fetch.return_value = {
            'id': 'Q2005',
            'label': 'JavaScript',
            'description': 'high-level programming language'
        }

        response = self.client.post('/api/services/', {
            'title': 'Web Development Tutoring',
            'description': 'Learn Python and JavaScript',
            'type': 'Offer',
            'duration': 3,
            'location_type': 'Online',
            'max_participants': 2,
            'schedule_type': 'Recurrent',
            'tag_ids': ['Q28865', 'Q2005']
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        service = Service.objects.get(id=response.data['id'])
        self.assertEqual(service.tags.count(), 2)
        tag_ids = set(service.tags.values_list('id', flat=True))
        self.assertEqual(tag_ids, {'Q28865', 'Q2005'})
        
        mock_fetch.assert_any_call('Q2005')


class WikidataSearchRateLimitTests(APITestCase):
    """Tests for rate limiting on Wikidata search endpoint"""

    def setUp(self):
        self.client = APIClient()
        self.url = reverse('wikidata-search')

    @patch('api.wikidata.search_wikidata_items')
    def test_wikidata_search_allows_normal_usage(self, mock_search):
        """Test that normal usage is not rate limited"""
        mock_search.return_value = []

        for _ in range(5):
            response = self.client.get(self.url, {'q': 'test'})
            self.assertEqual(response.status_code, status.HTTP_200_OK)

