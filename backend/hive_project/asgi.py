"""
ASGI config for hive_project project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hive_project.settings')

# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.
django_asgi_app = get_asgi_application()

# Import routing after Django is initialized
import api.routing
from django.conf import settings

# WebSocket routing - we don't use AuthMiddlewareStack because we handle
# authentication manually in the consumer via JWT token in query string
websocket_router = URLRouter(api.routing.websocket_urlpatterns)

# In development, allow all origins for WebSocket connections
# In production, use AllowedHostsOriginValidator
if settings.DEBUG:
    application = ProtocolTypeRouter({
        "http": django_asgi_app,
        "websocket": websocket_router,
    })
else:
    application = ProtocolTypeRouter({
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(websocket_router),
    })
