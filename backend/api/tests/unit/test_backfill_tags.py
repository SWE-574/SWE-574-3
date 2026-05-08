"""
Tests for backfill_tag_hierarchy management command.

Phase 4 tests — verify backfill populates parent_qid and entity_type
for existing tags from WikiData.
"""
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.management import call_command

from api.models import Tag


@pytest.fixture
def env(db):
    return SimpleNamespace(
        tag_python=Tag.objects.create(id='Q28865', name='Python'),
        tag_cooking=Tag.objects.create(id='Q25403900', name='Cooking'),
        tag_custom=Tag.objects.create(id='my_custom_tag', name='Custom Tag'),
    )


@pytest.mark.django_db
@patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
@patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
def test_populates_parent_qid(mock_resolve, mock_claims, env):
    mock_claims.return_value = {'instance_of': ['Q9143'], 'subclass_of': []}
    mock_resolve.return_value = 'technology'

    call_command('backfill_tag_hierarchy', stdout=StringIO())

    env.tag_python.refresh_from_db()
    assert env.tag_python.parent_qid == 'Q9143'


@pytest.mark.django_db
@patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
@patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
def test_populates_entity_type(mock_resolve, mock_claims, env):
    mock_claims.return_value = {'instance_of': ['Q9143'], 'subclass_of': []}
    mock_resolve.return_value = 'technology'

    call_command('backfill_tag_hierarchy', stdout=StringIO())

    env.tag_python.refresh_from_db()
    assert env.tag_python.entity_type == 'technology'


@pytest.mark.django_db
@patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
@patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
def test_is_idempotent(mock_resolve, mock_claims, env):
    """Second run skips tags already populated."""
    env.tag_python.parent_qid = 'Q9143'
    env.tag_python.entity_type = 'technology'
    env.tag_python.save()

    mock_claims.return_value = {'instance_of': ['Q2095'], 'subclass_of': []}
    mock_resolve.return_value = 'food'

    call_command('backfill_tag_hierarchy', stdout=StringIO())

    called_qids = [c[0][0] for c in mock_claims.call_args_list]
    assert 'Q28865' not in called_qids


@pytest.mark.django_db
@patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
@patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
def test_skips_non_qid_tags(mock_resolve, mock_claims, env):
    """Tags with non-QID ids are skipped."""
    mock_claims.return_value = {'instance_of': ['Q9143'], 'subclass_of': []}
    mock_resolve.return_value = 'technology'

    call_command('backfill_tag_hierarchy', stdout=StringIO())

    called_qids = [c[0][0] for c in mock_claims.call_args_list]
    assert 'my_custom_tag' not in called_qids


@pytest.mark.django_db
@patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
@patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
def test_handles_api_failure(mock_resolve, mock_claims, env):
    """API failure for one tag doesn't block others."""
    def claims_side_effect(qid):
        if qid == 'Q28865':
            return None
        return {'instance_of': ['Q2095'], 'subclass_of': []}

    mock_claims.side_effect = claims_side_effect
    mock_resolve.return_value = 'food'

    call_command('backfill_tag_hierarchy', stdout=StringIO())

    env.tag_python.refresh_from_db()
    assert env.tag_python.parent_qid is None

    env.tag_cooking.refresh_from_db()
    assert env.tag_cooking.parent_qid == 'Q2095'


@pytest.mark.django_db
@patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
@patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
def test_force_flag(mock_resolve, mock_claims, env):
    """--force re-fetches already-populated tags."""
    env.tag_python.parent_qid = 'Q9143'
    env.tag_python.entity_type = 'technology'
    env.tag_python.save()

    mock_claims.return_value = {'instance_of': ['Q9143'], 'subclass_of': []}
    mock_resolve.return_value = 'technology'

    call_command('backfill_tag_hierarchy', '--force', stdout=StringIO())

    called_qids = [c[0][0] for c in mock_claims.call_args_list]
    assert 'Q28865' in called_qids


@pytest.mark.django_db
@patch('api.management.commands.backfill_tag_hierarchy.fetch_wikidata_claims')
@patch('api.management.commands.backfill_tag_hierarchy.resolve_entity_type')
def test_dry_run(mock_resolve, mock_claims, env):
    """--dry-run does not save changes."""
    mock_claims.return_value = {'instance_of': ['Q9143'], 'subclass_of': []}
    mock_resolve.return_value = 'technology'

    call_command('backfill_tag_hierarchy', '--dry-run', stdout=StringIO())

    env.tag_python.refresh_from_db()
    assert env.tag_python.parent_qid is None
    assert env.tag_python.entity_type is None
