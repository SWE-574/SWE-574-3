from django.db import models
from django.contrib.gis.db import models as gis_models
from django.contrib.gis.geos import Point
from django.contrib.auth.models import AbstractUser, UserManager
from decimal import Decimal
import uuid

class CustomUserManager(UserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        return self.create_user(email, password, **extra_fields)

class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    username = None
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    bio = models.TextField(blank=True, null=True)
    avatar_url = models.TextField(blank=True, null=True)  # Support data URLs and regular URLs
    banner_url = models.TextField(blank=True, null=True)  # Support data URLs and regular URLs
    timebank_balance = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('3.00'))
    karma_score = models.IntegerField(default=0)
    role = models.CharField(max_length=20, choices=[('member', 'Member'), ('admin', 'Admin')], default='member')
    featured_achievement_id = models.CharField(max_length=200, null=True, blank=True, help_text='Featured achievement badge ID to display on profile')
    date_joined = models.DateTimeField(auto_now_add=True)
    failed_login_attempts = models.IntegerField(default=0, help_text='Number of consecutive failed login attempts')
    locked_until = models.DateTimeField(null=True, blank=True, help_text='Account locked until this time (null if not locked)')
    
    # Profile trust enhancement fields
    video_intro_url = models.TextField(
        blank=True, 
        null=True,
        help_text='External video URL (YouTube, Vimeo, etc.)'
    )
    video_intro_file = models.FileField(
        upload_to='videos/intros/',
        blank=True,
        null=True,
        help_text='Uploaded video intro file'
    )
    portfolio_images = models.JSONField(
        default=list,
        blank=True,
        help_text='Array of portfolio image URLs/paths (max 5)'
    )
    show_history = models.BooleanField(
        default=True,
        help_text='Whether to show transaction history publicly'
    )

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    def __str__(self):
        return self.email

    def save(self, *args, **kwargs):
        if self.timebank_balance is None:
            self.timebank_balance = Decimal('3.00')
        super().save(*args, **kwargs)

    class Meta:
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['timebank_balance']),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(timebank_balance__gte=-10.00),
                name='timebank_balance_minimum',
            ),
        ]

class Tag(models.Model):
    id = models.CharField(primary_key=True, max_length=200)
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name

    class Meta:
        indexes = [
            models.Index(fields=['name']),
        ]

class Badge(models.Model):
    id = models.CharField(primary_key=True, max_length=200)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    icon_url = models.URLField(blank=True, null=True)

    def __str__(self):
        return self.name

class UserBadge(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='badges')
    badge = models.ForeignKey(Badge, on_delete=models.CASCADE)
    earned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['user', 'badge']
        indexes = [
            models.Index(fields=['user', 'badge']),
        ]

