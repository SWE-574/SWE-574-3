#!/usr/bin/env python
"""
Mother's Day presentation seed — The Hive
Creates Yusuf Arslan (3-year member), Selman Demir (3-day newcomer),
and all supporting data required by docs/mothers-day-scenario.md.

Run: python setup_mothers_day.py
Idempotent: deletes and recreates its own users on each run.
Does NOT touch existing demo users.
"""
import os
import django

if __name__ == "__main__":
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hive_project.settings')
    django.setup()

from api.models import (
    ChatMessage, Handshake, Notification, ReputationRep, Comment,
    Service, Tag, User, UserBadge, ServiceMedia, TransactionHistory,
    NegativeRep, UserFollow, CommentMedia,
)
from api.achievement_utils import check_and_assign_badges
from api.services import HandshakeService, EventHandshakeService
from api.utils import (
    provision_timebank, complete_timebank_transfer,
    get_provider_and_receiver,
)
from django.contrib.auth.hashers import make_password
from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta

print("=" * 60)
print("The Hive — Mother's Day Scenario Seed")
print("=" * 60)

# ---------------------------------------------------------------------------
# [1] Cleanup
# ---------------------------------------------------------------------------
from django.core.cache import cache as _cache
_cache.clear()
print("  Cache cleared")

print("\n[1/9] Cleaning up existing Mother's Day seed data...")

SEED_EMAILS = [
    'yusuf@demo.com', 'selman@demo.com',
    'berk@demo.com', 'ahmet@demo.com', 'leyla@demo.com', 'kaan@demo.com',
]

seed_users = User.objects.filter(email__in=SEED_EMAILS)
if seed_users.exists():
    print(f"  Removing data for {seed_users.count()} seed users...")
    user_ids = list(seed_users.values_list('id', flat=True))
    ServiceMedia.objects.filter(service__user_id__in=user_ids).delete()
    Handshake.objects.filter(Q(requester_id__in=user_ids) | Q(service__user_id__in=user_ids)).delete()
    Service.objects.filter(user_id__in=user_ids).delete()
    Notification.objects.filter(user_id__in=user_ids).delete()
    ReputationRep.objects.filter(Q(giver_id__in=user_ids) | Q(receiver_id__in=user_ids)).delete()
    NegativeRep.objects.filter(Q(giver_id__in=user_ids) | Q(receiver_id__in=user_ids)).delete()
    UserBadge.objects.filter(user_id__in=user_ids).delete()
    Comment.objects.filter(user_id__in=user_ids).delete()
    ChatMessage.objects.filter(sender_id__in=user_ids).delete()
    UserFollow.objects.filter(Q(follower_id__in=user_ids) | Q(following_id__in=user_ids)).delete()
    TransactionHistory.objects.filter(user_id__in=user_ids).delete()
    seed_users.delete()
    print("  Done")
else:
    print("  No existing seed users found")

# ---------------------------------------------------------------------------
# [2] Tags
# ---------------------------------------------------------------------------
print("\n[2/9] Ensuring required tags exist...")

TAGS_NEEDED = [
    ('Q8476', 'Cooking'),
    ('Q11631', 'Photography'),
    ('Q3199876', 'Financial literacy'),
    ('Q11465', 'Education'),
    ('Q11461', 'Sports'),
    ('Q11466', 'Technology'),
    ('Q2013', 'Language'),
    ('Q11019', 'Art'),
]

tag_objects = {}
for qid, name in TAGS_NEEDED:
    obj, _ = Tag.objects.get_or_create(id=qid, defaults={'name': name})
    tag_objects[name] = obj
    print(f"  Tag: {name}")

cooking_tag = tag_objects['Cooking']
photography_tag = tag_objects['Photography']
finance_tag = tag_objects['Financial literacy']
education_tag = tag_objects['Education']
sports_tag = tag_objects['Sports']
technology_tag = tag_objects['Technology']
language_tag = tag_objects['Language']
art_tag = tag_objects['Art']

# ---------------------------------------------------------------------------
# [3] Helper functions
# ---------------------------------------------------------------------------

now = timezone.now()

CURATED_AVATARS = {
    'yusuf':  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'selman': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'berk':   'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'ahmet':  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'leyla':  'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'kaan':   'https://images.unsplash.com/photo-1504257432389-52343af06ae3?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
}

MEDIA_LIBRARY = {
    'community': [
        'https://images.unsplash.com/photo-1511632765486-a01980e01a18',
        'https://images.unsplash.com/photo-1529156069898-49953e39b3ac',
        'https://images.unsplash.com/photo-1517457373958-b7bdd4587205',
    ],
    'photography': [
        'https://images.unsplash.com/photo-1542038784456-1ea8e935640e',
        'https://images.unsplash.com/photo-1554080353-a576cf803bda',
        'https://images.unsplash.com/photo-1452587925148-ce544e77e70d',
    ],
    'cooking': [
        'https://images.unsplash.com/photo-1556910103-1c02745aae4d',
        'https://images.unsplash.com/photo-1466637574441-749b8f19452f',
        'https://images.unsplash.com/photo-1507048331197-7d4ac70811cf',
    ],
    'finance': [
        'https://images.unsplash.com/photo-1531297484001-80022131f5a1',
        'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b',
    ],
    'walk': [
        'https://images.unsplash.com/photo-1501785888041-af3ef285b470',
        'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1',
    ],
    'books': [
        'https://images.unsplash.com/photo-1481627834876-b7833e8f5570',
        'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f',
    ],
    'cars': [
        'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf',
        'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d',
    ],
    'math': [
        'https://images.unsplash.com/photo-1635070041078-e363dbe005cb',
        'https://images.unsplash.com/photo-1509228468518-180dd4864904',
    ],
    'music': [
        'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
        'https://images.unsplash.com/photo-1507838153414-b4b713384a76',
    ],
    'guitar': [
        'https://images.unsplash.com/photo-1510915361894-db8b60106cb1',
        'https://images.unsplash.com/photo-1525201548942-d8732f6617a0',
    ],
    'art': [
        'https://images.unsplash.com/photo-1513364776144-60967b0f800f',
        'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b',
    ],
    'brunch': [
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0',
        'https://images.unsplash.com/photo-1528605248644-14dd04022da1',
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836',
    ],
    'picnic': [
        'https://images.unsplash.com/photo-1559027615-cd4628902d4a',
        'https://images.unsplash.com/photo-1517457373958-b7bdd4587205',
    ],
    'soccer': [
        'https://images.unsplash.com/photo-1508098682722-e99c43a406b2',
        'https://images.unsplash.com/photo-1574629810360-7efbbe195018',
    ],
    'gaming': [
        'https://images.unsplash.com/photo-1542751371-adc38448a05e',
        'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8',
    ],
}

