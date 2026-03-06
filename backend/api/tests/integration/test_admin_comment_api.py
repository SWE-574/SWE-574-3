import pytest
from rest_framework import status
from rest_framework.test import APIClient

from api.models import Comment
from api.tests.helpers.factories import AdminUserFactory, CommentFactory, ServiceFactory, UserFactory
from api.tests.helpers.test_client import AuthenticatedAPIClient


@pytest.mark.django_db
@pytest.mark.integration
class TestAdminCommentApi:
    def test_list_requires_authentication(self):
        response = APIClient().get('/api/admin/comments/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_admin_cannot_list_comments(self):
        member = UserFactory()
        client = AuthenticatedAPIClient().authenticate_user(member)

        response = client.get('/api/admin/comments/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_lists_active_comments_by_default(self):
        admin = AdminUserFactory()
        service = ServiceFactory()
        active_comment = CommentFactory(service=service, is_deleted=False)
        CommentFactory(service=service, is_deleted=True)

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get('/api/admin/comments/')

        assert response.status_code == status.HTTP_200_OK
        ids = {item['id'] for item in response.data['results']}
        assert str(active_comment.id) in ids
        assert all(item['status'] == 'active' for item in response.data['results'])

    def test_admin_can_filter_removed_comments(self):
        admin = AdminUserFactory()
        service = ServiceFactory()
        CommentFactory(service=service, is_deleted=False)
        removed_comment = CommentFactory(service=service, is_deleted=True)

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get('/api/admin/comments/?status=removed')

        assert response.status_code == status.HTTP_200_OK
        ids = {item['id'] for item in response.data['results']}
        assert str(removed_comment.id) in ids
        assert all(item['status'] == 'removed' for item in response.data['results'])

    def test_admin_can_search_comments(self):
        admin = AdminUserFactory()
        service = ServiceFactory(title='Python Mentoring')
        matching = CommentFactory(service=service, body='Very helpful mentoring session')
        CommentFactory(service=service, body='Unrelated body text')

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get('/api/admin/comments/?search=helpful')

        assert response.status_code == status.HTTP_200_OK
        ids = {item['id'] for item in response.data['results']}
        assert str(matching.id) in ids

    def test_admin_can_remove_comment(self):
        admin = AdminUserFactory()
        comment = CommentFactory(is_deleted=False)

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.post(f'/api/admin/comments/{comment.id}/remove/', {}, format='json')

        assert response.status_code == status.HTTP_200_OK
        comment.refresh_from_db()
        assert comment.is_deleted is True
        assert response.data['status'] == 'removed'

    def test_admin_can_restore_comment(self):
        admin = AdminUserFactory()
        comment = CommentFactory(is_deleted=True)

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.post(f'/api/admin/comments/{comment.id}/restore/', {}, format='json')

        assert response.status_code == status.HTTP_200_OK
        comment.refresh_from_db()
        assert comment.is_deleted is False
        assert response.data['status'] == 'active'

    def test_non_admin_cannot_moderate_comment(self):
        member = UserFactory()
        comment = CommentFactory(is_deleted=False)

        client = AuthenticatedAPIClient().authenticate_user(member)
        response = client.post(f'/api/admin/comments/{comment.id}/remove/', {}, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN
        comment.refresh_from_db()
        assert comment.is_deleted is False

    def test_admin_can_retrieve_comment_detail(self):
        admin = AdminUserFactory()
        comment = CommentFactory(body='Moderation detail body')

        client = AuthenticatedAPIClient().authenticate_admin(admin)
        response = client.get(f'/api/admin/comments/{comment.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(comment.id)
        assert response.data['body'] == 'Moderation detail body'
