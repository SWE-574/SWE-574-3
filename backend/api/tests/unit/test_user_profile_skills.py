"""
Unit & integration tests for:
  - User.location field (CharField)
  - User.skills M2M field
  - UserProfileSerializer: location read/write + skills read/write
  - UserProfileSerializer.update(): tag resolution logic
    * tag found by id (UUID or Wikidata QID)
    * custom tag created with proper UUID id
    * empty id skipped
  - PATCH /api/users/me/ endpoint: location + skills round-trip
  - ChangePasswordView: valid + invalid cases
"""

import uuid
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from api.models import Tag
from api.serializers import UserProfileSerializer
from api.tests.helpers.factories import UserFactory, TagFactory

User = get_user_model()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_tag(tag_id: str, name: str) -> Tag:
    """Create a Tag with an explicit id (UUID or Wikidata QID)."""
    return Tag.objects.create(id=tag_id, name=name)


# ═══════════════════════════════════════════════════════════════════════════════
# Unit tests — model fields
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.django_db
@pytest.mark.unit
class TestUserLocationField:
    """User.location is a nullable CharField — should persist plain text."""

    def test_location_default_is_null(self):
        user = UserFactory()
        assert user.location is None

    def test_location_can_be_saved(self):
        user = UserFactory()
        user.location = "Istanbul, Turkey"
        user.save(update_fields=["location"])
        user.refresh_from_db()
        assert user.location == "Istanbul, Turkey"

    def test_location_can_be_cleared(self):
        user = UserFactory(location="Ankara")
        user.location = None
        user.save(update_fields=["location"])
        user.refresh_from_db()
        assert user.location is None

    def test_location_max_length(self):
        """200-char value should save without error."""
        user = UserFactory()
        user.location = "A" * 200
        user.save(update_fields=["location"])
        user.refresh_from_db()
        assert len(user.location) == 200


@pytest.mark.django_db
@pytest.mark.unit
class TestUserSkillsField:
    """User.skills is a ManyToMany to Tag."""

    def test_skills_empty_by_default(self):
        user = UserFactory()
        assert user.skills.count() == 0

    def test_skills_can_be_added(self):
        user = UserFactory()
        t1 = TagFactory(id="Q100", name="Cooking")
        t2 = TagFactory(id="Q200", name="Music")
        user.skills.add(t1, t2)
        assert set(user.skills.values_list("id", flat=True)) == {"Q100", "Q200"}

    def test_skills_can_be_removed(self):
        user = UserFactory()
        tag = TagFactory(id="Q300", name="Yoga")
        user.skills.add(tag)
        user.skills.remove(tag)
        assert user.skills.count() == 0

    def test_skills_set_replaces_existing(self):
        user = UserFactory()
        t1 = TagFactory(id="Q400", name="Python")
        t2 = TagFactory(id="Q500", name="Django")
        user.skills.add(t1)
        user.skills.set([t2])
        assert list(user.skills.values_list("id", flat=True)) == ["Q500"]