SEMANTIC_OVERRIDES = [
    (('photography', 'photo walk', 'camera', 'balat'), 'photography'),
    (('cooking', 'tarhana', 'kitchen', 'brunch', 'recipe'), 'cooking'),
    (('brunch', 'picnic', 'park'), 'brunch'),
    (('picnic',), 'picnic'),
    (('finance', 'financial', 'money', 'brokerage'), 'finance'),
    (('walk', 'bosphorus', 'sunrise', 'morning walk'), 'walk'),
    (('book', 'reading', 'düşünme', 'circle'), 'books'),
    (('manual transmission', 'driving', 'car'), 'cars'),
    (('calculus', 'math', 'algebra', 'tutoring'), 'math'),
    (('match', 'football', 'watch party', 'kuruçeşme', 'soccer'), 'soccer'),
    (('music', 'singalong'), 'music'),
    (('guitar',), 'guitar'),
    (('watercolour', 'painting', 'botanical'), 'art'),
    (('lol', 'ranked', 'gaming', 'esports'), 'gaming'),
]


def semantic_theme(text):
    lower = text.lower()
    for keywords, theme in SEMANTIC_OVERRIDES:
        if any(k in lower for k in keywords):
            return theme
    return 'community'


def seed_text(text):
    return sum(ord(c) for c in text.lower())


def service_cover_url(title, width=800, height=600):
    theme = semantic_theme(title)
    urls = MEDIA_LIBRARY.get(theme, MEDIA_LIBRARY['community'])
    url = urls[seed_text(title) % len(urls)]
    return f"{url}?auto=format&fit=crop&crop=entropy&w={width}&h={height}&q=80"


def build_google_maps_url(lat, lng):
    return f"https://www.google.com/maps?q={float(lat)},{float(lng)}"


def create_user(email, first_name, last_name, bio, balance, karma,
                date_joined_offset_days=0, avatar_key=None, location=None,
                is_onboarded=True):
    avatar_url = CURATED_AVATARS.get(avatar_key or first_name.lower())
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            'password': make_password('demo123'),
            'first_name': first_name,
            'last_name': last_name,
            'bio': bio,
            'avatar_url': avatar_url,
            'location': location,
            'timebank_balance': Decimal(str(balance)),
            'karma_score': karma,
            'role': 'member',
            'is_verified': True,
            'is_onboarded': is_onboarded,
            'date_joined': timezone.now() - timedelta(days=date_joined_offset_days),
        }
    )
    if not created:
        user.timebank_balance = Decimal(str(balance))
        user.karma_score = karma
        user.is_onboarded = is_onboarded
        user.save()
    print(f"  {'Created' if created else 'Updated'}: {email} ({first_name} {last_name})")
    return user


def follow(follower, following):
    UserFollow.objects.get_or_create(follower=follower, following=following)


def create_service(*, user, title, description, service_type, duration,
                   location_type, max_participants, schedule_type,
                   tags, location_area=None, location_lat=None, location_lng=None,
                   schedule_details=None, scheduled_time=None, status='Active',
                   created_days_ago=0, requires_qr_checkin=False, cover_url=None):
    svc = Service.objects.create(
        user=user,
        title=title,
        description=description,
        type=service_type,
        duration=Decimal(str(duration)),
        location_type=location_type,
        location_area=location_area,
        location_lat=location_lat,
        location_lng=location_lng,
        max_participants=max_participants,
        schedule_type=schedule_type,
        schedule_details=schedule_details,
        scheduled_time=scheduled_time,
        status=status,
        requires_qr_checkin=requires_qr_checkin,
    )
    # auto_now_add=True ignores created_at in objects.create(); use update() to backdate.
    if created_days_ago > 0:
        Service.objects.filter(pk=svc.pk).update(created_at=now - timedelta(days=created_days_ago))
        svc.refresh_from_db(fields=['created_at'])
    svc.tags.set(tags)
    ServiceMedia.objects.create(
        service=svc,
        media_type='image',
        file_url=cover_url or service_cover_url(title),
        display_order=0,
    )
    print(f"  Service: {title}")
    return svc


def backdate_timebank_activity(*, created_at, handshake):
    TransactionHistory.objects.filter(handshake=handshake).update(created_at=created_at)


def complete_seeded_handshake(handshake, *, completed_days_ago):
    completion_offset = timedelta(days=completed_days_ago) if completed_days_ago > 0 else timedelta(hours=3)
    completion_time = now - completion_offset
    scheduled_time = handshake.scheduled_time
    if scheduled_time is None or scheduled_time >= completion_time:
        scheduled_time = completion_time - timedelta(hours=2)
    with transaction.atomic():
        handshake.scheduled_time = scheduled_time
        handshake.provider_confirmed_complete = True
        handshake.receiver_confirmed_complete = True
        handshake.updated_at = completion_time
        handshake.save()
        complete_timebank_transfer(handshake)
        Handshake.objects.filter(pk=handshake.pk).update(
            scheduled_time=scheduled_time,
            updated_at=completion_time,
        )
        backdate_timebank_activity(
            created_at=completion_time + timedelta(minutes=5),
            handshake=handshake,
        )
        svc = Service.objects.get(pk=handshake.service.pk)
        if svc.schedule_type == 'One-Time':
            active = Handshake.objects.filter(
                service=svc,
                status__in=['pending', 'accepted', 'reported', 'paused'],
            ).count()
            if active == 0 and svc.status != 'Completed':
                svc.status = 'Completed'
                svc.save(update_fields=['status'])
        if svc.status == 'Completed' and (svc.scheduled_time is None or svc.scheduled_time >= completion_time):
            svc.scheduled_time = scheduled_time
            svc.save(update_fields=['scheduled_time'])
    handshake.refresh_from_db()
    provider, receiver = get_provider_and_receiver(handshake)
    check_and_assign_badges(provider)
    check_and_assign_badges(receiver)
    return handshake


