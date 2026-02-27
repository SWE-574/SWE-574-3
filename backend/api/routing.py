from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/chat/(?P<handshake_id>[0-9a-f-]+)/$', consumers.ChatConsumer.as_asgi()),
    re_path(r'ws/public-chat/(?P<room_id>[0-9a-f-]+)/$', consumers.PublicChatConsumer.as_asgi()),
]

