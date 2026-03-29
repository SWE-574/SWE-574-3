from django.contrib import admin

from .models import UserFollow


@admin.register(UserFollow)
class UserFollowAdmin(admin.ModelAdmin):
    list_display = ('id', 'follower', 'following', 'created_at')
    readonly_fields = ('created_at',)
