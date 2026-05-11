"""
Tests for WikiData autocomplete entity-type filtering.

Phase 3 tests — verify that search results are filtered to allowed entity types
and that the WikidataSearchView returns entity_type in responses.
"""
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from api.wikidata import classify_and_filter_results


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_claims')
def test_allows_programming_languages(mock_claims):
    """P31=Q9143 (programming language) passes filter."""
    mock_claims.return_value = {'instance_of': ['Q9143'], 'subclass_of': []}

    results = [{'id': 'Q28865', 'label': 'Python', 'description': 'programming language'}]
    filtered = classify_and_filter_results(results)

    assert len(filtered) == 1
    assert filtered[0]['entity_type'] == 'technology'


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_claims')
def test_allows_skills(mock_claims):
    """P31=Q205961 (skill) passes filter."""
    mock_claims.return_value = {'instance_of': ['Q205961'], 'subclass_of': []}

    results = [{'id': 'Q123', 'label': 'Juggling', 'description': 'a skill'}]
    filtered = classify_and_filter_results(results)

    assert len(filtered) == 1
    assert filtered[0]['entity_type'] == 'activity'


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_claims')
def test_blocks_places(mock_claims):
    """P31=Q515 (city) is filtered out."""
    mock_claims.return_value = {'instance_of': ['Q515'], 'subclass_of': []}

    results = [{'id': 'Q84', 'label': 'London', 'description': 'capital of England'}]
    filtered = classify_and_filter_results(results)

    assert len(filtered) == 0


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_claims')
def test_blocks_people(mock_claims):
    """P31=Q5 (human) is filtered out."""
    mock_claims.return_value = {'instance_of': ['Q5'], 'subclass_of': []}

    results = [{'id': 'Q937', 'label': 'Albert Einstein', 'description': 'physicist'}]
    filtered = classify_and_filter_results(results)

    assert len(filtered) == 0


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_claims')
def test_blocks_countries(mock_claims):
    """P31=Q6256 (country) is filtered out."""
    mock_claims.return_value = {'instance_of': ['Q6256'], 'subclass_of': []}

    results = [{'id': 'Q30', 'label': 'United States', 'description': 'country'}]
    filtered = classify_and_filter_results(results)

    assert len(filtered) == 0


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_claims')
def test_allows_unknown_on_api_failure(mock_claims):
    """When P31 fetch fails, include the result (fail open for UX)."""
    mock_claims.return_value = None

    results = [{'id': 'Q999', 'label': 'Something', 'description': 'unknown'}]
    filtered = classify_and_filter_results(results)

    assert len(filtered) == 1
    assert filtered[0].get('entity_type') is None


@pytest.mark.django_db
@patch('api.wikidata.fetch_wikidata_claims')
def test_mixed_results(mock_claims):
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

    assert len(filtered) == 1
    assert filtered[0]['id'] == 'Q28865'


@pytest.fixture
def search_env():
    return APIClient(), reverse('wikidata-search')


@pytest.mark.django_db
@patch('api.wikidata.classify_and_filter_results')
@patch('api.wikidata.search_wikidata_items')
def test_returns_entity_type_in_response(mock_search, mock_classify, search_env):
    """Response includes entity_type for each result."""
    client, url = search_env

    mock_search.return_value = [
        {'id': 'Q28865', 'label': 'Python', 'description': 'programming language'},
    ]
    mock_classify.return_value = [
        {'id': 'Q28865', 'label': 'Python', 'description': 'programming language', 'entity_type': 'technology'},
    ]

    response = client.get(url, {'q': 'python'})

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['entity_type'] == 'technology'