def simulate_handshake_workflow(service, requester, *, provider_initiated_days_ago=0, completed_days_ago=None):
    handshake = HandshakeService.express_interest(service, requester)
    created_at = now - timedelta(days=provider_initiated_days_ago + 2)
    Handshake.objects.filter(pk=handshake.pk).update(created_at=created_at)
    handshake.refresh_from_db()

    handshake.provider_initiated = True
    handshake.exact_location = f'{service.location_area or "Online"} area'
    handshake.exact_duration = service.duration
    handshake.scheduled_time = now + timedelta(days=3)
    if service.location_lat and service.location_lng:
        handshake.exact_location_maps_url = build_google_maps_url(service.location_lat, service.location_lng)
    handshake.updated_at = created_at + timedelta(hours=2)
    handshake.save()

    provision_timebank(handshake)
    backdate_timebank_activity(created_at=created_at + timedelta(hours=3), handshake=handshake)
    handshake.status = 'accepted'
    handshake.requester_initiated = True
    handshake.updated_at = created_at + timedelta(hours=4)
    handshake.save()

    if completed_days_ago is not None:
        handshake = complete_seeded_handshake(handshake, completed_days_ago=completed_days_ago)
        return handshake, True
    return handshake, False


def event_rsvp(service, requester, joined_days_ago=0):
    handshake = EventHandshakeService.join_event(service, requester)
    joined_at = now - timedelta(days=joined_days_ago)
    Handshake.objects.filter(pk=handshake.pk).update(
        created_at=joined_at,
        updated_at=joined_at + timedelta(hours=1),
    )
    handshake.refresh_from_db()
    return handshake


def backdate_completed_event(service, days_ago):
    completed_at = now - timedelta(days=days_ago)
    scheduled_at = completed_at - timedelta(hours=2)
    window_end = completed_at + timedelta(hours=48)
    Service.objects.filter(pk=service.pk).update(
        scheduled_time=scheduled_at,
        event_completed_at=completed_at,
        status='Completed',
    )
    Handshake.objects.filter(service=service, status__in=['attended', 'completed']).update(
        scheduled_time=scheduled_at,
        updated_at=completed_at,
        evaluation_window_starts_at=completed_at,
        evaluation_window_ends_at=window_end,
        evaluation_window_closed_at=window_end,
    )
    service.refresh_from_db()


def add_reputation(handshake, giver, receiver, punctual=True, helpful=True, kind=True, comment='', image_url=None):
    rep_time = handshake.updated_at + timedelta(hours=2)
    rep = ReputationRep.objects.create(
        handshake=handshake,
        giver=giver,
        receiver=receiver,
        is_punctual=punctual,
        is_helpful=helpful,
        is_kind=kind,
        comment=comment,
    )
    ReputationRep.objects.filter(pk=rep.pk).update(created_at=rep_time)
    if comment:
        c = Comment.objects.create(
            service=handshake.service,
            user=giver,
            body=comment,
            is_verified_review=True,
            related_handshake=handshake,
        )
        Comment.objects.filter(pk=c.pk).update(created_at=rep_time)
        if image_url:
            CommentMedia.objects.create(comment=c, file_url=image_url)
    return rep


# ---------------------------------------------------------------------------
# [3] Fetch existing demo users we reference in Yusuf's history
# ---------------------------------------------------------------------------
print("\n[3/9] Fetching existing demo users...")

try:
    murat_demo = User.objects.get(email='murat@demo.com')
    can_demo = User.objects.get(email='can@demo.com')
    selin_demo = User.objects.get(email='selin@demo.com')
    emre_demo = User.objects.get(email='emre@demo.com')
    ayse_demo = User.objects.get(email='ayse@demo.com')
    zeynep_demo = User.objects.get(email='zeynep@demo.com')
    deniz_demo = User.objects.get(email='deniz@demo.com')
    burak_demo = User.objects.get(email='burak@demo.com')
    elif_demo = User.objects.get(email='elif@demo.com')
    levent_demo = User.objects.get(email='levent@demo.com')
    yasemin_demo = User.objects.get(email='yasemin@demo.com')
    print("  All existing demo users found")
except User.DoesNotExist as exc:
    print(f"  WARNING: {exc}")
    print("  Run 'make setup-demo' first to create the base demo users.")
    raise SystemExit(1)

# ---------------------------------------------------------------------------
# [4] Create new personas
# ---------------------------------------------------------------------------
print("\n[4/9] Creating new personas...")

berk = create_user(
    'berk@demo.com', 'Berk', 'Koçak',
    'Community organiser and football fan in Beşiktaş. I love bringing neighbours together for match nights and outdoor events by the Bosphorus.',
    balance=8, karma=45, date_joined_offset_days=1200,
    avatar_key='berk', location='Beşiktaş, Istanbul',
)

ahmet = create_user(
    'ahmet@demo.com', 'Ahmet', 'Koç',
    'Retired driving instructor in Beşiktaş. Happy to share practical skills with neighbours: manual transmission, parallel parking, the works.',
    balance=6, karma=38, date_joined_offset_days=1100,
    avatar_key='ahmet', location='Beşiktaş, Istanbul',
)

leyla = create_user(
    'leyla@demo.com', 'Leyla', 'Şahin',
    'Marketing professional in Levent. Interested in personal finance, investing, and how to make money work smarter for creative people.',
    balance=5, karma=22, date_joined_offset_days=400,
    avatar_key='leyla', location='Beşiktaş, Istanbul',
)

kaan = create_user(
    'kaan@demo.com', 'Kaan', 'Yılmaz',
    'Software developer and casual gamer in Kadıköy. I organize online game nights and occasional co-working sessions.',
    balance=4, karma=19, date_joined_offset_days=300,
    avatar_key='kaan', location='Kadıköy, Istanbul',
)

yusuf = create_user(
    'yusuf@demo.com', 'Yusuf', 'Arslan',
    'Three years ago I moved to Bebek from İzmir knowing nobody in the city. The Hive is how I found my neighbourhood. I work in financial risk in Levent, but my weekends here have been the real education: photography walks in Balat, tarhana Sundays in Can\'s kitchen, book circles, sunrise walks by the Bosphorus. Three years on, I know this neighbourhood by name. Happy to talk finance or share a recipe anytime.',
    balance=19,  # 3 starting + 16 earned over 3 years; transactions will net to ~14
    karma=87, date_joined_offset_days=1095,
    avatar_key='yusuf', location='Bebek, Istanbul',
)
yusuf.skills.set([photography_tag, cooking_tag, finance_tag])

selman = create_user(
    'selman@demo.com', 'Selman', 'Demir',
    'New to İstanbul! Just moved to Beşiktaş from Ankara for a software job and still figuring out the neighbourhood. I help high school students with maths on weekends, happy to tutor geometry, algebra, whatever\'s giving them trouble. Also trying to learn how to cook properly for the first time in my life 🙂',
    balance=3, karma=0, date_joined_offset_days=3,
    avatar_key='selman', location='Beşiktaş, Istanbul',
    is_onboarded=False,
)

# ---------------------------------------------------------------------------
# [5] Social follows — Yusuf follows 12 people
# ---------------------------------------------------------------------------
print("\n[5/9] Creating Yusuf's follow graph...")

