# api/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework import views
from rest_framework.response import Response
from rest_framework import permissions
from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache
from .views import (
    UserRegistrationView,
    UserProfileView,
    UserHistoryView,
    UserBadgeProgressView,
    UserVerifiedReviewsView,
    ServiceViewSet,
    TagViewSet,
    HandshakeViewSet,
    ChatViewSet,
    NotificationViewSet,
    ReputationViewSet,
    AdminReportViewSet,
    AdminUserViewSet,
    ExpressInterestView,
    TransactionHistoryViewSet,
    WikidataSearchView,
    PublicChatViewSet,
    CommentViewSet,
    NegativeRepViewSet,
    ForumCategoryViewSet,
    ForumTopicViewSet,
    ForumPostViewSet
)
from rest_framework_simplejwt.views import TokenObtainPairView
from .views import CustomTokenObtainPairView
from .views import CustomTokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

router = DefaultRouter()
router.register(r'services', ServiceViewSet, basename='service')
router.register(r'tags', TagViewSet, basename='tag')
router.register(r'handshakes', HandshakeViewSet, basename='handshake')
router.register(r'chats', ChatViewSet, basename='chat')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'reputation', ReputationViewSet, basename='reputation')
router.register(r'admin/reports', AdminReportViewSet, basename='admin-report')
router.register(r'admin/users', AdminUserViewSet, basename='admin-user')
router.register(r'transactions', TransactionHistoryViewSet, basename='transaction')

def health_check(request):
    """
    Health check endpoint that verifies connectivity to all critical dependencies.
    Returns detailed status for database and Redis.
    """
    from django.utils import timezone
    from api.models import User, Service, Handshake
    
    health_status = {
        'status': 'healthy',
        'service': 'the-hive-api',
        'timestamp': timezone.now().isoformat(),
        'dependencies': {},
        'metrics': {}
    }
    
    overall_healthy = True
    
    # Check database connectivity
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        health_status['dependencies']['database'] = {
            'status': 'healthy',
            'message': 'Database connection successful'
        }
        
        # Add basic metrics
        try:
            health_status['metrics']['total_users'] = User.objects.count()
            health_status['metrics']['active_services'] = Service.objects.filter(status='Active').count()
            health_status['metrics']['pending_handshakes'] = Handshake.objects.filter(status='pending').count()
        except Exception:
            pass  # Don't fail health check if metrics fail
    except Exception as e:
        overall_healthy = False
        health_status['dependencies']['database'] = {
            'status': 'unhealthy',
            'message': f'Database connection failed: {str(e)}'
        }
    
    # Check Redis connectivity
    try:
        cache.set('health_check', 'ok', timeout=10)
        result = cache.get('health_check')
        if result == 'ok':
            health_status['dependencies']['redis'] = {
                'status': 'healthy',
                'message': 'Redis connection successful'
            }
        else:
            overall_healthy = False
            health_status['dependencies']['redis'] = {
                'status': 'unhealthy',
                'message': 'Redis connection failed: unable to read written value'
            }
    except Exception as e:
        overall_healthy = False
        health_status['dependencies']['redis'] = {
            'status': 'unhealthy',
            'message': f'Redis connection failed: {str(e)}'
        }
    
    # Update overall status
    if not overall_healthy:
        health_status['status'] = 'unhealthy'
    
    # Return appropriate HTTP status code
    status_code = 200 if overall_healthy else 503
    return JsonResponse(health_status, status=status_code)


def metrics_endpoint(request):
    """Returns application metrics for monitoring."""
    from django.utils import timezone
    from api.models import User, Service, Handshake, TransactionHistory
    from django.db.models import Count, Q
    
    if not request.user.is_authenticated or request.user.role != 'admin':
        return JsonResponse(
            {'error': 'Unauthorized - Admin access required'},
            status=403
        )
    
    metrics = {
        'timestamp': timezone.now().isoformat(),
        'users': {
            'total': User.objects.count(),
            'active': User.objects.filter(is_active=True).count(),
            'admins': User.objects.filter(role='admin').count(),
        },
        'services': {
            'total': Service.objects.count(),
            'active': Service.objects.filter(status='Active').count(),
            'offers': Service.objects.filter(type='Offer', status='Active').count(),
            'needs': Service.objects.filter(type='Need', status='Active').count(),
        },
        'handshakes': {
            'total': Handshake.objects.count(),
            'pending': Handshake.objects.filter(status='pending').count(),
            'accepted': Handshake.objects.filter(status='accepted').count(),
            'completed': Handshake.objects.filter(status='completed').count(),
        },
        'transactions': {
            'total': TransactionHistory.objects.count(),
            'last_24h': TransactionHistory.objects.filter(
                created_at__gte=timezone.now() - timezone.timedelta(hours=24)
            ).count(),
        }
    }
    
    return JsonResponse(metrics, status=200)

