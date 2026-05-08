"""
Tests for WikiData P31/P279 hierarchy fetching and entity type resolution.

Phase 1.2 RED tests — these should fail until wikidata.py is updated.
"""
import pytest
from django.test import TestCase
from unittest.mock import patch, MagicMock

from api.wikidata import fetch_wikidata_claims, resolve_entity_type


def _mock_claims_response(entity_id, claims):
    """Build a mock wbgetentities response with claims."""
    mock_response = MagicMock()
    mock_response.json.return_value = {
        'entities': {
            entity_id: {
                'type': 'item',
                'id': entity_id,
                'claims': claims,
            }
        }
    }
    mock_response.raise_for_status = MagicMock()
    return mock_response


def _p31_claim(*qids):
    """Build a P31 (instance of) claims dict."""
    return {
        'P31': [
            {
                'mainsnak': {
                    'snaktype': 'value',
                    'property': 'P31',
                    'datavalue': {
                        'value': {'entity-type': 'item', 'numeric-id': int(qid[1:]), 'id': qid},
                        'type': 'wikibase-entityid',
                    },
                }
            }
            for qid in qids
        ]
    }


def _p279_claim(*qids):
    """Build a P279 (subclass of) claims dict."""
    return {
        'P279': [
            {
                'mainsnak': {
                    'snaktype': 'value',
                    'property': 'P279',
                    'datavalue': {
                        'value': {'entity-type': 'item', 'numeric-id': int(qid[1:]), 'id': qid},
                        'type': 'wikibase-entityid',
                    },
                }
            }
            for qid in qids
        ]
    }
"""Tests for fetch_wikidata_claims()."""

@patch('api.wikidata.requests.get')
@pytest.mark.django_db
def test_returns_p31_instance_of(mock_get):
    """P31 claims are returned as instance_of list."""
    mock_get.return_value = _mock_claims_response(
        'Q28865', _p31_claim('Q9143')
    )

    result = fetch_wikidata_claims('Q28865')

    assert result is not None
    assert 'instance_of' in result
    assert result['instance_of'] == ['Q9143']

@patch('api.wikidata.requests.get')
@pytest.mark.django_db
def test_returns_p279_subclass_of(mock_get):
    """P279 claims are returned as subclass_of list."""
    mock_get.return_value = _mock_claims_response(
        'Q9143', _p279_claim('Q21198')
    )

    result = fetch_wikidata_claims('Q9143')

    assert result is not None
    assert 'subclass_of' in result
    assert result['subclass_of'] == ['Q21198']

@patch('api.wikidata.requests.get')
@pytest.mark.django_db
def test_returns_both_p31_and_p279(mock_get):
    """Both P31 and P279 can appear together."""
    claims = {**_p31_claim('Q9143'), **_p279_claim('Q21198')}
    mock_get.return_value = _mock_claims_response('Q28865', claims)

    result = fetch_wikidata_claims('Q28865')

    assert result['instance_of'] == ['Q9143']
    assert result['subclass_of'] == ['Q21198']

@patch('api.wikidata.requests.get')
@pytest.mark.django_db
def test_handles_missing_claims(mock_get):
    """Entity with no claims returns empty dict."""
    mock_get.return_value = _mock_claims_response('Q99999', {})

    result = fetch_wikidata_claims('Q99999')

    assert result is not None
    assert result.get('instance_of', []) == []
    assert result.get('subclass_of', []) == []

@patch('api.wikidata.requests.get')
@pytest.mark.django_db
def test_handles_api_failure(mock_get):
    """API timeout/error returns None."""
    import requests as req
    mock_get.side_effect = req.Timeout('timeout')

    result = fetch_wikidata_claims('Q28865')

    assert result is None