# ═══════════════════════════════════════════════════════════════════════════════
# Unit tests — serializer
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.django_db
@pytest.mark.unit
class TestUserProfileSerializerLocation:
    """UserProfileSerializer exposes and accepts location."""

    def test_serializer_includes_location_in_output(self):
        user = UserFactory(location="Beşiktaş, Istanbul")
        s = UserProfileSerializer(user)
        assert s.data["location"] == "Beşiktaş, Istanbul"

    def test_serializer_location_null_serializes_as_none(self):
        user = UserFactory()
        assert UserFactory._meta.model._meta.get_field("location").null is True
        s = UserProfileSerializer(user)
        assert s.data["location"] is None

    def test_serializer_updates_location(self):
        user = UserFactory()
        s = UserProfileSerializer(user, data={"location": "Kadıköy"}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        user.refresh_from_db()
        assert user.location == "Kadıköy"

    def test_serializer_clears_location_with_blank(self):
        user = UserFactory(location="Ankara")
        s = UserProfileSerializer(user, data={"location": ""}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        user.refresh_from_db()
        assert user.location in ("", None)


@pytest.mark.django_db
@pytest.mark.unit
class TestUserProfileSerializerSkills:
    """UserProfileSerializer.skills (read) and skill_ids (write)."""

    def test_skills_returned_as_list_of_id_name_dicts(self):
        user = UserFactory()
        tag = TagFactory(id="Q600", name="Baking")
        user.skills.add(tag)
        s = UserProfileSerializer(user)
        assert s.data["skills"] == [{"id": "Q600", "name": "Baking"}]

    def test_skills_empty_list_when_no_skills(self):
        user = UserFactory()
        s = UserProfileSerializer(user)
        assert s.data["skills"] == []

    def test_skill_ids_sets_skills_from_existing_tag(self):
        user = UserFactory()
        tag = TagFactory(id="Q700", name="Gardening")
        s = UserProfileSerializer(user, data={"skill_ids": ["Q700"]}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        assert list(user.skills.values_list("id", flat=True)) == ["Q700"]

    def test_skill_ids_sets_skills_from_uuid_tag(self):
        user = UserFactory()
        uid = str(uuid.uuid4())
        tag = make_tag(uid, "Carpentry")
        s = UserProfileSerializer(user, data={"skill_ids": [uid]}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        assert uid in list(user.skills.values_list("id", flat=True))

    def test_skill_ids_clears_skills_when_empty_list(self):
        user = UserFactory()
        tag = TagFactory(id="Q800", name="Swimming")
        user.skills.add(tag)
        s = UserProfileSerializer(user, data={"skill_ids": []}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        assert user.skills.count() == 0

    def test_skill_ids_none_leaves_skills_unchanged(self):
        """Omitting skill_ids entirely should NOT clear existing skills."""
        user = UserFactory()
        tag = TagFactory(id="Q900", name="Dancing")
        user.skills.add(tag)
        s = UserProfileSerializer(user, data={"bio": "hello"}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        assert user.skills.count() == 1  # unchanged


# ═══════════════════════════════════════════════════════════════════════════════
# Unit tests — update() tag resolution logic
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.django_db
@pytest.mark.unit
class TestUserProfileSerializerUpdateTagResolution:
    """
    Tests for the skill_ids resolution inside UserProfileSerializer.update():
      1. Existing Wikidata QID tag found by id  (filter(id=raw_id))
      2. Existing UUID tag found by id
      3. Custom tag: looked up by name, then created with proper UUID id
      4. Custom tag: "custom:" prefix is stripped before name lookup
      5. Empty id strings are ignored
      6. Nonexistent QID falls back to creating tag with id as name
    """

    def test_wikidata_qid_found_by_id(self):
        """QID that already exists in DB is fetched directly — name preserved."""
        user = UserFactory()
        tag = make_tag("Q1234567", "Origami")
        s = UserProfileSerializer(user, data={"skill_ids": ["Q1234567"]}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        skill = user.skills.first()
        assert skill is not None
        assert skill.id == "Q1234567"
        assert skill.name == "Origami"

    def test_uuid_tag_found_by_id(self):
        """UUID-keyed tag found by direct filter."""
        user = UserFactory()
        uid = str(uuid.uuid4())
        tag = make_tag(uid, "Pottery")
        s = UserProfileSerializer(user, data={"skill_ids": [uid]}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        assert user.skills.filter(id=uid).exists()

    def test_custom_prefix_creates_tag_with_uuid_id(self):
        """'custom:yoga' → creates Tag(name='yoga') with UUID id, not empty id."""
        user = UserFactory()
        s = UserProfileSerializer(user, data={"skill_ids": ["custom:yoga"]}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        skill = user.skills.first()
        assert skill is not None
        assert skill.name == "yoga"
        # id must be a valid UUID (not empty, not "custom:yoga")
        parsed = uuid.UUID(skill.id)
        assert str(parsed) == skill.id

    def test_custom_prefix_reuses_existing_tag_by_name(self):
        """If a tag named 'yoga' already exists, it's reused — no duplicate."""
        user = UserFactory()
        existing = make_tag(str(uuid.uuid4()), "yoga")
        s = UserProfileSerializer(user, data={"skill_ids": ["custom:yoga"]}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        assert user.skills.count() == 1
        assert user.skills.first().id == existing.id

    def test_empty_id_string_is_skipped(self):
        """Empty strings in skill_ids are silently ignored."""
        user = UserFactory()
        s = UserProfileSerializer(user, data={"skill_ids": ["", "  "]}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        assert user.skills.count() == 0

    def test_unknown_qid_creates_tag_with_qid_as_name_fallback(self):
        """QID not in DB → custom fallback creates tag named after stripped value."""
        user = UserFactory()
        s = UserProfileSerializer(user, data={"skill_ids": ["QUNKNOWN"]}, partial=True)
        assert s.is_valid(), s.errors
        s.save()
        # Tag created with name="QUNKNOWN" (it's not a "custom:" prefix)
        skill = user.skills.first()
        assert skill is not None
        assert skill.name == "QUNKNOWN"
        # Must have a proper non-empty UUID id
        assert skill.id != ""

    def test_multiple_skill_ids_all_resolved(self):
        """Multiple ids (mix of QID, UUID, custom) all resolved."""
        user = UserFactory()
        qid_tag  = make_tag("Q9999", "Knitting")
        uid      = str(uuid.uuid4())
        uuid_tag = make_tag(uid, "Weaving")

        s = UserProfileSerializer(
            user,
            data={"skill_ids": ["Q9999", uid, "custom:surfing"]},
            partial=True,
        )
        assert s.is_valid(), s.errors
        s.save()
        names = set(user.skills.values_list("name", flat=True))
        assert "Knitting" in names
        assert "Weaving" in names
        assert "surfing" in names
        assert user.skills.count() == 3


# ═══════════════════════════════════════════════════════════════════════════════
# Integration tests — PATCH /api/users/me/
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.django_db
@pytest.mark.integration
class TestPatchUserMeLocationAndSkills:
    """End-to-end PATCH /api/users/me/ for location and skill_ids."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.user = UserFactory(password="pass1234!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_patch_location_persists(self):
        resp = self.client.patch("/api/users/me/", {"location": "Üsküdar, Istanbul"}, format="json")
        assert resp.status_code == 200
        assert resp.data["location"] == "Üsküdar, Istanbul"
        self.user.refresh_from_db()
        assert self.user.location == "Üsküdar, Istanbul"

    def test_patch_location_then_clear(self):
        self.client.patch("/api/users/me/", {"location": "Fatih"}, format="json")
        resp = self.client.patch("/api/users/me/", {"location": ""}, format="json")
        assert resp.status_code == 200
        self.user.refresh_from_db()
        assert self.user.location in ("", None)

    def test_patch_skill_ids_with_existing_tag(self):
        tag = make_tag("Q11111", "Calligraphy")
        resp = self.client.patch("/api/users/me/", {"skill_ids": ["Q11111"]}, format="json")
        assert resp.status_code == 200
        skills = resp.data.get("skills", [])
        assert any(s["name"] == "Calligraphy" for s in skills)

    def test_patch_skill_ids_with_custom_tag_creates_proper_tag(self):
        resp = self.client.patch("/api/users/me/", {"skill_ids": ["custom:embroidery"]}, format="json")
        assert resp.status_code == 200
        skills = resp.data.get("skills", [])
        assert any(s["name"] == "embroidery" for s in skills)
        # id must be a valid UUID
        skill = next(s for s in skills if s["name"] == "embroidery")
        uuid.UUID(skill["id"])  # raises ValueError if not a valid UUID

    def test_patch_skill_ids_empty_list_clears_skills(self):
        tag = make_tag("Q22222", "Pottery")
        self.user.skills.add(tag)
        resp = self.client.patch("/api/users/me/", {"skill_ids": []}, format="json")
        assert resp.status_code == 200
        assert resp.data.get("skills", []) == []

    def test_patch_without_skill_ids_does_not_clear_skills(self):
        tag = make_tag("Q33333", "Glassblowing")
        self.user.skills.add(tag)
        resp = self.client.patch("/api/users/me/", {"bio": "test"}, format="json")
        assert resp.status_code == 200
        # Skills must still be present
        self.user.refresh_from_db()
        assert self.user.skills.count() == 1

    def test_patch_location_and_skills_together(self):
        tag = make_tag("Q44444", "Metalwork")
        resp = self.client.patch(
            "/api/users/me/",
            {"location": "Şişli, Istanbul", "skill_ids": ["Q44444"]},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["location"] == "Şişli, Istanbul"
        assert any(s["name"] == "Metalwork" for s in resp.data.get("skills", []))

    def test_patch_unauthenticated_returns_401(self):
        anon_client = APIClient()
        resp = anon_client.patch("/api/users/me/", {"location": "anywhere"}, format="json")
        assert resp.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# Integration tests — POST /api/auth/change-password/
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.django_db
@pytest.mark.integration
class TestChangePasswordView:
    """Tests for the ChangePasswordView endpoint."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.user = UserFactory()
        self.user.set_password("OldPass123!")
        self.user.save()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_change_password_success(self):
        resp = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "OldPass123!", "new_password": "NewPass456!"},
            format="json",
        )
        assert resp.status_code == 200
        self.user.refresh_from_db()
        assert self.user.check_password("NewPass456!")

    def test_change_password_wrong_current(self):
        resp = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "WrongPass!", "new_password": "NewPass456!"},
            format="json",
        )
        assert resp.status_code == 400

    def test_change_password_too_short(self):
        resp = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "OldPass123!", "new_password": "short"},
            format="json",
        )
        assert resp.status_code == 400

    def test_change_password_missing_fields(self):
        resp = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "OldPass123!"},
            format="json",
        )
        assert resp.status_code == 400

    def test_change_password_unauthenticated(self):
        anon = APIClient()
        resp = anon.post(
            "/api/auth/change-password/",
            {"current_password": "OldPass123!", "new_password": "NewPass456!"},
            format="json",
        )
        assert resp.status_code in (401, 403)