class Service(models.Model):
    TYPE_CHOICES = (
        ('Offer', 'Offer'),
        ('Need', 'Need'),
    )
    LOCATION_CHOICES = (
        ('In-Person', 'In-Person'),
        ('Online', 'Online'),
    )
    STATUS_CHOICES = (
        ('Active', 'Active'),
        ('Completed', 'Completed'),
        ('Cancelled', 'Cancelled'),
    )
    SCHEDULE_CHOICES = (
        ('One-Time', 'One-Time'),
        ('Recurrent', 'Recurrent'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='services')
    title = models.CharField(max_length=200)
    description = models.TextField()
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    duration = models.DecimalField(max_digits=5, decimal_places=2)
    location_type = models.CharField(max_length=10, choices=LOCATION_CHOICES)
    location_area = models.CharField(max_length=100, null=True, blank=True, help_text='General area for in-person services (e.g., Besiktas, Kadikoy)')
    location_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text='Latitude for approximate location')
    location_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text='Longitude for approximate location')
    location = gis_models.PointField(null=True, blank=True, geography=True, srid=4326, help_text='PostGIS point for geospatial queries')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Active')
    max_participants = models.IntegerField(default=1)
    schedule_type = models.CharField(max_length=10, choices=SCHEDULE_CHOICES)
    schedule_details = models.TextField(blank=True, null=True)
    tags = models.ManyToManyField(Tag, blank=True)
    hot_score = models.FloatField(default=0.0, db_index=True, help_text='Ranking score for hot/trending services')
    is_visible = models.BooleanField(default=True, help_text='Admin can hide inappropriate services')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        """
        Auto-populate PointField from lat/lng for geospatial queries.
        
        When using update_fields with only one coordinate, the other coordinate
        is refreshed from the database to prevent computing location with stale
        in-memory values (race condition prevention).
        """
        update_fields = kwargs.get('update_fields')
        should_compute_location = False
        
        if update_fields is None:
            # Full save - compute location from in-memory values
            should_compute_location = True
        else:
            lat_in_fields = 'location_lat' in update_fields
            lng_in_fields = 'location_lng' in update_fields
            
            if lat_in_fields or lng_in_fields:
                should_compute_location = True
                
                # If only one coordinate is being updated and this is an existing object,
                # refresh the OTHER coordinate from DB to avoid using stale in-memory value.
                # This prevents race conditions where another process updated the other
                # coordinate between our load and save.
                if self.pk is not None and (lat_in_fields != lng_in_fields):
                    if lat_in_fields and not lng_in_fields:
                        # Refreshing location_lng from database
                        db_values = Service.objects.filter(pk=self.pk).values('location_lng').first()
                        if db_values:
                            self.location_lng = db_values['location_lng']
                    elif lng_in_fields and not lat_in_fields:
                        # Refreshing location_lat from database
                        db_values = Service.objects.filter(pk=self.pk).values('location_lat').first()
                        if db_values:
                            self.location_lat = db_values['location_lat']
        
        if should_compute_location:
            if self.location_lat is not None and self.location_lng is not None:
                self.location = Point(float(self.location_lng), float(self.location_lat), srid=4326)
            else:
                self.location = None
            
            # Add location to update_fields if doing partial save
            if update_fields is not None:
                update_fields_set = set(update_fields)
                update_fields_set.add('location')
                kwargs['update_fields'] = list(update_fields_set)
        
        # Calculate hot_score on creation or when status changes to Active
        # Skip if update_fields is specified and doesn't include status or hot_score
        should_calculate_hot_score = False
        if update_fields is None:
            # Full save - calculate if this is a new service or status is Active
            should_calculate_hot_score = (self.pk is None) or (self.status == 'Active')
        else:
            # Partial save - only calculate if status is being set to Active
            if 'status' in update_fields and self.status == 'Active':
                should_calculate_hot_score = True
        
        defer_hot_score_calculation = False
        if should_calculate_hot_score and self.status == 'Active':
            # UUID primary keys are assigned before the first DB save, so use
            # the model state (and created_at) to detect "new" instances.
            if self._state.adding or self.created_at is None:
                defer_hot_score_calculation = True
            else:
                from .ranking import calculate_hot_score
                self.hot_score = calculate_hot_score(self)
                if update_fields is not None:
                    update_fields_set = set(update_fields)
                    update_fields_set.add('hot_score')
                    kwargs['update_fields'] = list(update_fields_set)

        super().save(*args, **kwargs)

        if defer_hot_score_calculation:
            from .ranking import calculate_hot_score
            self.hot_score = calculate_hot_score(self)
            super().save(update_fields=['hot_score'])

    def __str__(self):
        return self.title

    class Meta:
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['type', 'status']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['status', 'type', 'created_at']),
            models.Index(fields=['location_type', 'location_area']),
            models.Index(fields=['status', '-hot_score']),  # For hot sorting
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(duration__gt=0),
                name='service_duration_positive',
            ),
            models.CheckConstraint(
                check=models.Q(max_participants__gt=0),
                name='service_max_participants_positive',
            ),
        ]

class Handshake(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('denied', 'Denied'),
        ('cancelled', 'Cancelled'),
        ('completed', 'Completed'),
        ('reported', 'Reported'),
        ('paused', 'Paused'),  # Interim state during dispute investigation
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='handshakes')
    requester = models.ForeignKey(User, on_delete=models.CASCADE, related_name='requested_handshakes')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    provisioned_hours = models.DecimalField(max_digits=5, decimal_places=2)
    provider_confirmed_complete = models.BooleanField(default=False)
    receiver_confirmed_complete = models.BooleanField(default=False)
    exact_location = models.CharField(max_length=255, null=True, blank=True, help_text='Exact location agreed upon by both parties')
    exact_duration = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text='Exact duration agreed upon by both parties')
    scheduled_time = models.DateTimeField(null=True, blank=True, help_text='Scheduled time for the service')
    provider_initiated = models.BooleanField(default=False, help_text='Whether provider has initiated the handshake')
    requester_initiated = models.BooleanField(default=False, help_text='Whether requester has initiated the handshake')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.requester.email} -> {self.service.title} ({self.status})"

    class Meta:
        indexes = [
            models.Index(fields=['service', 'status']),
            models.Index(fields=['requester', 'status']),
            models.Index(fields=['status', 'scheduled_time']),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(provisioned_hours__gt=0),
                name='handshake_provisioned_hours_positive',
            ),
        ]

class ChatMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handshake = models.ForeignKey(Handshake, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sender.email}: {self.body[:50]}"

    class Meta:
        indexes = [
            models.Index(fields=['handshake', 'created_at']),
            models.Index(fields=['sender']),
        ]

class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=50)
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    related_handshake = models.ForeignKey(Handshake, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    related_service = models.ForeignKey(Service, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'is_read', 'created_at']),
            models.Index(fields=['related_handshake']),
            models.Index(fields=['related_service']),
        ]
        ordering = ['-created_at']

class ReputationRep(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handshake = models.ForeignKey(Handshake, on_delete=models.CASCADE, related_name='reps')
    giver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='given_reps')
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_reps')
    is_punctual = models.BooleanField(default=False)
    is_helpful = models.BooleanField(default=False)
    is_kind = models.BooleanField(default=False)
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['receiver', 'created_at']),
            models.Index(fields=['giver', 'created_at']),
            models.Index(fields=['handshake']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['handshake', 'giver'],
                name='unique_reputation_per_handshake_giver',
            ),
        ]

class TransactionHistory(models.Model):
    """Track all TimeBank transactions for audit and user visibility"""
    TRANSACTION_TYPES = (
        ('provision', 'Provision'),  # Hours escrowed when handshake accepted
        ('transfer', 'Transfer'),    # Hours transferred when service completed
        ('refund', 'Refund'),        # Hours refunded when handshake cancelled
        ('adjustment', 'Adjustment'), # Manual adjustment (admin only)
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=10, decimal_places=2, help_text='Positive for credits, negative for debits')
    balance_after = models.DecimalField(max_digits=10, decimal_places=2, help_text='User balance after this transaction')
    handshake = models.ForeignKey(Handshake, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    description = models.TextField(help_text='Human-readable description of the transaction')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['transaction_type', 'created_at']),
            models.Index(fields=['user', 'transaction_type', 'created_at']),
            models.Index(fields=['handshake']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.email} - {self.transaction_type} - {self.amount} hours"

class Report(models.Model):
    """Reports for issues with services or users"""
    TYPE_CHOICES = (
        ('no_show', 'No-Show Dispute'),
        ('inappropriate_content', 'Inappropriate Content'),
        ('service_issue', 'Service Issue'),
        ('spam', 'Spam'),
        ('scam', 'Scam or Fraud'),
        ('harassment', 'Harassment'),
        ('other', 'Other'),
    )
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('resolved', 'Resolved'),
        ('dismissed', 'Dismissed'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reports_made')
    reported_user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='reports_received')
    reported_service = models.ForeignKey(Service, on_delete=models.CASCADE, null=True, blank=True, related_name='reports')
    related_handshake = models.ForeignKey(Handshake, on_delete=models.CASCADE, null=True, blank=True, related_name='reports')
    type = models.CharField(max_length=25, choices=TYPE_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    description = models.TextField()
    admin_notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='resolved_reports')

    def __str__(self):
        return f"{self.type} - {self.status}"

    class Meta:
        indexes = [
            models.Index(fields=['reporter']),
            models.Index(fields=['reported_user']),
            models.Index(fields=['reported_service']),
            models.Index(fields=['related_handshake']),
            models.Index(fields=['resolved_by']),
            models.Index(fields=['status', 'created_at']),
        ]


class ChatRoom(models.Model):
    """Public chat room for service discussions (lobby)"""
    TYPE_CHOICES = (
        ('public', 'Public'),
        ('private', 'Private'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='public')
    related_service = models.OneToOneField(
        Service, 
        on_delete=models.CASCADE, 
        related_name='chat_room', 
        null=True, 
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.type})"

    class Meta:
        indexes = [
            models.Index(fields=['type']),
            models.Index(fields=['related_service']),
        ]


class PublicChatMessage(models.Model):
    """Messages in public chat rooms"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='public_messages')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sender.email}: {self.body[:50]}"

    class Meta:
        indexes = [
            models.Index(fields=['room', 'created_at']),
            models.Index(fields=['sender']),
        ]
        ordering = ['created_at']


class Comment(models.Model):
    """Comments on services with single-level threading (top-level + replies)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='comments')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='replies',
        help_text='Parent comment for replies (null for top-level comments)'
    )
    body = models.TextField(max_length=2000)
    is_deleted = models.BooleanField(default=False, help_text='Soft delete flag')
    is_verified_review = models.BooleanField(
        default=False,
        help_text='True if this is a post-completion verified review'
    )
    related_handshake = models.ForeignKey(
        Handshake,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='review_comments',
        help_text='Linked handshake for verified reviews'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        prefix = "Review" if self.is_verified_review else ("Reply" if self.parent else "Comment")
        return f"{prefix} by {self.user.email} on {self.service.title[:30]}"

    class Meta:
        indexes = [
            models.Index(fields=['service', 'created_at']),
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['parent']),
            models.Index(fields=['service', 'is_deleted', 'created_at']),
            models.Index(fields=['related_handshake']),
            models.Index(fields=['service', 'is_verified_review']),
        ]
        ordering = ['created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['related_handshake', 'user'],
                condition=models.Q(is_verified_review=True, is_deleted=False),
                name='unique_verified_review_per_handshake_user',
            ),
        ]