@patch('api.wikidata.requests.get')
@pytest.mark.django_db
def test_multiple_p31_values(mock_get):
    """Entity with multiple P31 values returns all of them."""
    mock_get.return_value = _mock_claims_response(
        'Q28865', _p31_claim('Q9143', 'Q7397')
    )

    result = fetch_wikidata_claims('Q28865')

    assert len(result['instance_of']) == 2
    assert 'Q9143' in result['instance_of']
    assert 'Q7397' in result['instance_of']

@pytest.mark.django_db
def test_invalid_qid_returns_none():
    """Non-QID input returns None without API call."""
    result = fetch_wikidata_claims('invalid')
    assert result is None

    result = fetch_wikidata_claims('')
    assert result is None

    result = fetch_wikidata_claims(None)
    assert result is None
"""Tests for resolve_entity_type()."""

@patch('api.wikidata.fetch_wikidata_claims')
@pytest.mark.django_db
def test_direct_match(mock_claims):
    """QID that is directly in ENTITY_TYPE_MAP resolves immediately."""
    # Q9143 = programming language -> technology
    mock_claims.return_value = {'instance_of': [], 'subclass_of': []}

    result = resolve_entity_type('Q9143')

    assert result == 'technology'

@patch('api.wikidata.fetch_wikidata_claims')
@pytest.mark.django_db
def test_via_parent_p31(mock_claims):
    """QID not in map, but its P31 parent is -> resolves via parent."""
    # Q28865 (Python) -> P31 -> Q9143 (programming language) -> technology
    mock_claims.return_value = {
        'instance_of': ['Q9143'],
        'subclass_of': [],
    }

    result = resolve_entity_type('Q28865')

    assert result == 'technology'

@patch('api.wikidata.fetch_wikidata_claims')
@pytest.mark.django_db
def test_via_parent_p279(mock_claims):
    """Resolves via P279 (subclass of) when P31 doesn't match."""
    # Hypothetical: entity -> P279 -> Q349 (sport) -> sports
    mock_claims.return_value = {
        'instance_of': [],
        'subclass_of': ['Q349'],
    }

    result = resolve_entity_type('Q123456')

    assert result == 'sports'

@patch('api.wikidata.fetch_wikidata_claims')
@pytest.mark.django_db
def test_unknown_parent_returns_other(mock_claims):
    """When parent chain doesn't match any known type, returns 'other'."""
    mock_claims.return_value = {
        'instance_of': ['Q999999999'],
        'subclass_of': [],
    }

    result = resolve_entity_type('Q123456')

    assert result == 'other'

@patch('api.wikidata.fetch_wikidata_claims')
@pytest.mark.django_db
def test_max_depth_prevents_infinite_loop(mock_claims):
    """Traversal stops after max_depth levels."""
    # Each call returns an unknown parent, forcing deeper traversal
    mock_claims.return_value = {
        'instance_of': ['Q999999'],
        'subclass_of': [],
    }

    result = resolve_entity_type('Q123456', max_depth=3)

    assert result == 'other'
    # Should not exceed max_depth + 1 calls (initial + 3 traversals)
    assert mock_claims.call_count <= 4

@patch('api.wikidata.fetch_wikidata_claims')
@pytest.mark.django_db
def test_api_failure_returns_other(mock_claims):
    """When claims fetch fails, returns 'other'."""
    mock_claims.return_value = None

    result = resolve_entity_type('Q28865')

    assert result == 'other'

@patch('api.wikidata.fetch_wikidata_claims')
@pytest.mark.django_db
def test_two_level_traversal(mock_claims):
    """Resolves through two levels: entity -> unknown parent -> known grandparent."""
    call_count = [0]

    def side_effect(qid):
        call_count[0] += 1
        if qid == 'Q290053':  # Django framework
            return {'instance_of': ['Q1330336'], 'subclass_of': []}
        elif qid == 'Q1330336':  # web framework -> subclass of Q7397 software
            return {'instance_of': [], 'subclass_of': ['Q7397']}
        return {'instance_of': [], 'subclass_of': []}

    mock_claims.side_effect = side_effect

    result = resolve_entity_type('Q290053')

    assert result == 'technology'
