"""
Management command to seed default forum categories.

Usage:
    python manage.py seed_forum_categories
"""
from django.core.management.base import BaseCommand
from api.models import ForumCategory


DEFAULT_CATEGORIES = [
    {
        'name': 'General Discussion',
        'slug': 'general',
        'description': 'General community chat, introductions, and announcements',
        'icon': 'message-square',
        'color': 'blue',
        'display_order': 0,
    },
    {
        'name': 'Tips & Advice',
        'slug': 'tips',
        'description': 'Share tips, advice, and best practices for great exchanges',
        'icon': 'lightbulb',
        'color': 'amber',
        'display_order': 1,
    },
    {
        'name': 'Skills & Learning',
        'slug': 'skills-learning',
        'description': 'Ask questions, share knowledge, and discuss learning opportunities',
        'icon': 'book-open',
        'color': 'purple',
        'display_order': 2,
    },
    {
        'name': 'Community Events',
        'slug': 'community-events',
        'description': 'Organize meetups, workshops, and community gatherings',
        'icon': 'calendar',
        'color': 'orange',
        'display_order': 3,
    },
    {
        'name': 'Success Stories',
        'slug': 'success-stories',
        'description': 'Share experiences, success stories, and lessons learned from timebank exchanges',
        'icon': 'users',
        'color': 'teal',
        'display_order': 4,
    },
    {
        'name': 'Feedback & Suggestions',
        'slug': 'feedback-suggestions',
        'description': 'Help improve The Hive with your ideas and feedback',
        'icon': 'message-circle',
        'color': 'pink',
        'display_order': 5,
    },
]


class Command(BaseCommand):
    help = 'Seeds the database with default forum categories'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force creation even if categories already exist',
        )

    def handle(self, *args, **options):
        force = options['force']
        created_count = 0
        updated_count = 0
        skipped_count = 0
        
        for category_data in DEFAULT_CATEGORIES:
            # Try to match either by slug (preferred) or by name (handles legacy slugs)
            category = (
                ForumCategory.objects.filter(slug=category_data['slug']).first()
                or ForumCategory.objects.filter(name=category_data['name']).first()
            )

            if category is None:
                category = ForumCategory.objects.create(**category_data)
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'Created category: {category.name}'))
                continue

            if not force:
                skipped_count += 1
                self.stdout.write(self.style.NOTICE(f'Category exists: {category.name}'))
                continue

            # Force update existing category fields, without breaking uniqueness constraints.
            desired_slug = category_data['slug']
            if category.slug != desired_slug:
                slug_taken = ForumCategory.objects.exclude(pk=category.pk).filter(slug=desired_slug).exists()
                if not slug_taken:
                    category.slug = desired_slug

            for field, value in category_data.items():
                if field == 'slug':
                    continue
                setattr(category, field, value)

            category.save(update_fields=[
                'name', 'description', 'slug', 'icon', 'color', 'display_order', 'updated_at'
            ])
            updated_count += 1
            self.stdout.write(self.style.WARNING(f'Updated category: {category.name}'))

        self.stdout.write(self.style.SUCCESS(
            f'\nDone! Created: {created_count}, Updated: {updated_count}, Skipped: {skipped_count}'
        ))
