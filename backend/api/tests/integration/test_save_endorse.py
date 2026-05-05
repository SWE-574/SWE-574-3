"""Integration tests for Save and Endorse (#483)."""
import pytest
from rest_framework.test import APIClient

from api.tests.helpers.factories import ServiceFactory, UserFactory


@pytest.mark.django_db
@pytest.mark.integration
class TestSaveService:
    def test_save_creates_row_and_returns_state(self):
        from api.models import SavedService

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.post(f'/api/services/{svc.id}/save/')
        assert resp.status_code == 200
        assert resp.json()['is_saved'] is True
        assert SavedService.objects.filter(user=viewer, service=svc).exists()

    def test_save_is_idempotent(self):
        from api.models import SavedService

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{svc.id}/save/')
        client.post(f'/api/services/{svc.id}/save/')
        assert SavedService.objects.filter(user=viewer, service=svc).count() == 1

    def test_unsave_removes_row(self):
        from api.models import SavedService

        viewer = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{svc.id}/save/')
        resp = client.delete(f'/api/services/{svc.id}/save/')
        assert resp.status_code == 200
        assert resp.json()['is_saved'] is False
        assert not SavedService.objects.filter(user=viewer, service=svc).exists()

    def test_anonymous_blocked(self):
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        resp = client.post(f'/api/services/{svc.id}/save/')
        assert resp.status_code == 401

    def test_saved_list_returns_only_my_saves(self):
        viewer = UserFactory()
        other = UserFactory()
        mine = ServiceFactory(type='Offer', status='Active')
        not_mine = ServiceFactory(type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{mine.id}/save/')
        # other user saves a different service
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        other_client.post(f'/api/services/{not_mine.id}/save/')

        resp = client.get('/api/services/saved/')
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body) if isinstance(body, dict) else body
        ids = {row['id'] for row in results}
        assert str(mine.id) in ids
        assert str(not_mine.id) not in ids

    def test_serializer_returns_is_saved_per_viewer(self):
        viewer_a = UserFactory()
        viewer_b = UserFactory()
        svc = ServiceFactory(type='Offer', status='Active')

        client_a = APIClient()
        client_a.force_authenticate(user=viewer_a)
        client_a.post(f'/api/services/{svc.id}/save/')

        # viewer_a sees is_saved=True; viewer_b sees is_saved=False
        resp_a = client_a.get(f'/api/services/{svc.id}/')
        assert resp_a.json()['is_saved'] is True

        client_b = APIClient()
        client_b.force_authenticate(user=viewer_b)
        resp_b = client_b.get(f'/api/services/{svc.id}/')
        assert resp_b.json()['is_saved'] is False


@pytest.mark.django_db
@pytest.mark.integration
class TestEndorseService:
    def test_endorse_creates_row_and_returns_count(self):
        from api.models import Endorsement

        viewer = UserFactory()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        client = APIClient()
        client.force_authenticate(user=viewer)
        resp = client.post(f'/api/services/{svc.id}/endorse/')
        assert resp.status_code == 200
        assert resp.json()['is_endorsed'] is True
        assert resp.json()['endorsement_count'] == 1
        assert Endorsement.objects.filter(endorser=viewer, service=svc).exists()

    def test_self_endorse_is_blocked(self):
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=owner)
        resp = client.post(f'/api/services/{svc.id}/endorse/')
        assert resp.status_code == 400

    def test_endorse_is_idempotent(self):
        from api.models import Endorsement

        viewer = UserFactory()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{svc.id}/endorse/')
        client.post(f'/api/services/{svc.id}/endorse/')
        assert Endorsement.objects.filter(endorser=viewer, service=svc).count() == 1

    def test_unendorse_removes_row(self):
        from api.models import Endorsement

        viewer = UserFactory()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')
        client = APIClient()
        client.force_authenticate(user=viewer)
        client.post(f'/api/services/{svc.id}/endorse/')
        resp = client.delete(f'/api/services/{svc.id}/endorse/')
        assert resp.status_code == 200
        assert resp.json()['is_endorsed'] is False
        assert resp.json()['endorsement_count'] == 0
        assert not Endorsement.objects.filter(endorser=viewer, service=svc).exists()

    def test_anonymous_blocked(self):
        svc = ServiceFactory(type='Offer', status='Active')
        client = APIClient()
        resp = client.post(f'/api/services/{svc.id}/endorse/')
        assert resp.status_code == 401

    def test_endorsement_count_visible_to_anyone(self):
        endorser_a = UserFactory()
        endorser_b = UserFactory()
        owner = UserFactory()
        svc = ServiceFactory(user=owner, type='Offer', status='Active')

        for endorser in (endorser_a, endorser_b):
            client = APIClient()
            client.force_authenticate(user=endorser)
            client.post(f'/api/services/{svc.id}/endorse/')

        # Anonymous request reads the count
        anon = APIClient()
        resp = anon.get(f'/api/services/{svc.id}/')
        assert resp.json()['endorsement_count'] == 2