for person in [ayse_demo, murat_demo, can_demo, selin_demo, emre_demo, zeynep_demo,
               levent_demo, yasemin_demo, berk, ahmet, leyla, kaan]:
    follow(yusuf, person)

# A few people follow Yusuf back (makes his follower count non-zero)
for person in [ayse_demo, can_demo, selin_demo, berk]:
    follow(person, yusuf)

total_follows = UserFollow.objects.filter(follower=yusuf).count()
print(f"  Yusuf follows {total_follows} people")

# ---------------------------------------------------------------------------
# [6] Yusuf's 3-year history
# ---------------------------------------------------------------------------
print("\n[6/9] Creating Yusuf's 3-year history...")

# ------------------------------------------------------------------
# History item 1: Türkiye Match Night — Watch Party at Kuruçeşme
# Jun 2023 — Event by Berk, Yusuf attended
# ~1065 days ago
# ------------------------------------------------------------------
watch_party_hist = create_service(
    user=berk,
    title='Türkiye Match Night: Watch Party at Kuruçeşme',
    description='Watch the Türkiye qualifier together on the outdoor screen by the Bosphorus at Kuruçeşme. Come for the match, stay for the crowd.',
    service_type='Event',
    duration='3.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0612'),
    location_lng=Decimal('29.0280'),
    max_participants=20,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(hours=8),  # temp future for workflow
    schedule_details='Kick-off at 21:00, meet at the outdoor screen',
    tags=[sports_tag],
    created_days_ago=1080,
    status='Active',
)
# RSVP + check-in + attend + complete + backdate
hs_watch = event_rsvp(watch_party_hist, yusuf, joined_days_ago=1068)
hs_watch = EventHandshakeService.checkin(hs_watch, yusuf)
hs_watch = EventHandshakeService.mark_attended(hs_watch, berk)
hs_watch_emre = event_rsvp(watch_party_hist, emre_demo, joined_days_ago=1068)
hs_watch_emre = EventHandshakeService.checkin(hs_watch_emre, emre_demo)
EventHandshakeService.mark_attended(hs_watch_emre, berk)
hs_watch_can = event_rsvp(watch_party_hist, can_demo, joined_days_ago=1068)
hs_watch_can = EventHandshakeService.checkin(hs_watch_can, can_demo)
EventHandshakeService.mark_attended(hs_watch_can, berk)
hs_watch_murat = event_rsvp(watch_party_hist, murat_demo, joined_days_ago=1068)
hs_watch_murat = EventHandshakeService.checkin(hs_watch_murat, murat_demo)
EventHandshakeService.mark_attended(hs_watch_murat, berk)
EventHandshakeService.complete_event(watch_party_hist, berk)
backdate_completed_event(watch_party_hist, days_ago=1065)
hs_watch.refresh_from_db()
print("  History 1: Watch Party (Jun 2023) — attended")

# ------------------------------------------------------------------
# History item 1b: Sourdough & Fermentation Basics
# Aug 2023 — Offer by Yasemin, Yusuf attended as learner
# ~1000 days ago
# ------------------------------------------------------------------
sourdough_offer = create_service(
    user=yasemin_demo,
    title='Sourdough & Fermentation Basics',
    description='Learn to make sourdough starter, country loaf, and simple vegetable ferments. Small group, hands-on kitchen session in Nişantaşı.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Nişantaşı, Istanbul',
    location_lat=Decimal('41.0498'),
    location_lng=Decimal('28.9965'),
    max_participants=4,
    schedule_type='One-Time',
    schedule_details='Saturday afternoon session',
    tags=[cooking_tag],
    created_days_ago=1014,
)
hs_sourdough, _ = simulate_handshake_workflow(
    sourdough_offer, yusuf,
    provider_initiated_days_ago=1014,
    completed_days_ago=1000,
)
print("  History 1b: Sourdough & Fermentation Basics (Aug 2023) — completed as learner")

# ------------------------------------------------------------------
# History item 2: Manual Transmission Crash Course
# Oct 2023 — Need by Yusuf, Ahmet taught him
# ~930 days ago
# ------------------------------------------------------------------
driving_need = create_service(
    user=yusuf,
    title='Manual Transmission Crash Course',
    description='I need a patient teacher to help me finally master a manual gearbox. One session, practical and hands-on.',
    service_type='Need',
    duration='2.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Available most weekends',
    tags=[education_tag],
    created_days_ago=945,
)
hs_driving, _ = simulate_handshake_workflow(
    driving_need, ahmet,
    provider_initiated_days_ago=944,   # creation ~2 weeks before completion
    completed_days_ago=930,
)
print("  History 2: Manual Transmission (Oct 2023) — completed as learner")

# ------------------------------------------------------------------
# History item 3: Street Photography Walk — Balat
# Mar 2024 — Offer by Murat, Yusuf attended as learner
# ~775 days ago
# ------------------------------------------------------------------
balat_photo = create_service(
    user=murat_demo,
    title='Street Photography Walk in Balat',
    description='A relaxed walk through Balat with a focus on composition, light, and respectful street photography. All camera types welcome.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Fatih',
    location_lat=Decimal('41.0272'),
    location_lng=Decimal('28.9453'),
    max_participants=2,
    schedule_type='One-Time',
    schedule_details='Saturday morning, meeting at Balat ferry stop',
    tags=[photography_tag, art_tag],
    created_days_ago=790,
)
hs_photo, _ = simulate_handshake_workflow(
    balat_photo, yusuf,
    provider_initiated_days_ago=789,   # creation ~2 weeks before completion
    completed_days_ago=775,
)
print("  History 3: Street Photography Walk — Balat (Mar 2024) — completed as learner")

