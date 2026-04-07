"""
Tests for WikiData P31/P279 hierarchy fetching and entity type resolution.

Phase 1.2 RED tests — these should fail until wikidata.py is updated.
"""
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


class FetchWikidataClaimsTestCase(TestCase):
    """Tests for fetch_wikidata_claims()."""

    @patch('api.wikidata.requests.get')
    def test_returns_p31_instance_of(self, mock_get):
        """P31 claims are returned as instance_of list."""
        mock_get.return_value = _mock_claims_response(
            'Q28865', _p31_claim('Q9143')
        )

        result = fetch_wikidata_claims('Q28865')

        self.assertIsNotNone(result)
        self.assertIn('instance_of', result)
        self.assertEqual(result['instance_of'], ['Q9143'])

    @patch('api.wikidata.requests.get')
    def test_returns_p279_subclass_of(self, mock_get):
        """P279 claims are returned as subclass_of list."""
        mock_get.return_value = _mock_claims_response(
            'Q9143', _p279_claim('Q21198')
        )

        result = fetch_wikidata_claims('Q9143')

        self.assertIsNotNone(result)
        self.assertIn('subclass_of', result)
        self.assertEqual(result['subclass_of'], ['Q21198'])

    @patch('api.wikidata.requests.get')
    def test_returns_both_p31_and_p279(self, mock_get):
        """Both P31 and P279 can appear together."""
        claims = {**_p31_claim('Q9143'), **_p279_claim('Q21198')}
        mock_get.return_value = _mock_claims_response('Q28865', claims)

        result = fetch_wikidata_claims('Q28865')

        self.assertEqual(result['instance_of'], ['Q9143'])
        self.assertEqual(result['subclass_of'], ['Q21198'])

    @patch('api.wikidata.requests.get')
    def test_handles_missing_claims(self, mock_get):
        """Entity with no claims returns empty dict."""
        mock_get.return_value = _mock_claims_response('Q99999', {})

        result = fetch_wikidata_claims('Q99999')

        self.assertIsNotNone(result)
        self.assertEqual(result.get('instance_of', []), [])
        self.assertEqual(result.get('subclass_of', []), [])

    @patch('api.wikidata.requests.get')
    def test_handles_api_failure(self, mock_get):
        """API timeout/error returns None."""
        import requests as req
        mock_get.side_effect = req.Timeout('timeout')

        result = fetch_wikidata_claims('Q28865')

        self.assertIsNone(result)

    @patch('api.wikidata.requests.get')
    def test_multiple_p31_values(self, mock_get):
        """Entity with multiple P31 values returns all of them."""
        mock_get.return_value = _mock_claims_response(
            'Q28865', _p31_claim('Q9143', 'Q7397')
        )

        result = fetch_wikidata_claims('Q28865')

        self.assertEqual(len(result['instance_of']), 2)
        self.assertIn('Q9143', result['instance_of'])
        self.assertIn('Q7397', result['instance_of'])

    def test_invalid_qid_returns_none(self):
        """Non-QID input returns None without API call."""
        result = fetch_wikidata_claims('invalid')
        self.assertIsNone(result)

        result = fetch_wikidata_claims('')
        self.assertIsNone(result)

        result = fetch_wikidata_claims(None)
        self.assertIsNone(result)


class ResolveEntityTypeTestCase(TestCase):
    """Tests for resolve_entity_type()."""

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_direct_match(self, mock_claims):
        """QID that is directly in ENTITY_TYPE_MAP resolves immediately."""
        # Q9143 = programming language -> technology
        mock_claims.return_value = {'instance_of': [], 'subclass_of': []}

        result = resolve_entity_type('Q9143')

        self.assertEqual(result, 'technology')

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_via_parent_p31(self, mock_claims):
        """QID not in map, but its P31 parent is -> resolves via parent."""
        # Q28865 (Python) -> P31 -> Q9143 (programming language) -> technology
        mock_claims.return_value = {
            'instance_of': ['Q9143'],
            'subclass_of': [],
        }

        result = resolve_entity_type('Q28865')

        self.assertEqual(result, 'technology')

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_via_parent_p279(self, mock_claims):
        """Resolves via P279 (subclass of) when P31 doesn't match."""
        # Hypothetical: entity -> P279 -> Q349 (sport) -> sports
        mock_claims.return_value = {
            'instance_of': [],
            'subclass_of': ['Q349'],
        }

        result = resolve_entity_type('Q123456')

        self.assertEqual(result, 'sports')

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_unknown_parent_returns_other(self, mock_claims):
        """When parent chain doesn't match any known type, returns 'other'."""
        mock_claims.return_value = {
            'instance_of': ['Q999999999'],
            'subclass_of': [],
        }

        result = resolve_entity_type('Q123456')

        self.assertEqual(result, 'other')

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_max_depth_prevents_infinite_loop(self, mock_claims):
        """Traversal stops after max_depth levels."""
        # Each call returns an unknown parent, forcing deeper traversal
        mock_claims.return_value = {
            'instance_of': ['Q999999'],
            'subclass_of': [],
        }

        result = resolve_entity_type('Q123456', max_depth=3)

        self.assertEqual(result, 'other')
        # Should not exceed max_depth + 1 calls (initial + 3 traversals)
        self.assertLessEqual(mock_claims.call_count, 4)

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_api_failure_returns_other(self, mock_claims):
        """When claims fetch fails, returns 'other'."""
        mock_claims.return_value = None

        result = resolve_entity_type('Q28865')

        self.assertEqual(result, 'other')

    @patch('api.wikidata.fetch_wikidata_claims')
    def test_two_level_traversal(self, mock_claims):
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

        self.assertEqual(result, 'technology')
