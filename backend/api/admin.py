from django.contrib import admin

from .models import UserFollow, UserFollowEvent


@admin.register(UserFollow)
class UserFollowAdmin(admin.ModelAdmin):
    list_display = ('id', 'follower', 'following', 'created_at')
    readonly_fields = ('created_at',)


@admin.register(UserFollowEvent)
class UserFollowEventAdmin(admin.ModelAdmin):
    list_display = ('id', 'follower', 'following', 'action', 'created_at')
    list_filter = ('action', 'created_at')
    readonly_fields = ('created_at',)
