"""
Tests for backfill_tag_hierarchy management command.

Phase 4 tests — verify backfill populates parent_qid and entity_type
for existing tags from WikiData.
"""
from io import StringIO
from django.test import TestCase
from django.core.management import call_command
from unittest.mock import patch

from api.models import Tag


class BackfillTagHierarchyTestCase(TestCase):
    """Tests for the backfill_tag_hierarchy management command."""

    def setUp(self):
        self.tag_python = Tag.objects.create(id='Q28865', name='Python')
        self.tag_cooking = Tag.objects.create(id='Q25403900', name='Cooking')
        self.tag_custom = Tag.objects.create(id='my_custom_tag', name='Custom Tag')

    @patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
    @patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
    def test_populates_parent_qid(self, mock_resolve, mock_claims):
        mock_claims.return_value = {
            'instance_of': ['Q9143'],
            'subclass_of': [],
        }
        mock_resolve.return_value = 'technology'

        call_command('backfill_tag_hierarchy', stdout=StringIO())

        self.tag_python.refresh_from_db()
        self.assertEqual(self.tag_python.parent_qid, 'Q9143')

    @patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
    @patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
    def test_populates_entity_type(self, mock_resolve, mock_claims):
        mock_claims.return_value = {
            'instance_of': ['Q9143'],
            'subclass_of': [],
        }
        mock_resolve.return_value = 'technology'

        call_command('backfill_tag_hierarchy', stdout=StringIO())

        self.tag_python.refresh_from_db()
        self.assertEqual(self.tag_python.entity_type, 'technology')

    @patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
    @patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
    def test_is_idempotent(self, mock_resolve, mock_claims):
        """Second run skips tags already populated."""
        self.tag_python.parent_qid = 'Q9143'
        self.tag_python.entity_type = 'technology'
        self.tag_python.save()

        mock_claims.return_value = {'instance_of': ['Q2095'], 'subclass_of': []}
        mock_resolve.return_value = 'food'

        call_command('backfill_tag_hierarchy', stdout=StringIO())

        # Should not have been called for tag_python (already has parent_qid)
        called_qids = [c[0][0] for c in mock_claims.call_args_list]
        self.assertNotIn('Q28865', called_qids)

    @patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
    @patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
    def test_skips_non_qid_tags(self, mock_resolve, mock_claims):
        """Tags with non-QID ids are skipped."""
        mock_claims.return_value = {'instance_of': ['Q9143'], 'subclass_of': []}
        mock_resolve.return_value = 'technology'

        call_command('backfill_tag_hierarchy', stdout=StringIO())

        called_qids = [c[0][0] for c in mock_claims.call_args_list]
        self.assertNotIn('my_custom_tag', called_qids)

    @patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
    @patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
    def test_handles_api_failure(self, mock_resolve, mock_claims):
        """API failure for one tag doesn't block others."""
        def claims_side_effect(qid):
            if qid == 'Q28865':
                return None  # API failure
            return {'instance_of': ['Q2095'], 'subclass_of': []}

        mock_claims.side_effect = claims_side_effect
        mock_resolve.return_value = 'food'

        call_command('backfill_tag_hierarchy', stdout=StringIO())

        # Python tag should be unchanged (API failed)
        self.tag_python.refresh_from_db()
        self.assertIsNone(self.tag_python.parent_qid)

        # Cooking tag should be populated
        self.tag_cooking.refresh_from_db()
        self.assertEqual(self.tag_cooking.parent_qid, 'Q2095')

    @patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
    @patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
    def test_force_flag(self, mock_resolve, mock_claims):
        """--force re-fetches already-populated tags."""
        self.tag_python.parent_qid = 'Q9143'
        self.tag_python.entity_type = 'technology'
        self.tag_python.save()

        mock_claims.return_value = {
            'instance_of': ['Q9143'],
            'subclass_of': [],
        }
        mock_resolve.return_value = 'technology'

        call_command('backfill_tag_hierarchy', '--force', stdout=StringIO())

        called_qids = [c[0][0] for c in mock_claims.call_args_list]
        self.assertIn('Q28865', called_qids)

    @patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
    @patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
    def test_dry_run(self, mock_resolve, mock_claims):
        """--dry-run does not save changes."""
        mock_claims.return_value = {
            'instance_of': ['Q9143'],
            'subclass_of': [],
        }
        mock_resolve.return_value = 'technology'

        call_command('backfill_tag_hierarchy', '--dry-run', stdout=StringIO())

        self.tag_python.refresh_from_db()
        self.assertIsNone(self.tag_python.parent_qid)
        self.assertIsNone(self.tag_python.entity_type)
