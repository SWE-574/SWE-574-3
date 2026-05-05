"""
Tests for Tag model hierarchy fields (parent_qid, entity_type, depth).
"""
import pytest

from api.models import Tag


@pytest.mark.django_db
@pytest.mark.unit
class TestTagHierarchyFields:
    """Tag model has hierarchy fields."""

    def test_tag_has_parent_qid_field(self):
        """Tag with parent_qid persists and is retrievable."""
        tag = Tag.objects.create(
            id='Q28865', name='Python', parent_qid='Q9143'
        )
        tag.refresh_from_db()
        assert tag.parent_qid == 'Q9143'

    def test_tag_has_entity_type_field(self):
        """Tag with entity_type persists."""
        tag = Tag.objects.create(
            id='Q28865', name='Python', entity_type='technology'
        )
        tag.refresh_from_db()
        assert tag.entity_type == 'technology'

    def test_tag_has_depth_field(self):
        """Depth defaults to 0 and can be set to other values."""
        tag_default = Tag.objects.create(id='Q9143', name='Programming language')
        assert tag_default.depth == 0

        tag_with_depth = Tag.objects.create(
            id='Q28865', name='Python', depth=1
        )
        tag_with_depth.refresh_from_db()
        assert tag_with_depth.depth == 1

    def test_parent_qid_nullable(self):
        """Existing tags work fine with parent_qid=None."""
        tag = Tag.objects.create(id='Q28865', name='Python')
        tag.refresh_from_db()
        assert tag.parent_qid is None

    def test_entity_type_blank_by_default(self):
        """New tags have entity_type=None by default."""
        tag = Tag.objects.create(id='Q28865', name='Python')
        tag.refresh_from_db()
        assert tag.entity_type is None

    def test_all_hierarchy_fields_together(self):
        """Tag can store all hierarchy fields at once."""
        tag = Tag.objects.create(
            id='Q28865',
            name='Python',
            parent_qid='Q9143',
            entity_type='technology',
            depth=1,
        )
        tag.refresh_from_db()
        assert tag.parent_qid == 'Q9143'
        assert tag.entity_type == 'technology'
        assert tag.depth == 1

    def test_entity_type_choices_are_valid(self):
        """All expected entity type values can be stored."""
        valid_types = [
            'technology', 'arts', 'sports', 'education', 'health',
            'food', 'science', 'language', 'craft', 'activity', 'other',
        ]
        for i, et in enumerate(valid_types):
            tag = Tag.objects.create(
                id=f'Q{10000 + i}', name=f'Test {et}', entity_type=et
            )
            tag.refresh_from_db()
            assert tag.entity_type == et