# ------------------------------------------------------------------
# History item 4: Book Circle: Hızlı ve Yavaş Düşünme — Session 5
# Aug 2024 — Event by Selin, Yusuf attended
# ~640 days ago
# ------------------------------------------------------------------
book_circle_hist = create_service(
    user=selin_demo,
    title='Book Circle: Hızlı ve Yavaş Düşünme, Session 5',
    description='We are reading Kahneman together, session by session. This week: chapters on cognitive ease and the availability heuristic. Come with notes or just curiosity.',
    service_type='Event',
    duration='2.00',
    location_type='In-Person',
    location_area='Beyoğlu',
    location_lat=Decimal('41.0320'),
    location_lng=Decimal('28.9740'),
    max_participants=12,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(hours=8),
    schedule_details='Sunday afternoon, Cihangir',
    tags=[language_tag, education_tag],
    created_days_ago=650,
    status='Active',
)
hs_book = event_rsvp(book_circle_hist, yusuf, joined_days_ago=645)
hs_book = EventHandshakeService.checkin(hs_book, yusuf)
hs_book = EventHandshakeService.mark_attended(hs_book, selin_demo)
hs_book_zeynep = event_rsvp(book_circle_hist, zeynep_demo, joined_days_ago=645)
hs_book_zeynep = EventHandshakeService.checkin(hs_book_zeynep, zeynep_demo)
EventHandshakeService.mark_attended(hs_book_zeynep, selin_demo)
hs_book_levent = event_rsvp(book_circle_hist, levent_demo, joined_days_ago=645)
hs_book_levent = EventHandshakeService.checkin(hs_book_levent, levent_demo)
EventHandshakeService.mark_attended(hs_book_levent, selin_demo)
hs_book_ayse = event_rsvp(book_circle_hist, ayse_demo, joined_days_ago=645)
hs_book_ayse = EventHandshakeService.checkin(hs_book_ayse, ayse_demo)
EventHandshakeService.mark_attended(hs_book_ayse, selin_demo)
hs_book_murat = event_rsvp(book_circle_hist, murat_demo, joined_days_ago=645)
hs_book_murat = EventHandshakeService.checkin(hs_book_murat, murat_demo)
EventHandshakeService.mark_attended(hs_book_murat, selin_demo)
EventHandshakeService.complete_event(book_circle_hist, selin_demo)
backdate_completed_event(book_circle_hist, days_ago=640)
hs_book.refresh_from_db()
print("  History 4: Book Circle (Aug 2024) — attended")

# ------------------------------------------------------------------
# History item 5: Homemade Tarhana from Scratch
# Jan 2025 — Offer by Can, Yusuf attended as learner
# ~490 days ago
# ------------------------------------------------------------------
tarhana_offer = create_service(
    user=can_demo,
    title='Homemade Tarhana from Scratch',
    description='A Sunday afternoon in my kitchen making fermented tarhana base together. You will leave with a jar and a recipe. No experience needed, just patience.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=2,
    schedule_type='One-Time',
    schedule_details='Sunday afternoon in Beşiktaş kitchen',
    tags=[cooking_tag],
    created_days_ago=505,
)
hs_tarhana, _ = simulate_handshake_workflow(
    tarhana_offer, yusuf,
    provider_initiated_days_ago=504,   # creation ~2 weeks before completion
    completed_days_ago=490,
)
print("  History 5: Tarhana from Scratch (Jan 2025) — completed as learner")

# ------------------------------------------------------------------
# History item 5b: Plant-Based Aegean Cooking
# Mar 2025 — Offer by Zeynep, Yusuf attended as learner
# ~425 days ago
# ------------------------------------------------------------------
aegean_offer = create_service(
    user=zeynep_demo,
    title='Plant-Based Aegean Cooking',
    description='Olive oil, greens, legumes: the Aegean pantry. We cook four dishes in one afternoon session. No meat, no fuss, just good food.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Beşiktaş, Istanbul',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0083'),
    max_participants=3,
    schedule_type='One-Time',
    schedule_details='Sunday afternoon cooking session',
    tags=[cooking_tag],
    created_days_ago=439,
)
hs_aegean, _ = simulate_handshake_workflow(
    aegean_offer, yusuf,
    provider_initiated_days_ago=439,
    completed_days_ago=425,
)
print("  History 5b: Plant-Based Aegean Cooking (Mar 2025) — completed as learner")

# ------------------------------------------------------------------
# History item 6: Bebek Park Picnic & Games
# May 2025 — Event by Berk, Yusuf attended
# ~355 days ago
# ------------------------------------------------------------------
picnic_hist = create_service(
    user=berk,
    title='Bebek Park Picnic & Games',
    description='A sunny afternoon by the Bosphorus with blankets, simple games, and the neighbours you haven\'t met yet. Bring something to share.',
    service_type='Event',
    duration='3.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0777'),
    location_lng=Decimal('28.9984'),
    max_participants=20,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(hours=8),
    schedule_details='Sunday at 13:00, Bebek Park seaside area',
    tags=[sports_tag],
    created_days_ago=365,
    status='Active',
)
hs_picnic = event_rsvp(picnic_hist, yusuf, joined_days_ago=360)
hs_picnic = EventHandshakeService.checkin(hs_picnic, yusuf)
hs_picnic = EventHandshakeService.mark_attended(hs_picnic, berk)
hs_picnic_emre = event_rsvp(picnic_hist, emre_demo, joined_days_ago=360)
hs_picnic_emre = EventHandshakeService.checkin(hs_picnic_emre, emre_demo)
EventHandshakeService.mark_attended(hs_picnic_emre, berk)
hs_picnic_zeynep = event_rsvp(picnic_hist, zeynep_demo, joined_days_ago=360)
hs_picnic_zeynep = EventHandshakeService.checkin(hs_picnic_zeynep, zeynep_demo)
EventHandshakeService.mark_attended(hs_picnic_zeynep, berk)
hs_picnic_yasemin = event_rsvp(picnic_hist, yasemin_demo, joined_days_ago=360)
hs_picnic_yasemin = EventHandshakeService.checkin(hs_picnic_yasemin, yasemin_demo)
EventHandshakeService.mark_attended(hs_picnic_yasemin, berk)
EventHandshakeService.complete_event(picnic_hist, berk)
backdate_completed_event(picnic_hist, days_ago=355)
hs_picnic.refresh_from_db()
print("  History 6: Bebek Park Picnic (May 2025) — attended")

# ------------------------------------------------------------------
# History item 7: Coffee & Finance: Smart Money Basics
# Sep 2025 — Offer by Yusuf, Leyla requested → Yusuf is provider
# ~240 days ago
# ------------------------------------------------------------------
coffee_finance = create_service(
    user=yusuf,
    title='Coffee & Finance: Smart Money Basics',
    description='Not a financial product, just a neighbour who works in risk and is happy to spend an hour over coffee explaining accounts, funds, and how to think about the long term.',
    service_type='Offer',
    duration='1.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Weekday evening in Bebek or Beşiktaş',
    tags=[finance_tag, education_tag],
    created_days_ago=260,
)
hs_finance, _ = simulate_handshake_workflow(
    coffee_finance, leyla,
    provider_initiated_days_ago=254,   # creation ~2 weeks before completion
    completed_days_ago=240,
)
print("  History 7: Coffee & Finance (Sep 2025) — completed as provider")