# Create viewset instance for public chat
public_chat_viewset = PublicChatViewSet.as_view({
    'get': 'retrieve',
    'post': 'create'
})

# Create viewset instances for comments
comment_list_create = CommentViewSet.as_view({
    'get': 'list',
    'post': 'create'
})

comment_detail = CommentViewSet.as_view({
    'patch': 'partial_update',
    'delete': 'destroy'
})

comment_reviewable = CommentViewSet.as_view({
    'get': 'reviewable_handshakes'
})

# Create viewset instance for negative reputation
negative_rep_create = NegativeRepViewSet.as_view({
    'post': 'create'
})

# Forum viewset instances
forum_category_list = ForumCategoryViewSet.as_view({
    'get': 'list',
    'post': 'create'
})

forum_category_detail = ForumCategoryViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
    'delete': 'destroy'
})

forum_topic_list = ForumTopicViewSet.as_view({
    'get': 'list',
    'post': 'create'
})

forum_topic_detail = ForumTopicViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
    'delete': 'destroy'
})

forum_topic_pin = ForumTopicViewSet.as_view({
    'post': 'pin'
})

forum_topic_lock = ForumTopicViewSet.as_view({
    'post': 'lock'
})

forum_post_list_create = ForumPostViewSet.as_view({
    'get': 'list',
    'post': 'create'
})

forum_post_detail = ForumPostViewSet.as_view({
    'patch': 'partial_update',
    'delete': 'destroy'
})

forum_post_recent = ForumPostViewSet.as_view({
    'get': 'recent'
})

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('metrics/', metrics_endpoint, name='metrics'),
    path('auth/register/', UserRegistrationView.as_view(), name='register'),
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('users/me/', UserProfileView.as_view(), name='user-profile'),
    path('users/<uuid:id>/', UserProfileView.as_view(), name='user-detail'),
    path('users/<uuid:id>/history/', UserHistoryView.as_view(), name='user-history'),
    path('users/<uuid:id>/badge-progress/', UserBadgeProgressView.as_view(), name='user-badge-progress'),
    path('users/<uuid:id>/verified-reviews/', UserVerifiedReviewsView.as_view(), name='user-verified-reviews'),
    path('services/<uuid:service_id>/interest/', 
         ExpressInterestView.as_view(),
         name='express-interest'),
    # Comment endpoints nested under services
    path('services/<uuid:service_id>/comments/', 
         comment_list_create, 
         name='service-comments'),
    path('services/<uuid:service_id>/comments/<uuid:pk>/', 
         comment_detail, 
         name='service-comment-detail'),
    path('services/<uuid:service_id>/comments/reviewable/', 
         comment_reviewable, 
         name='service-comments-reviewable'),
    path('public-chat/<uuid:pk>/', public_chat_viewset, name='public-chat'),
    # Negative reputation endpoint
    path('reputation/negative/', negative_rep_create, name='negative-reputation'),
    path('wikidata/search/', WikidataSearchView.as_view(), name='wikidata-search'),
    # Forum endpoints
    path('forum/categories/', forum_category_list, name='forum-category-list'),
    path('forum/categories/<slug:slug>/', forum_category_detail, name='forum-category-detail'),
    path('forum/topics/', forum_topic_list, name='forum-topic-list'),
    path('forum/topics/<uuid:pk>/', forum_topic_detail, name='forum-topic-detail'),
    path('forum/topics/<uuid:pk>/pin/', forum_topic_pin, name='forum-topic-pin'),
    path('forum/topics/<uuid:pk>/lock/', forum_topic_lock, name='forum-topic-lock'),
    path('forum/topics/<uuid:topic_id>/posts/', forum_post_list_create, name='forum-post-list'),
    path('forum/posts/<uuid:pk>/', forum_post_detail, name='forum-post-detail'),
    path('forum/posts/recent/', forum_post_recent, name='forum-post-recent'),
    path('schema/', SpectacularAPIView.as_view(), name='schema'),
    path('docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    path('', include(router.urls)),
]