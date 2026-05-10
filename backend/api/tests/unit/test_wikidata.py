"""
Tests for Wikidata integration - search endpoint and tag handling
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from api.models import Service, Tag, User
from api.serializers import TagSerializer
from api.wikidata import fetch_wikidata_item, search_wikidata_items


@pytest.fixture
def search_env():
    return SimpleNamespace(client=APIClient(), url=reverse('wikidata-search'))


@pytest.mark.django_db
@patch('api.wikidata.classify_and_filter_results', side_effect=lambda r: r)
@patch('api.wikidata.search_wikidata_items')
def test_wikidata_search_success(mock_search, _mock_classify, search_env):
    mock_search.return_value = [
        {'id': 'Q28865', 'label': 'Python', 'description': 'high-level programming language'},
        {'id': 'Q81', 'label': 'Python', 'description': 'genus of reptiles'},
    ]

    response = search_env.client.get(search_env.url, {'q': 'python'})

    assert response.status_code == 200
    assert len(response.data) == 2
    assert response.data[0]['id'] == 'Q28865'
    assert response.data[0]['label'] == 'Python'
    mock_search.assert_called_once_with('python', limit=10)


@pytest.mark.django_db
def test_wikidata_search_empty_query(search_env):
    response = search_env.client.get(search_env.url, {'q': ''})
    assert response.status_code == 400

    response = search_env.client.get(search_env.url, {'q': '   '})
    assert response.status_code == 400


@pytest.mark.django_db
def test_wikidata_search_missing_query(search_env):
    response = search_env.client.get(search_env.url)
    assert response.status_code == 400


@pytest.mark.django_db
@patch('api.wikidata.search_wikidata_items')
def test_wikidata_search_api_failure(mock_search, search_env):
    mock_search.return_value = []
    response = search_env.client.get(search_env.url, {'q': 'nonexistent12345'})
    assert response.status_code == 200
    assert response.data == []


@pytest.mark.django_db
@patch('api.wikidata.search_wikidata_items')
def test_wikidata_search_with_limit(mock_search, search_env):
    mock_search.return_value = []
    response = search_env.client.get(search_env.url, {'q': 'python', 'limit': '5'})
    assert response.status_code == 200
    mock_search.assert_called_once_with('python', limit=5)


@pytest.mark.django_db
@patch('api.wikidata.search_wikidata_items')
def test_wikidata_search_limit_clamped(mock_search, search_env):
    mock_search.return_value = []

    search_env.client.get(search_env.url, {'q': 'python', 'limit': '100'})
    mock_search.assert_called_with('python', limit=20)

    search_env.client.get(search_env.url, {'q': 'python', 'limit': '0'})
    mock_search.assert_called_with('python', limit=1)

    search_env.client.get(search_env.url, {'q': 'python', 'limit': 'invalid'})
    mock_search.assert_called_with('python', limit=10)


@pytest.mark.django_db
@patch('api.wikidata.requests.get')
def test_search_wikidata_items_success(mock_get):
    mock_response = MagicMock()
    mock_response.json.return_value = {
        'search': [
            {'id': 'Q28865', 'label': 'Python', 'description': 'high-level programming language'},
        ]
    }
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    results = search_wikidata_items('python', limit=5)

    assert len(results) == 1
    assert results[0]['id'] == 'Q28865'
    assert results[0]['label'] == 'Python'


@pytest.mark.django_db
@patch('api.wikidata.requests.get')
def test_search_wikidata_items_api_error(mock_get):
    import requests as req
    mock_get.side_effect = req.RequestException('API Error')

    results = search_wikidata_items('python')

    assert results == []


@pytest.mark.django_db
@patch('api.wikidata.requests.get')
def test_fetch_wikidata_item_success(mock_get):
    mock_response = MagicMock()
    mock_response.json.return_value = {
        'entities': {
            'Q28865': {
                'labels': {'en': {'value': 'Python'}},
                'descriptions': {'en': {'value': 'high-level programming language'}},
                'aliases': {'en': [{'value': 'Python programming language'}]},
            }
        }
    }
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = fetch_wikidata_item('Q28865')

    assert result is not None
    assert result['id'] == 'Q28865'
    assert result['label'] == 'Python'
    assert result['description'] == 'high-level programming language'


@pytest.mark.django_db
@patch('api.wikidata.requests.get')
def test_fetch_wikidata_item_normalizes_lowercase_qid(mock_get):
    mock_response = MagicMock()
    mock_response.json.return_value = {
        'entities': {
            'Q17195715': {
                'labels': {'en': {'value': 'Yoga'}},
                'descriptions': {'en': {'value': 'group of physical, mental, and spiritual practices'}},
                'aliases': {'en': []},
            }
        }
    }
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = fetch_wikidata_item('q17195715')

    assert result is not None
    assert result['id'] == 'Q17195715'
    assert result['label'] == 'Yoga'


@pytest.mark.django_db
def test_fetch_wikidata_item_invalid_id():
    assert fetch_wikidata_item('invalid') is None
    assert fetch_wikidata_item('') is None
    assert fetch_wikidata_item(None) is None


@pytest.fixture
def auth_env(db):
    user = User.objects.create_user(
        email='test@example.com', password='testpass123',
        first_name='Test', last_name='User',
        timebank_balance=Decimal('10.00'), is_verified=True,
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return SimpleNamespace(user=user, client=client)


@pytest.mark.django_db
def test_tag_creation_with_qid():
    tag = Tag.objects.create(id='Q28865', name='Python')
    assert tag.id == 'Q28865'
    assert tag.name == 'Python'


@pytest.mark.django_db
def test_tag_creation_preserves_qid_format():
    Tag.objects.create(id='Q12345678', name='Some Concept')
    retrieved_tag = Tag.objects.get(id='Q12345678')
    assert retrieved_tag.id == 'Q12345678'


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_item')
def test_tag_serializer_wikidata_enrichment(mock_fetch):
    mock_fetch.return_value = {
        'id': 'Q28865', 'label': 'Python',
        'description': 'high-level programming language',
        'aliases': ['Python programming language'],
    }

    tag = Tag.objects.create(id='Q28865', name='Python')
    serializer = TagSerializer(tag)

    assert 'wikidata_info' in serializer.data
    assert serializer.data['wikidata_info']['label'] == 'Python'
    mock_fetch.assert_called_once_with('Q28865')


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_item')
def test_tag_serializer_uses_wikidata_label_when_name_is_qid(mock_fetch):
    mock_fetch.return_value = {
        'id': 'Q17195715', 'label': 'Yoga',
        'description': 'group of physical, mental, and spiritual practices',
        'aliases': [],
    }

    tag = Tag.objects.create(id='Q17195715', name='Q17195715')
    serializer = TagSerializer(tag)

    assert serializer.data['name'] == 'Yoga'
    assert serializer.data['wikidata_info']['label'] == 'Yoga'
    mock_fetch.assert_called_once_with('Q17195715')


@pytest.mark.django_db
def test_tag_serializer_no_enrichment_for_non_qid():
    tag = Tag.objects.create(id='cooking', name='Cooking')
    serializer = TagSerializer(tag)
    assert serializer.data['wikidata_info'] is None


@pytest.mark.django_db
def test_service_creation_with_wikidata_tags(auth_env):
    Tag.objects.create(id='Q28865', name='Python')

    response = auth_env.client.post('/api/services/', {
        'title': 'Python Tutoring',
        'description': 'Learn Python programming',
        'type': 'Offer', 'duration': 2,
        'location_type': 'Online',
        'max_participants': 1, 'schedule_type': 'One-Time',
        'tag_ids': ['Q28865'],
    })

    assert response.status_code == 201
    service = Service.objects.get(id=response.data['id'])
    assert service.tags.count() == 1
    assert service.tags.first().id == 'Q28865'


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_item')
def test_service_creation_auto_creates_wikidata_tag(mock_fetch, auth_env):
    assert not Tag.objects.filter(id='Q2005').exists()

    mock_fetch.return_value = {
        'id': 'Q2005', 'label': 'JavaScript',
        'description': 'high-level programming language',
    }

    response = auth_env.client.post('/api/services/', {
        'title': 'JavaScript Tutoring',
        'description': 'Learn JavaScript programming',
        'type': 'Offer', 'duration': 2,
        'location_type': 'Online',
        'max_participants': 1, 'schedule_type': 'One-Time',
        'tag_ids': ['Q2005'],
    })

    assert response.status_code == 201
    assert Tag.objects.filter(id='Q2005').exists()
    tag = Tag.objects.get(id='Q2005')
    assert tag.name == 'JavaScript'

    service = Service.objects.get(id=response.data['id'])
    assert service.tags.count() == 1
    assert service.tags.first().id == 'Q2005'

    mock_fetch.assert_any_call('Q2005')


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_item')
def test_service_creation_handles_wikidata_api_failure(mock_fetch, auth_env):
    assert not Tag.objects.filter(id='Q99999').exists()

    mock_fetch.return_value = None

    response = auth_env.client.post('/api/services/', {
        'title': 'Mystery Topic Tutoring',
        'description': 'Learn something mysterious',
        'type': 'Offer', 'duration': 1,
        'location_type': 'Online',
        'max_participants': 1, 'schedule_type': 'One-Time',
        'tag_ids': ['Q99999'],
    })

    assert response.status_code == 201
    assert Tag.objects.filter(id='Q99999').exists()
    tag = Tag.objects.get(id='Q99999')
    assert tag.name == 'Q99999'

    service = Service.objects.get(id=response.data['id'])
    assert service.tags.count() == 1


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_item')
def test_service_creation_with_mixed_existing_and_new_qids(mock_fetch, auth_env):
    Tag.objects.create(id='Q28865', name='Python')

    assert not Tag.objects.filter(id='Q2005').exists()

    mock_fetch.return_value = {
        'id': 'Q2005', 'label': 'JavaScript',
        'description': 'high-level programming language',
    }

    response = auth_env.client.post('/api/services/', {
        'title': 'Web Development Tutoring',
        'description': 'Learn Python and JavaScript',
        'type': 'Offer', 'duration': 3,
        'location_type': 'Online',
        'max_participants': 1, 'schedule_type': 'One-Time',
        'tag_ids': ['Q28865', 'Q2005'],
    })

    assert response.status_code == 201
    service = Service.objects.get(id=response.data['id'])
    assert service.tags.count() == 2
    tag_ids = set(service.tags.values_list('id', flat=True))
    assert tag_ids == {'Q28865', 'Q2005'}

    mock_fetch.assert_any_call('Q2005')


@pytest.mark.django_db
@patch('api.wikidata.search_wikidata_items')
def test_wikidata_search_allows_normal_usage(mock_search, search_env):
    """Normal usage is not rate limited."""
    mock_search.return_value = []

    for _ in range(5):
        response = search_env.client.get(search_env.url, {'q': 'test'})
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# #525 — Wikidata tag search performance: cache + batched claim lookups
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@patch('api.wikidata.requests.get')
def test_search_wikidata_items_returns_cached_payload_without_upstream_call(mock_get):
    """A repeated query must hit the Django cache, not the wbsearchentities API."""
    from django.core.cache import cache

    cache.clear()
    mock_response = MagicMock()
    mock_response.json.return_value = {
        'search': [
            {'id': 'Q28865', 'label': 'Python', 'description': 'high-level programming language'},
        ]
    }
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    first = search_wikidata_items('cachehit-python', limit=5)
    second = search_wikidata_items('cachehit-python', limit=5)

    assert first == second
    # The upstream wbsearchentities endpoint should fire exactly once
    # across the two calls -- the second one is served from the cache.
    assert mock_get.call_count == 1


@pytest.mark.django_db
@patch('api.wikidata.requests.get')
def test_fetch_wikidata_claims_batch_uses_single_upstream_call(mock_get):
    """Batched claim resolution issues one wbgetentities request, not N."""
    from django.core.cache import cache
    from api.wikidata import fetch_wikidata_claims_batch

    cache.clear()
    mock_response = MagicMock()
    mock_response.json.return_value = {
        'entities': {
            'Q28865': {'claims': {'P31': [{'mainsnak': {'datavalue': {'value': {'id': 'Q9143'}}}}]}},
            'Q2005': {'claims': {'P31': [{'mainsnak': {'datavalue': {'value': {'id': 'Q9143'}}}}]}},
            'Q17195715': {'claims': {'P31': [{'mainsnak': {'datavalue': {'value': {'id': 'Q1914636'}}}}]}},
        },
    }
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = fetch_wikidata_claims_batch(['Q28865', 'Q2005', 'Q17195715'])

    assert mock_get.call_count == 1
    assert set(result.keys()) == {'Q28865', 'Q2005', 'Q17195715'}
    assert result['Q28865']['instance_of'] == ['Q9143']
    assert result['Q2005']['instance_of'] == ['Q9143']
    assert result['Q17195715']['instance_of'] == ['Q1914636']

    # A second batch call for the same QIDs is satisfied entirely from
    # the cache populated above.
    cached = fetch_wikidata_claims_batch(['Q28865', 'Q2005', 'Q17195715'])
    assert cached == result
    assert mock_get.call_count == 1


@pytest.mark.django_db
@patch('api.wikidata.requests.get')
def test_classify_and_filter_results_does_not_fan_out_per_qid(mock_get):
    """The classification step must not fan out one HTTP call per result."""
    from django.core.cache import cache
    from api.wikidata import classify_and_filter_results

    cache.clear()
    mock_response = MagicMock()
    mock_response.json.return_value = {
        'entities': {
            f'Q{1000 + i}': {
                'claims': {'P31': [{'mainsnak': {'datavalue': {'value': {'id': 'Q9143'}}}}]}
            }
            for i in range(5)
        },
    }
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    raw = [{'id': f'Q{1000 + i}', 'label': f'Item {i}'} for i in range(5)]
    classified = classify_and_filter_results(raw)

    # One batched wbgetentities call covers all five rows.
    assert mock_get.call_count == 1
    assert len(classified) == 5
    assert all(item['entity_type'] == 'technology' for item in classified)