# ------------------------------------------------------------------
# History item 8: Early Morning Bosphorus Walk
# Feb 2026 — Event by Emre, Yusuf attended
# ~95 days ago
# ------------------------------------------------------------------
bosphorus_walk_hist = create_service(
    user=emre_demo,
    title='Early Morning Bosphorus Walk',
    description='A quiet sunrise walk along the Bosphorus shore. Good conversation, slow pace, no agenda. Meet at Bebek pier at 06:45.',
    service_type='Event',
    duration='1.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0777'),
    location_lng=Decimal('28.9984'),
    max_participants=10,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(hours=8),
    schedule_details='Sunrise, Bebek pier',
    tags=[sports_tag],
    created_days_ago=100,
    status='Active',
)
hs_walk = event_rsvp(bosphorus_walk_hist, yusuf, joined_days_ago=98)
hs_walk = EventHandshakeService.checkin(hs_walk, yusuf)
hs_walk = EventHandshakeService.mark_attended(hs_walk, emre_demo)
hs_walk_can = event_rsvp(bosphorus_walk_hist, can_demo, joined_days_ago=98)
hs_walk_can = EventHandshakeService.checkin(hs_walk_can, can_demo)
EventHandshakeService.mark_attended(hs_walk_can, emre_demo)
hs_walk_leyla = event_rsvp(bosphorus_walk_hist, leyla, joined_days_ago=98)
hs_walk_leyla = EventHandshakeService.checkin(hs_walk_leyla, leyla)
EventHandshakeService.mark_attended(hs_walk_leyla, emre_demo)
EventHandshakeService.complete_event(bosphorus_walk_hist, emre_demo)
backdate_completed_event(bosphorus_walk_hist, days_ago=95)
hs_walk.refresh_from_db()
print("  History 8: Early Morning Bosphorus Walk (Feb 2026) — attended")

yusuf.refresh_from_db()
print(f"  Yusuf's timebank balance after history: {yusuf.timebank_balance}h")


# ---------------------------------------------------------------------------
# [7] Reputation for Yusuf's history
# ---------------------------------------------------------------------------
print("\n[7/9] Adding reputation for Yusuf's completed exchanges...")

add_reputation(
    hs_driving, ahmet, yusuf, True, True, True,
    'Yusuf was focused and picked it up quickly. Easy to teach when someone actually wants to learn.',
)
add_reputation(
    hs_driving, yusuf, ahmet, True, True, True,
    'Ahmet was patient and clear. I drove a manual car home the same day.',
)
add_reputation(
    hs_photo, murat_demo, yusuf, True, True, True,
    'Yusuf already had a good eye, the walk just gave him a framework. Great student.',
)
add_reputation(
    hs_photo, yusuf, murat_demo, True, True, True,
    'Murat showed me how to see a street differently. The photographs from that morning are still some of my favourites.',
)
add_reputation(
    hs_tarhana, can_demo, yusuf, True, True, True,
    'Yusuf is a natural in the kitchen. He went home with a full jar and is already planning to make it again.',
)
add_reputation(
    hs_tarhana, yusuf, can_demo, True, True, True,
    'A Sunday afternoon in Can\'s kitchen making tarhana from scratch, exactly the kind of afternoon The Hive is for.',
)
add_reputation(
    hs_finance, leyla, yusuf, True, True, True,
    'Yusuf made personal finance feel approachable for the first time. Left knowing what to actually do next.',
)
add_reputation(
    hs_finance, yusuf, leyla, True, True, True,
    'Leyla asked sharp questions. A pleasure to explain things to someone genuinely curious.',
)

# ── Event evaluations (so history shows Reviewed, not Evaluation Pending) ────
add_reputation(hs_watch,  berk,       yusuf, True, True, True, 'Great energy at the match, glad he came.')
add_reputation(hs_watch,  yusuf,      berk,  True, True, True, 'Berk organises these brilliantly. Atmosphere was electric.',
               image_url='http://localhost:9010/hive-media/demo/history-watch-party.png')
add_reputation(hs_book,   selin_demo, yusuf, True, True, True, 'Yusuf always comes prepared and adds to the discussion.')
add_reputation(hs_book,   yusuf,      selin_demo, True, True, True, 'One of the best sessions in the series.',
               image_url='http://localhost:9010/hive-media/demo/history-book-circle.png')
add_reputation(hs_picnic, berk,       yusuf, True, True, True, 'Showed up early and helped set up. Exactly the kind of neighbour you want.')
add_reputation(hs_picnic, yusuf,      berk,  True, True, True, 'Perfect afternoon by the Bosphorus. Berk makes everyone feel at home.')
add_reputation(hs_walk,   emre_demo,  yusuf, True, True, True, 'Yusuf was great company at sunrise. Quiet, present, good conversation.')
add_reputation(hs_walk,   yusuf,      emre_demo, True, True, True, 'Emre picks the best spots. The light was perfect.',
               image_url='http://localhost:9010/hive-media/demo/history-bosphorus-walk.png')

# ── Other participants' reviews for past events ───────────────────────────────

# Watch Party reviews — each participant reviews via their own handshake
add_reputation(hs_watch_emre,  emre_demo,    berk,      True, True, True, 'Perfect night out. Berk had the best spot by the screen.')
add_reputation(hs_watch_can,   can_demo,     berk,      True, True, True, 'Loved it. The crowd made the match ten times better.')
add_reputation(hs_watch_murat, murat_demo,   berk,      True, True, True, 'Great organisation, great energy. Would join every time.')

# Book Circle reviews
add_reputation(hs_book_zeynep, zeynep_demo,  selin_demo, True, True, True, 'Selin keeps the conversation thoughtful and inclusive. A joy every session.')
add_reputation(hs_book_levent, levent_demo,  selin_demo, True, True, True, 'The best kind of Sunday afternoon. Kahneman never felt this enjoyable.')
add_reputation(hs_book_ayse,   ayse_demo,    selin_demo, True, True, True, 'Warm, well-prepared, always finds a way to bring everyone in.')
add_reputation(hs_book_murat,  murat_demo,   selin_demo, True, True, True, 'First time at a book circle and I am already signed up for the next.')

# Picnic reviews
add_reputation(hs_picnic_emre,    emre_demo,    berk,   True, True, True, 'One of those afternoons you remember. Berk makes it feel effortless.')
add_reputation(hs_picnic_zeynep,  zeynep_demo,  berk,   True, True, True, 'Good food, good people, perfect weather. Really well organised.')
add_reputation(hs_picnic_yasemin, yasemin_demo, berk,   True, True, True, 'Felt like a real neighbourhood. Glad I came.')