class NegativeRep(models.Model):
    """Negative reputation feedback for completed handshakes"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    handshake = models.ForeignKey(Handshake, on_delete=models.CASCADE, related_name='negative_reps')
    giver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='given_negative_reps')
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_negative_reps')
    is_late = models.BooleanField(default=False, help_text='Was late or no-show')
    is_unhelpful = models.BooleanField(default=False, help_text='Was unhelpful or uncooperative')
    is_rude = models.BooleanField(default=False, help_text='Was rude or disrespectful')
    comment = models.TextField(blank=True, null=True, help_text='Optional explanation')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Negative rep from {self.giver.email} to {self.receiver.email}"

    class Meta:
        indexes = [
            models.Index(fields=['receiver', 'created_at']),
            models.Index(fields=['giver', 'created_at']),
            models.Index(fields=['handshake']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['handshake', 'giver'],
                name='unique_negative_rep_per_handshake_giver',
            ),
        ]


class ForumCategory(models.Model):
    """Forum categories for organizing community discussions"""
    COLOR_CHOICES = (
        ('blue', 'Blue'),
        ('green', 'Green'),
        ('purple', 'Purple'),
        ('amber', 'Amber'),
        ('orange', 'Orange'),
        ('pink', 'Pink'),
        ('red', 'Red'),
        ('teal', 'Teal'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    slug = models.SlugField(max_length=100, unique=True)
    icon = models.CharField(
        max_length=50, 
        blank=True, 
        default='message-square',
        help_text='Lucide icon name (e.g., message-square, users, book-open)'
    )
    color = models.CharField(max_length=20, choices=COLOR_CHOICES, default='blue')
    display_order = models.IntegerField(default=0, help_text='Lower numbers appear first')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['display_order', 'name']
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['is_active', 'display_order']),
        ]
        verbose_name_plural = 'Forum Categories'


class ForumTopic(models.Model):
    """Forum topics (threads) within categories"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        ForumCategory, 
        on_delete=models.CASCADE, 
        related_name='topics'
    )
    author = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='forum_topics'
    )
    title = models.CharField(max_length=200)
    body = models.TextField(max_length=10000)
    is_pinned = models.BooleanField(default=False, help_text='Pinned topics appear at the top')
    is_locked = models.BooleanField(default=False, help_text='Locked topics cannot receive new posts')
    view_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    class Meta:
        ordering = ['-is_pinned', '-created_at']
        indexes = [
            models.Index(fields=['category', '-is_pinned', '-created_at']),
            models.Index(fields=['author', 'created_at']),
            models.Index(fields=['category', 'is_pinned']),
        ]


class ForumPost(models.Model):
    """Replies/posts within a forum topic"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    topic = models.ForeignKey(
        ForumTopic, 
        on_delete=models.CASCADE, 
        related_name='posts'
    )
    author = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='forum_posts'
    )
    body = models.TextField(max_length=5000)
    is_deleted = models.BooleanField(default=False, help_text='Soft delete flag')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Post by {self.author.email} in {self.topic.title[:30]}"

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['topic', 'created_at']),
            models.Index(fields=['author', 'created_at']),
            models.Index(fields=['topic', 'is_deleted', 'created_at']),
        ]


class ServiceMedia(models.Model):
    """Media files (images/videos) attached to services"""
    MEDIA_TYPE_CHOICES = (
        ('image', 'Image'),
        ('video', 'Video'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='media')
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES, default='image')
    file_url = models.TextField(blank=True, null=True, help_text='URL to the media file (data URL or external URL)')
    file = models.FileField(upload_to='service_media/', blank=True, null=True, help_text='Uploaded media file')
    display_order = models.IntegerField(default=0, help_text='Order for displaying media (lower numbers first)')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.media_type} for {self.service.title}"

    class Meta:
        ordering = ['display_order', 'created_at']
        indexes = [
            models.Index(fields=['service', 'display_order']),
            models.Index(fields=['service', 'media_type']),
        ]