# Bosphorus Walk reviews
add_reputation(hs_walk_can,   can_demo,  emre_demo, True, True, True, 'The silence of the city at that hour is something else. Emre picked the perfect route.')
add_reputation(hs_walk_leyla, leyla,     emre_demo, True, True, True, 'Calm, unhurried, beautiful. Exactly what I needed.')

print("  Other participants' reviews added for past events")

# ── Reputation reps from Yusuf's event attendances ───────────────────────────
# Events don't create bilateral reputation records automatically, so we add
# direct positive reps referencing hs_finance (the only bilateral handshake
# convenient to anchor to). These represent community recognition accumulated
# over 3 years of participation — distributed across the timeline.
event_rep_data = [
    (ayse_demo,   now - timedelta(days=950),  'Punctual, thoughtful, always adds something real.'),
    (selin_demo,  now - timedelta(days=800),  'Yusuf brought warmth to every session he joined.'),
    (berk,        now - timedelta(days=700),  'Reliable neighbour. Shows up when he says he will.'),
    (emre_demo,   now - timedelta(days=600),  'Easy to organise with. Always on time, prepared.'),
    (can_demo,    now - timedelta(days=500),  'A genuine community member who makes others feel welcome.'),
    (zeynep_demo, now - timedelta(days=400),  'Reliable, thoughtful, and always present.'),
    (levent_demo, now - timedelta(days=300),  'Warm and engaged, good to have at any gathering.'),
    (yasemin_demo,now - timedelta(days=200),  'Shows up, participates, and lifts the room.'),
    (murat_demo,  now - timedelta(days=150),  'Patient and helpful, happy to learn at the right pace.'),
    (burak_demo,  now - timedelta(days=100),  'Consistent and kind throughout the exchange.'),
    (elif_demo,   now - timedelta(days=50),   'A natural teacher who made the session feel easy.'),
]
for giver, when, comment in event_rep_data:
    ReputationRep.objects.create(
        handshake=hs_finance,
        giver=giver,
        receiver=yusuf,
        is_punctual=True,
        is_helpful=True,
        is_kind=True,
        comment=comment,
        created_at=when,
    )
print(f"  Added {len(event_rep_data)} community reputation records")

# ── Time Giver Bronze: needs hours_given >= 10 ───────────────────────────────
# Yusuf earned 1h from Coffee & Finance. We add direct TransactionHistory
# records for earlier provider sessions that are part of his 3-year history
# but not narrated individually in the scenario (pre-history giving).
giving_entries = [
    (now - timedelta(days=900), Decimal('2.0'), 'Photography advice session, Bosphorus walk companion'),
    (now - timedelta(days=750), Decimal('1.5'), 'Personal finance Q&A, neighbour coffee chat'),
    (now - timedelta(days=580), Decimal('2.0'), 'Insurance basics for a freelance neighbour'),
    (now - timedelta(days=310), Decimal('1.5'), 'Budgeting session for a young colleague'),
    (now - timedelta(days=160), Decimal('2.0'), 'Cooking session, Aegean recipes shared with a neighbour'),
]
for when, amount, description in giving_entries:
    TransactionHistory.objects.create(
        user=yusuf,
        transaction_type='transfer',
        amount=amount,
        description=description,
        created_at=when,
        balance_after=Decimal('0'),  # not load-bearing for badge logic
    )
print(f"  Added {len(giving_entries)} historical giving records (hours_given)")

check_and_assign_badges(yusuf)
yusuf.refresh_from_db()
print(f"  Badges checked for Yusuf (karma={yusuf.karma_score})")

# ---------------------------------------------------------------------------
# [8] Active services for Pulse page
# ---------------------------------------------------------------------------
print("\n[8/9] Creating active services for Pulse page...")

# ── Mother's Day Photo Morning — the live QR event (Scene 3) ────────────────
# scheduled_time = now so the event is happening right now (check-in window is open)
brunch_time = now + timedelta(minutes=15)  # starting imminently — check-in window open
spring_brunch = create_service(
    user=yusuf,
    title="Mother's Day Photo Morning: Print and Post from Bebek Park",
    description="I'm bringing my portable photo printer to Bebek Park. If your mum lives in another city or another country, come with your phone, pick your favourite photo together, and we'll print it and write a postcard on the spot. I'll have envelopes and stamps. Free to join, no skills needed. Just show up and bring a photo you love.",
    service_type='Event',
    duration='3.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0777'),
    location_lng=Decimal('28.9984'),
    max_participants=5,
    schedule_type='One-Time',
    scheduled_time=brunch_time,
    schedule_details="Today at 11:00, Bebek Park seaside, look for the portable printer and the blue blanket",
    tags=[photography_tag],
    created_days_ago=5,
    requires_qr_checkin=True,
    cover_url='http://localhost:9010/hive-media/demo/mothers-day-event.png',
)

# RSVP 3 existing users = 3/5 registered
# Selman will RSVP live during the presentation (Scene 3)
cem_demo = User.objects.get(email='cem@demo.com')
brunch_rsvp_users = [ayse_demo, can_demo, cem_demo]
for i, user in enumerate(brunch_rsvp_users):
    event_rsvp(spring_brunch, user, joined_days_ago=4 - (i % 4))

spring_brunch.refresh_from_db()
rsvp_count = Handshake.objects.filter(
    service=spring_brunch,
    status__in=['accepted', 'checked_in', 'attended'],
).count()
print(f"  Mother's Day Photo Morning: {rsvp_count}/5 registered (QR check-in enabled)")

# ── Türkiye Match Night — Watch Party at Kuruçeşme (active, upcoming) ───────
watch_party_live = create_service(
    user=berk,
    title='Türkiye Match Night: Watch Party at Kuruçeşme',
    description='UEFA qualifier night. Outdoor screen by the Bosphorus at Kuruçeşme. Come early for a good spot, this one fills up fast.',
    service_type='Event',
    duration='2.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0612'),
    location_lng=Decimal('29.0280'),
    max_participants=40,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=4, hours=3),
    schedule_details='Saturday at 21:00, Kuruçeşme outdoor screen',
    tags=[sports_tag],
    created_days_ago=3,
)
# Seed 6 RSVPs so it looks populated (34/40 is narrative; we show enough for a capacity bar)
for user in [elif_demo, can_demo, emre_demo, murat_demo, deniz_demo, leyla]:
    event_rsvp(watch_party_live, user, joined_days_ago=2)
print(f"  Watch Party live: active")

# ── Book Circle: Hızlı ve Yavaş Düşünme — active session ───────────────────
book_circle_live = create_service(
    user=selin_demo,
    title='Book Circle: Hızlı ve Yavaş Düşünme, Session 5',
    description='This week we continue with Kahneman, chapters on the availability heuristic and what it means for everyday decisions. Come with one story where your intuition was wrong.',
    service_type='Event',
    duration='2.00',
    location_type='In-Person',
    location_area='Beyoğlu',
    location_lat=Decimal('41.0320'),
    location_lng=Decimal('28.9740'),
    max_participants=12,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=6, hours=2),
    schedule_details='Sunday at 15:00, Cihangir',
    tags=[language_tag, education_tag],
    created_days_ago=4,
)
for user in [ayse_demo, zeynep_demo, yasemin_demo, emre_demo, can_demo, murat_demo, levent_demo]:
    event_rsvp(book_circle_live, user, joined_days_ago=3)
print(f"  Book Circle live: 7/12 registered")

# ── Friday Night LOL: 5v5 Casual Ranked ─────────────────────────────────────
lol_event = create_service(
    user=kaan,
    title='Friday Night LOL: 5v5 Casual Ranked, Online',
    description='A relaxed 5v5 evening for people who want to play together without the pressure of solo queue. Discord voice, no flame, good vibes. All ranks welcome.',
    service_type='Event',
    duration='3.00',
    location_type='Online',
    max_participants=10,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=1, hours=5),
    schedule_details='Friday at 21:00 online, join Discord link sent after RSVP',
    tags=[technology_tag],
    created_days_ago=2,
)
for user in [deniz_demo, burak_demo, elif_demo, emre_demo, can_demo, murat_demo, berk, leyla]:
    event_rsvp(lol_event, user, joined_days_ago=1)
print(f"  LOL Event: 8/10 registered")

# ── High School Maths Help — Selman's offer ──────────────────────────────────
selman_tutoring = create_service(
    user=selman,
    title='High School Maths Help: Algebra, Geometry and Exams',
    description='I help high school students with maths: algebra, geometry, trigonometry, exam prep. Patient explanations, lots of practice problems. Beşiktaş or online. No question is too basic!',
    service_type='Offer',
    duration='1.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Weekends preferred, flexible timing',
    tags=[education_tag],
    created_days_ago=1,
)
print(f"  Selman's maths tutoring: active")

# ── Basic Home Cooking — Selman's Need ───────────────────────────────────────
selman_cooking_need = create_service(
    user=selman,
    title='Teach Me to Cook: Simple Home Recipes for Beginners',
    description='I have lived on takeaway for too long. Looking for someone patient to show me 3–4 simple, healthy recipes I can actually repeat on my own. Beşiktaş kitchen or yours.',
    service_type='Need',
    duration='2.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Weekend afternoon, happy to travel nearby',
    tags=[cooking_tag, education_tag],
    created_days_ago=1,
)
print(f"  Selman's cooking need: active")

# ── Beginner Guitar Lessons ──────────────────────────────────────────────────
guitar_lessons = create_service(
    user=deniz_demo,
    title='Beginner Guitar Lessons',
    description='Gentle introduction to guitar: tuning, basic chords, a first song. No experience needed, just enthusiasm. Bebek area, my flat.',
    service_type='Offer',
    duration='1.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0777'),
    location_lng=Decimal('28.9984'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Weekends, Bebek area',
    tags=[education_tag],
    created_days_ago=3,
)
print(f"  Guitar lessons: active")

# ── Botanical Watercolour for Beginners (Ayşe) ──────────────────────────────
watercolour_live = create_service(
    user=ayse_demo,
    title='Botanical Watercolour for Beginners',
    description='A calm afternoon with watercolours, botanical subjects, and no pressure. We will mix colours, practice basic washes, and each create one postcard-sized piece.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Üsküdar',
    location_lat=Decimal('41.0214'),
    location_lng=Decimal('29.0125'),
    max_participants=4,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=8, hours=1),
    schedule_details='Next Sunday at 13:00, Üsküdar community space',
    tags=[art_tag],
    created_days_ago=6,
)
print(f"  Botanical Watercolour: active")

# ── Budget Meal Prep for Students (Zeynep, Nearby lane) ─────────────────────
meal_prep = create_service(
    user=zeynep_demo,
    title='Budget Meal Prep for Students, Beşiktaş',
    description='Plan a week of healthy, affordable meals in two hours. I share my shopping list strategy, prep routine, and five reliable recipes that scale easily.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0480'),
    location_lng=Decimal('29.0090'),
    max_participants=3,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=5),
    schedule_details='Saturday morning, Beşiktaş kitchen',
    tags=[cooking_tag, education_tag],
    created_days_ago=2,
)
print(f"  Budget Meal Prep: active")

# ---------------------------------------------------------------------------
# Re-backdate all completed handshakes
# auto_now=True on Handshake.updated_at means any .save() after our .update()
# (badges, signals, hot-score recalc) resets it to now. Do a final bulk fix.
# ---------------------------------------------------------------------------
backdate_map = [
    (watch_party_hist,     1065),
    (sourdough_offer,      1000),
    (driving_need,          930),
    (balat_photo,           775),
    (book_circle_hist,      640),
    (tarhana_offer,         490),
    (aegean_offer,          425),
    (picnic_hist,           355),
    (coffee_finance,        240),
    (bosphorus_walk_hist,    95),
]
for svc, days_ago in backdate_map:
    completion_time = now - timedelta(days=days_ago)
    Handshake.objects.filter(
        service=svc,
        status__in=['completed', 'attended'],
    ).update(updated_at=completion_time, scheduled_time=completion_time - timedelta(hours=2))
    # Service.updated_at also has auto_now=True; the calendar uses it for completed services
    Service.objects.filter(pk=svc.pk).update(updated_at=completion_time)
print("  Completed handshakes + services re-backdated (auto_now override)")

# ---------------------------------------------------------------------------
# [9] Final summary
# ---------------------------------------------------------------------------
print("\n[9/9] Summary")
yusuf.refresh_from_db()
selman.refresh_from_db()
print(f"  Yusuf balance: {yusuf.timebank_balance}h, karma: {yusuf.karma_score}")
print(f"  Yusuf badges: {', '.join(UserBadge.objects.filter(user=yusuf).values_list('badge__name', flat=True)) or 'none yet'}")
print(f"  Selman balance: {selman.timebank_balance}h, onboarded: {selman.is_onboarded}")
print(f"  Mother's Day Photo Morning RSVPs: {Handshake.objects.filter(service=spring_brunch, status__in=['accepted', 'checked_in', 'attended']).count()}/5 (Selman joins live in Scene 3)")

print("\n" + "=" * 60)
print("Mother's Day seed complete.")
print("Login: yusuf@demo.com / demo123")
print("Login: selman@demo.com / demo123")
print("=" * 60)
