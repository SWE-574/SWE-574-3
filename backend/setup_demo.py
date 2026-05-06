#!/usr/bin/env python
"""
Enhanced demo setup script for The Hive
Creates authentic demo data with Turkish users, realistic services, and proper system workflows
"""
import os
import django

if __name__ == "__main__":
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hive_project.settings')
    django.setup()

from api.models import (
    ChatMessage, Handshake, Notification, ReputationRep, Comment,
    Service, Tag, User, UserBadge, ForumCategory, ForumTopic, ForumPost,
    Report, AdminAuditLog, ServiceMedia, PublicChatMessage, TransactionHistory,
    ServiceGroupChatMessage, NegativeRep, UserFollow,
)
from api.achievement_utils import check_and_assign_badges
from api.services import HandshakeService, EventHandshakeService, EventEvaluationService
from api.utils import (
    provision_timebank, complete_timebank_transfer, cancel_timebank_transfer,
    get_provider_and_receiver, create_notification,
)
from django.contrib.auth.hashers import make_password
from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta
from urllib.parse import quote
import random

print("=" * 60)
print("The Hive - Enhanced Demo Data Setup")
print("=" * 60)

print("\n[1/8] Cleaning up existing demo data...")

demo_emails = [
    'elif@demo.com', 'cem@demo.com', 'ayse@demo.com',
    'mehmet@demo.com', 'zeynep@demo.com', 'can@demo.com',
    'deniz@demo.com', 'burak@demo.com', 'selin@demo.com',
    'emre@demo.com', 'yasemin@demo.com', 'murat@demo.com',
    'levent@demo.com'
]

demo_users = User.objects.filter(email__in=demo_emails)
if demo_users.exists():
    print(f"  Removing data for {demo_users.count()} demo users...")
    user_ids = list(demo_users.values_list('id', flat=True))
    ServiceMedia.objects.filter(service__user_id__in=user_ids).delete()
    Service.objects.filter(user_id__in=user_ids).delete()
    Handshake.objects.filter(Q(requester_id__in=user_ids) | Q(service__user_id__in=user_ids)).delete()
    Notification.objects.filter(user_id__in=user_ids).delete()
    ReputationRep.objects.filter(Q(giver_id__in=user_ids) | Q(receiver_id__in=user_ids)).delete()
    UserBadge.objects.filter(user_id__in=user_ids).delete()
    Comment.objects.filter(user_id__in=user_ids).delete()
    ForumTopic.objects.filter(author_id__in=user_ids).delete()
    ForumPost.objects.filter(author_id__in=user_ids).delete()
    ChatMessage.objects.filter(sender_id__in=user_ids).delete()
    Report.objects.filter(Q(reporter_id__in=user_ids) | Q(reported_user_id__in=user_ids)).delete()
    UserFollow.objects.filter(Q(follower_id__in=user_ids) | Q(following_id__in=user_ids)).delete()
    demo_users.delete()

orphaned_handshakes = Handshake.objects.filter(service__isnull=True)
if orphaned_handshakes.exists():
    orphaned_handshakes.delete()

orphaned_messages = ChatMessage.objects.filter(handshake__isnull=True)
if orphaned_messages.exists():
    orphaned_messages.delete()

print("  Done")

print("\n[2/8] Creating tags...")

tags_data = [
    {'id': 'Q8476', 'name': 'Cooking'},
    {'id': 'Q11424', 'name': 'Music'},
    {'id': 'Q11461', 'name': 'Sports'},
    {'id': 'Q11019', 'name': 'Art'},
    {'id': 'Q2013', 'name': 'Language'},
    {'id': 'Q11467', 'name': 'Gardening'},
    {'id': 'Q11466', 'name': 'Technology'},
    {'id': 'Q11465', 'name': 'Education'},
    {'id': 'Q7186', 'name': 'Chess'},
    {'id': 'Q11631', 'name': 'Photography'},
]

created_count = 0
for tag_data in tags_data:
    try:
        Tag.objects.get(name=tag_data['name'])
    except Tag.DoesNotExist:
        try:
            Tag.objects.get(id=tag_data['id'])
        except Tag.DoesNotExist:
            Tag.objects.create(id=tag_data['id'], name=tag_data['name'])
            created_count += 1

print(f"  Processed {len(tags_data)} tags ({created_count} created)")

print("\n[3/8] Creating demo users with Turkish names...")

CURATED_AVATARS = {
    'elif':       'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'cem':        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'ayse':       'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'mehmet':     'https://images.unsplash.com/photo-1552058544-f2b08422138a?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'zeynep':     'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'can':        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'deniz':      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'burak':      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'selin':      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'emre':       'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'yasemin':    'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'murat':      'https://images.unsplash.com/photo-1504257432389-52343af06ae3?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'levent':     'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'moderator':  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
    'superadmin': 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&crop=face&w=256&h=256&q=80',
}


def dicebear_avatar(seed):
    return CURATED_AVATARS.get(seed, f"https://api.dicebear.com/9.x/avataaars/png?seed={seed}")


def picsum_image(seed, width, height):
    return f"https://picsum.photos/seed/{seed}/{width}/{height}"


CURATED_MEDIA_LIBRARY = {
    'cooking': [
        'https://images.unsplash.com/photo-1556910103-1c02745aae4d',
        'https://images.unsplash.com/photo-1466637574441-749b8f19452f',
        'https://images.unsplash.com/photo-1507048331197-7d4ac70811cf',
        'https://images.unsplash.com/photo-1528712306091-ed0763094c98',
    ],
    'coffee': [
        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085',
        'https://images.unsplash.com/photo-1514432324607-a09d9b4aefda',
        'https://images.unsplash.com/photo-1442512595331-e89e73853f31',
    ],
    'music': [
        'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
        'https://images.unsplash.com/photo-1507838153414-b4b713384a76',
        'https://images.unsplash.com/photo-1524650359799-842906ca1c06',
        'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212',
    ],
    'books': [
        'https://images.unsplash.com/photo-1481627834876-b7833e8f5570',
        'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f',
        'https://images.unsplash.com/photo-1512820790803-83ca734da794',
    ],
    'conversation': [
        'https://images.unsplash.com/photo-1529156069898-49953e39b3ac',
        'https://images.unsplash.com/photo-1521737711867-e3b97375f902',
        'https://images.unsplash.com/photo-1543269865-cbf427effbad',
    ],
    'history': [
        'https://images.unsplash.com/photo-1461360370896-922624d12a74',
        'https://images.unsplash.com/photo-1524492412937-b28074a5d7da',
        'https://images.unsplash.com/photo-1553708881-112abc53fe54',
    ],
    'garden': [
        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b',
        'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae',
        'https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e',
        'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2',
    ],
    'art': [
        'https://images.unsplash.com/photo-1513364776144-60967b0f800f',
        'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b',
        'https://images.unsplash.com/photo-1452860606245-08b6390b1e23',
    ],
    'photography': [
        'https://images.unsplash.com/photo-1542038784456-1ea8e935640e',
        'https://images.unsplash.com/photo-1554080353-a576cf803bda',
        'https://images.unsplash.com/photo-1452587925148-ce544e77e70d',
    ],
    'walk': [
        'https://images.unsplash.com/photo-1501785888041-af3ef285b470',
        'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1',
        'https://images.unsplash.com/photo-1506929562872-bb421503ef21',
    ],
    'chess': [
        'https://images.unsplash.com/photo-1529699211952-734e80c4d42b',
        'https://images.unsplash.com/photo-1560174038-da43ac74f01b',
        'https://images.unsplash.com/photo-1586165368502-1bad197a6461',
    ],
    'technology': [
        'https://images.unsplash.com/photo-1531297484001-80022131f5a1',
        'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b',
        'https://images.unsplash.com/photo-1519389950473-47ba0277781c',
    ],
    'community': [
        'https://images.unsplash.com/photo-1511632765486-a01980e01a18',
        'https://images.unsplash.com/photo-1529156069898-49953e39b3ac',
        'https://images.unsplash.com/photo-1517457373958-b7bdd4587205',
        'https://images.unsplash.com/photo-1559027615-cd4628902d4a',
    ],
    'crafts': [
        'https://images.unsplash.com/photo-1452860606245-08b6390b1e23',
        'https://images.unsplash.com/photo-1513364776144-60967b0f800f',
        'https://images.unsplash.com/photo-1558618666-fcd25c85f82e',
    ],
    'storytelling': [
        'https://images.unsplash.com/photo-1529156069898-49953e39b3ac',
        'https://images.unsplash.com/photo-1517457373958-b7bdd4587205',
        'https://images.unsplash.com/photo-1491438590914-bc09fcaaf77a',
    ],
    'wellness': [
        'https://images.unsplash.com/photo-1506126613408-eca07ce68773',
        'https://images.unsplash.com/photo-1545205597-3d9d02c29597',
        'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b',
    ],
    'neighborhood': [
        'https://images.unsplash.com/photo-1559027615-cd4628902d4a',
        'https://images.unsplash.com/photo-1517457373958-b7bdd4587205',
        'https://images.unsplash.com/photo-1511632765486-a01980e01a18',
    ],
    'repair': [
        'https://images.unsplash.com/photo-1530124566582-a45a7e3f3526',
        'https://images.unsplash.com/photo-1558618666-fcd25c85f82e',
        'https://images.unsplash.com/photo-1581092160562-40aa08e78837',
    ],
    'nature': [
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e',
        'https://images.unsplash.com/photo-1501854140801-50d01698950b',
        'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05',
    ],
    'cinema': [
        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba',
        'https://images.unsplash.com/photo-1478720568477-152d9b164e26',
        'https://images.unsplash.com/photo-1440404653325-ab127d49abc1',
    ],
    'vinyl': [
        'https://images.unsplash.com/photo-1539375665275-f9de415ef9ac',
        'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
        'https://images.unsplash.com/photo-1507838153414-b4b713384a76',
    ],
    'potluck': [
        'https://images.unsplash.com/photo-1528605248644-14dd04022da1',
        'https://images.unsplash.com/photo-1556910103-1c02745aae4d',
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0',
    ],
    'zine': [
        'https://images.unsplash.com/photo-1513364776144-60967b0f800f',
        'https://images.unsplash.com/photo-1554080353-a576cf803bda',
        'https://images.unsplash.com/photo-1542038784456-1ea8e935640e',
    ],
}


SEMANTIC_MEDIA_OVERRIDES = [
    (('manti', 'börek', 'shared meal', 'recipe', 'kitchen', 'cooking'), 'cooking'),
    (('potluck', 'dinner under the stars', 'communal dinner'), 'potluck'),
    (('turkish coffee', 'coffee ritual', 'coffee', 'cafe'), 'coffee'),
    (('singalong', 'acoustic', 'guitar', 'song', 'music', 'lyrics', 'open mic'), 'music'),
    (('vinyl', 'record', 'listening session', 'turntable'), 'vinyl'),
    (('reading circle', 'reading', 'book club', 'book', 'poem', 'library', 'book exchange'), 'books'),
    (('language exchange', 'conversation exchange', 'conversation hour', 'language', 'welcome guide', 'french', 'english practice'), 'conversation'),
    (('family archive', 'genealogy', 'history', 'story', 'museum', 'memory', 'oral history'), 'history'),
    (('garden', 'gardening', 'plant', 'balcony', 'flowers', 'composting', 'compost'), 'garden'),
    (('watercolor', 'painting', 'postcard', 'art', 'illustration'), 'art'),
    (('knitting', 'crochet', 'sewing', 'mending', 'crafts', 'handmade', 'weaving'), 'crafts'),
    (('repair', 'mending cafe', 'upcycling', 'fix'), 'repair'),
    (('photo walk', 'photography', 'camera', 'zine'), 'photography'),
    (('walk', 'walking', 'ferry', 'orientation', 'neighborhood', 'sunrise', 'walking buddy'), 'walk'),
    (('jog', 'jogging', 'running'), 'walk'),
    (('chess', 'board game', 'board-game', 'game night', 'study session'), 'chess'),
    (('smartphone', 'phone basics', 'digital', 'app', 'tech', 'presentation'), 'technology'),
    (('meditation', 'mindfulness', 'breathing', 'wellness', 'yoga', 'stretching'), 'wellness'),
    (('storytelling', 'oral tradition', 'narrative'), 'storytelling'),
    (('film', 'cinema', 'movie', 'screening', 'documentary'), 'cinema'),
    (('birdwatching', 'nature', 'park', 'trees', 'wildlife'), 'nature'),
    (('community', 'gathering', 'meetup', 'event', 'neighbors'), 'community'),
]


def curated_unsplash_image(base_url, width, height):
    return (
        f"{base_url}?auto=format&fit=crop&crop=entropy"
        f"&w={width}&h={height}&q=80"
    )


def semantic_media_theme(text):
    normalized = text.lower()
    for keywords, theme in SEMANTIC_MEDIA_OVERRIDES:
        if any(keyword in normalized for keyword in keywords):
            return theme
    return 'community'


def semantic_media_urls(text):
    theme = semantic_media_theme(text)
    return CURATED_MEDIA_LIBRARY.get(theme, CURATED_MEDIA_LIBRARY['community'])


def text_rotation_seed(text):
    return sum(ord(char) for char in text.lower())


def semantic_service_image(service, width=800, height=600):
    text = f"{service.title} {service.description}"
    urls = semantic_media_urls(text)
    return curated_unsplash_image(urls[text_rotation_seed(text) % len(urls)], width, height)


def semantic_gallery_images(text, count, width=800, height=600, start_offset=0):
    urls = semantic_media_urls(text)
    base_index = text_rotation_seed(text) + start_offset
    return [
        curated_unsplash_image(urls[(base_index + index) % len(urls)], width, height)
        for index in range(count)
    ]


def semantic_banner_image(text, width=1200, height=400, start_offset=40):
    urls = semantic_media_urls(text)
    return curated_unsplash_image(
        urls[(text_rotation_seed(text) + start_offset) % len(urls)],
        width,
        height,
    )


def is_fixed_group_offer(service):
    return (
        service.type == 'Offer'
        and service.schedule_type == 'One-Time'
        and service.max_participants > 1
    )


FIXED_GROUP_AREA_ADDRESSES = {
    'Beşiktaş': 'Sinanpaşa Mahallesi, Şair Nedim Caddesi No: 28, Beşiktaş, İstanbul, Türkiye',
    'Kadıköy': 'Caferağa Mahallesi, Moda Caddesi No: 185, Kadıköy, İstanbul, Türkiye',
    'Üsküdar': 'Mimar Sinan Mahallesi, Hakimiyeti Milliye Caddesi No: 27, Üsküdar, İstanbul, Türkiye',
    'Fatih': 'Balat Mahallesi, Vodina Caddesi No: 64, Fatih, İstanbul, Türkiye',
    'Beyoğlu': 'Cihangir Mahallesi, Sıraselviler Caddesi No: 114, Beyoğlu, İstanbul, Türkiye',
    'Şişli': 'Teşvikiye Mahallesi, Hüsrev Gerede Caddesi No: 92, Şişli, İstanbul, Türkiye',
}


def build_google_maps_url(address, lat=None, lng=None):
    if lat is not None and lng is not None:
        return f"https://www.google.com/maps?q={float(lat)},{float(lng)}"
    return f"https://www.google.com/maps/search/?api=1&query={quote(address or '')}"


def fixed_group_location_guide(service):
    title = service.title.lower()
    if 'manti' in title:
        return 'Veterinerin olduğu bina, 2. kat topluluk mutfağı'
    if 'börek' in title or 'borek' in title:
        return 'Fırının yanındaki apartman, arka bahçeden giriş'
    if 'garden' in title or 'balcony' in title:
        return 'Yeşil tente olan apartman, çatı terası'
    if 'photo walk' in title or 'photography' in title or 'walk' in title:
        return 'İskele karşısındaki saat kulesinin önü'
    if 'coffee' in title:
        return 'Veterinerin olduğu bina, girişte soldaki salon'
    if 'board game' in title or 'board-game' in title:
        return 'Kırtasiyenin üstündeki bina, zil 3'
    return 'Veterinerin olduğu bina'


def apply_fixed_group_offer_seed_details(service):
    if not is_fixed_group_offer(service) or service.location_type != 'In-Person':
        return

    exact_address = FIXED_GROUP_AREA_ADDRESSES.get(
        service.location_area,
        f"{service.location_area or 'İstanbul'}, İstanbul, Türkiye",
    )
    service.session_exact_location = exact_address
    service.session_exact_location_lat = service.location_lat
    service.session_exact_location_lng = service.location_lng
    service.session_location_guide = fixed_group_location_guide(service)
    service.save(update_fields=[
        'session_exact_location',
        'session_exact_location_lat',
        'session_exact_location_lng',
        'session_location_guide',
    ])


def create_or_update_user(
    email,
    first_name,
    last_name,
    bio,
    balance,
    karma,
    date_joined_offset_days=0,
    avatar_url=None,
    banner_url=None,
    location=None,
):
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            'password': make_password('demo123'),
            'first_name': first_name,
            'last_name': last_name,
            'bio': bio,
            'avatar_url': avatar_url,
            'banner_url': banner_url,
            'location': location,
            'timebank_balance': balance,
            'karma_score': karma,
            'role': 'member',
            'is_verified': True,
            'is_onboarded': True,
            'date_joined': timezone.now() - timedelta(days=date_joined_offset_days),
        }
    )
    if not created:
        user.timebank_balance = balance
        user.karma_score = karma
        user.first_name = first_name
        user.last_name = last_name
        user.bio = bio
        user.avatar_url = avatar_url
        user.banner_url = banner_url
        user.location = location
        user.is_verified = True
        user.is_onboarded = True
        user.set_password('demo123')
        if date_joined_offset_days > 0:
            user.date_joined = timezone.now() - timedelta(days=date_joined_offset_days)
        user.save()
    print(f"  {'Created' if created else 'Updated'}: {email} ({first_name} {last_name}, Balance: {balance}h, Karma: {karma})")
    return user

elif_user = create_or_update_user(
    'elif@demo.com', 'Elif', 'Yılmaz',
    'Freelance designer and cooking enthusiast living in Beşiktaş. I love hosting neighbor-friendly food circles and sharing practical kitchen skills people can reuse at home.',
    Decimal('7.00'), 35, date_joined_offset_days=180,
    avatar_url=dicebear_avatar('elif'),
    banner_url=semantic_banner_image('community cooking kitchen gathering'),
    location='Beşiktaş, Istanbul',
)

cem = create_or_update_user(
    'cem@demo.com', 'Cem', 'Demir',
    'University student in Kadıköy passionate about chess and genealogy research. Always happy to teach beginners and help trace family histories!',
    Decimal('4.00'), 18, date_joined_offset_days=120,
    avatar_url=dicebear_avatar('cem'),
    banner_url=semantic_banner_image('chess books quiet learning'),
    location='Kadıköy, Istanbul',
)

ayse = create_or_update_user(
    'ayse@demo.com', 'Ayşe', 'Kaya',
    'Gardening enthusiast and community organizer in Üsküdar. Passionate about sustainable living and urban farming. Love sharing knowledge about growing food in small spaces!',
    Decimal('7.00'), 42, date_joined_offset_days=260,
    avatar_url=dicebear_avatar('ayse'),
    banner_url=semantic_banner_image('garden plants balcony workshop'),
    location='Üsküdar, Istanbul',
)

mehmet = create_or_update_user(
    'mehmet@demo.com', 'Mehmet', 'Özkan',
    'Retired teacher living in Şişli. I help neighbors navigate family archives, local history, and everyday digital tasks with patience and care.',
    Decimal('9.00'), 55, date_joined_offset_days=430,
    avatar_url=dicebear_avatar('mehmet'),
    banner_url=semantic_banner_image('history books archive storytelling'),
    location='Şişli, Istanbul',
)

zeynep = create_or_update_user(
    'zeynep@demo.com', 'Zeynep', 'Arslan',
    'Language teacher and cultural exchange enthusiast. Fluent in Turkish, English, and French. Love connecting people through language and helping others practice conversation in a friendly, relaxed setting.',
    Decimal('9.00'), 68, date_joined_offset_days=370,
    avatar_url=dicebear_avatar('zeynep'),
    banner_url=semantic_banner_image('language exchange people conversation'),
    location='Beyoğlu, Istanbul',
)

can = create_or_update_user(
    'can@demo.com', 'Can', 'Şahin',
    'Photography hobbyist based in Beşiktaş. I enjoy community photo walks, documenting neighborhood stories, and helping others feel confident behind the camera.',
    Decimal('6.00'), 28, date_joined_offset_days=25,
    avatar_url=dicebear_avatar('can'),
    banner_url=semantic_banner_image('street photography city stories'),
    location='Beşiktaş, Istanbul',
)

deniz = create_or_update_user(
    'deniz@demo.com', 'Deniz', 'Aydın',
    'Tech-savvy professional in Kadıköy. Enjoy helping others with smartphones, apps, and basic tech troubleshooting. Patient teacher for all skill levels!',
    Decimal('5.00'), 22, date_joined_offset_days=80,
    avatar_url=dicebear_avatar('deniz'),
    banner_url=semantic_banner_image('technology community help people'),
    location='Kadıköy, Istanbul',
)

burak = create_or_update_user(
    'burak@demo.com', 'Burak', 'Kurt',
    'Chess player and music lover. I like low-pressure skill swaps, practice sessions, and small group meetups where everyone leaves having learned something useful.',
    Decimal('5.00'), 15, date_joined_offset_days=95,
    avatar_url=dicebear_avatar('burak'),
    banner_url=semantic_banner_image('music chess community evening'),
    location='Kadıköy, Istanbul',
)

selin = create_or_update_user(
    'selin@demo.com', 'Selin', 'Aksoy',
    'Long-time community host in Cihangir who loves reading circles, quiet neighborhood gatherings, and helping newcomers feel included without pressure.',
    Decimal('8.00'), 74, date_joined_offset_days=540,
    avatar_url=dicebear_avatar('selin'),
    banner_url=semantic_banner_image('books quiet community gathering'),
    location='Beyoğlu, Istanbul',
)

emre = create_or_update_user(
    'emre@demo.com', 'Emre', 'Taş',
    'Urban walker and civic-minded neighbor who enjoys ferry routes, local history, and helping new residents feel more at home in the city.',
    Decimal('6.00'), 31, date_joined_offset_days=220,
    avatar_url=dicebear_avatar('emre'),
    banner_url=semantic_banner_image('city ferry neighborhood walk'),
    location='Üsküdar, Istanbul',
)

yasemin = create_or_update_user(
    'yasemin@demo.com', 'Yasemin', 'Ergin',
    'Parent, kitchen volunteer, and storyteller who loves gathering people around coffee, handwritten recipes, and warm community rituals.',
    Decimal('8.00'), 63, date_joined_offset_days=300,
    avatar_url=dicebear_avatar('yasemin'),
    banner_url=semantic_banner_image('coffee recipe storytelling kitchen'),
    location='Fatih, Istanbul',
)

murat = create_or_update_user(
    'murat@demo.com', 'Murat', 'Sezer',
    'Recently moved to Istanbul for remote work and is using The Hive to find low-pressure ways to meet people through board games, study sessions, and neighborhood routines.',
    Decimal('7.00'), 11, date_joined_offset_days=45,
    avatar_url=dicebear_avatar('murat'),
    banner_url=semantic_banner_image('board games study session city'),
    location='Kadıköy, Istanbul',
)

levent = create_or_update_user(
    'levent@demo.com', 'Levent', 'Yalçın',
    'Retired musician who enjoys acoustic singalongs, museum mornings, and gentle intergenerational meetups where everyone participates a little.',
    Decimal('7.00'), 58, date_joined_offset_days=620,
    avatar_url=dicebear_avatar('levent'),
    banner_url=semantic_banner_image('music museum conversation community'),
    location='Beyoğlu, Istanbul',
)

all_users = [elif_user, cem, ayse, mehmet, zeynep, can, deniz, burak, selin, emre, yasemin, murat, levent]

print("\n[3b/8] Creating social follow graph...")

def follow(follower, following):
    UserFollow.objects.get_or_create(follower=follower, following=following)

# Elif (main demo user) — community hub, followed by many, follows her close circle
follow(elif_user, ayse);     follow(elif_user, zeynep);   follow(elif_user, selin)
follow(elif_user, levent);   follow(elif_user, yasemin)

# Ayse — follows wellness/women's circle
follow(ayse, elif_user);     follow(ayse, zeynep);        follow(ayse, selin)
follow(ayse, yasemin);       follow(ayse, deniz)

# Zeynep — follows community organizers
follow(zeynep, elif_user);   follow(zeynep, ayse);        follow(zeynep, selin)
follow(zeynep, cem);         follow(zeynep, deniz)

# Cem — tech/youth cluster
follow(cem, can);            follow(cem, burak);          follow(cem, emre)
follow(cem, mehmet);         follow(cem, zeynep)

# Mehmet — cross-generation bridge
follow(mehmet, cem);         follow(mehmet, levent);      follow(mehmet, murat)
follow(mehmet, can);         follow(mehmet, elif_user)

# Can — young tech crowd
follow(can, cem);            follow(can, burak);          follow(can, emre)
follow(can, mehmet)

# Deniz — photography & outdoor community
follow(deniz, selin);        follow(deniz, zeynep);       follow(deniz, ayse)
follow(deniz, can);          follow(deniz, elif_user)

# Burak — startup / tech
follow(burak, can);          follow(burak, cem);          follow(burak, emre)
follow(burak, mehmet)

# Selin — wellness & arts
follow(selin, elif_user);    follow(selin, ayse);         follow(selin, zeynep)
follow(selin, yasemin);      follow(selin, deniz)

# Emre — tech newcomer
follow(emre, can);           follow(emre, burak);         follow(emre, cem)
follow(emre, mehmet)

# Yasemin — cultural & women's community
follow(yasemin, elif_user);  follow(yasemin, ayse);       follow(yasemin, selin)
follow(yasemin, zeynep);     follow(yasemin, levent)

# Murat — older gen, board games & culture
follow(murat, levent);       follow(murat, mehmet);       follow(murat, cem)
follow(murat, elif_user)

# Levent — retired musician, intergenerational
follow(levent, murat);       follow(levent, mehmet);      follow(levent, elif_user)
follow(levent, yasemin);     follow(levent, ayse)

# Cross-cluster bridges for a denser, more realistic social graph
follow(elif_user, cem);      follow(elif_user, can);       follow(elif_user, emre)
follow(ayse, levent);        follow(ayse, emre);           follow(ayse, murat)
follow(zeynep, levent);      follow(zeynep, yasemin);      follow(zeynep, can)
follow(cem, elif_user);       follow(cem, selin);           follow(cem, deniz)
follow(can, selin);           follow(can, zeynep);          follow(can, yasemin)
follow(deniz, burak);         follow(deniz, murat);         follow(deniz, levent)
follow(burak, selin);         follow(burak, levent);        follow(burak, deniz)
follow(selin, emre);          follow(selin, can);           follow(selin, murat)
follow(emre, selin);          follow(emre, ayse);           follow(emre, levent)
follow(yasemin, cem);         follow(yasemin, can);         follow(yasemin, murat)
follow(murat, ayse);          follow(murat, selin);         follow(murat, can)

total_follows = UserFollow.objects.filter(
    follower__email__in=[u.email for u in all_users]
).count()
print(f"  Created {total_follows} follow relationships across {len(all_users)} users")

print("\n[4/8] Creating realistic services...")

def get_tag(tag_id, tag_name):
    try:
        return Tag.objects.get(id=tag_id)
    except Tag.DoesNotExist:
        return Tag.objects.get(name=tag_name)

cooking_tag = get_tag('Q8476', 'Cooking')
music_tag = get_tag('Q11424', 'Music')
sports_tag = get_tag('Q11461', 'Sports')
art_tag = get_tag('Q11019', 'Art')
chess_tag = get_tag('Q7186', 'Chess')
education_tag = get_tag('Q11465', 'Education')
technology_tag = get_tag('Q11466', 'Technology')
gardening_tag = get_tag('Q11467', 'Gardening')
language_tag = get_tag('Q2013', 'Language')
photography_tag = get_tag('Q11631', 'Photography')

print("  Enriching user profiles...")
user_skill_map = {
    'elif@demo.com': [cooking_tag, art_tag],
    'cem@demo.com': [chess_tag, education_tag],
    'ayse@demo.com': [gardening_tag, art_tag, education_tag],
    'mehmet@demo.com': [education_tag, technology_tag],
    'zeynep@demo.com': [language_tag, education_tag, cooking_tag],
    'can@demo.com': [photography_tag, art_tag],
    'deniz@demo.com': [technology_tag, sports_tag],
    'burak@demo.com': [music_tag, chess_tag],
    'selin@demo.com': [language_tag, education_tag, art_tag],
    'emre@demo.com': [sports_tag, education_tag, photography_tag],
    'yasemin@demo.com': [cooking_tag, education_tag, art_tag],
    'murat@demo.com': [chess_tag, education_tag, technology_tag],
    'levent@demo.com': [music_tag, art_tag, education_tag],
}
user_portfolio_map = {
    'elif@demo.com': [
        *semantic_gallery_images('turkish cooking dumplings community kitchen', 3, 600, 400),
    ],
    'ayse@demo.com': [
        *semantic_gallery_images('balcony garden plants community', 2, 600, 400),
        *semantic_gallery_images('watercolor postcards art table', 1, 600, 400, start_offset=10),
    ],
    'can@demo.com': [
        *semantic_gallery_images('street photography local stories city', 3, 600, 400),
    ],
    'zeynep@demo.com': [
        *semantic_gallery_images('language exchange reading circle people', 2, 600, 400),
    ],
    'selin@demo.com': [
        *semantic_gallery_images('book club library community', 3, 600, 400),
    ],
    'emre@demo.com': [
        *semantic_gallery_images('ferry city walk neighborhood', 2, 600, 400),
    ],
    'yasemin@demo.com': [
        *semantic_gallery_images('coffee recipe kitchen storytelling', 3, 600, 400),
    ],
    'murat@demo.com': [
        *semantic_gallery_images('board games study table', 2, 600, 400),
    ],
    'levent@demo.com': [
        *semantic_gallery_images('acoustic music gathering', 2, 600, 400),
        *semantic_gallery_images('museum history walk', 1, 600, 400, start_offset=10),
    ],
}
user_video_map = {
    'selin@demo.com': 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    'yasemin@demo.com': 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    'levent@demo.com': 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
}

for user in all_users:
    user.skills.set(user_skill_map[user.email])
    user.portfolio_images = user_portfolio_map.get(user.email, [])
    user.video_intro_url = user_video_map.get(user.email)
    user.save(update_fields=['portfolio_images', 'video_intro_url'])

services = []
now = timezone.now()

def create_demo_service(*, user, title, description, service_type, duration,
                        location_type, max_participants, schedule_type,
                        tags, location_area=None, location_lat=None,
                        location_lng=None, schedule_details=None,
                        scheduled_time=None, status='Active',
                        created_days_ago=0):
    service = Service.objects.create(
        user=user,
        title=title,
        description=description,
        type=service_type,
        duration=Decimal(duration),
        location_type=location_type,
        location_area=location_area,
        location_lat=location_lat,
        location_lng=location_lng,
        max_participants=max_participants,
        schedule_type=schedule_type,
        schedule_details=schedule_details,
        scheduled_time=scheduled_time,
        status=status,
        created_at=timezone.now() - timedelta(days=created_days_ago),
    )
    service.tags.set(tags)
    services.append(service)
    print(f"  Created: {service.title}")
    return service

manti_demo_time = now - timedelta(days=1, hours=2)
borek_demo_time = now - timedelta(days=3, hours=1)
gardening_demo_time = now - timedelta(days=2, hours=3)
photography_demo_time = now - timedelta(days=1, hours=5)

manti_seed_time = now + timedelta(days=2)
borek_seed_time = now + timedelta(days=3)
gardening_seed_time = now + timedelta(days=4)
photography_seed_time = now + timedelta(days=5)

elif_manti = Service.objects.create(
    user=elif_user,
    title='Neighborhood Manti Cooking Circle',
    description='A shared cooking session for neighbors who want to learn one reliable community meal together. We\'ll prepare dough, filling, folding, and sauce side by side, with everyone leaving able to make it again for friends or family.',
    type='Offer',
    duration=Decimal('3.00'),
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=3,
    schedule_type='One-Time',
    scheduled_time=manti_seed_time,
    schedule_details='This week at 18:30 in my Beşiktaş kitchen',
    status='Active',
    created_at=timezone.now() - timedelta(days=20),
)
elif_manti.tags.set([cooking_tag])
services.append(elif_manti)
print(f"  Created: {elif_manti.title}")

elif_borek = Service.objects.create(
    user=elif_user,
    title='Community Börek Prep Session',
    description='A practical shared kitchen session focused on making two reliable börek fillings for potlucks, neighbor visits, or family tables. We will split tasks, talk through timing, and practice techniques that make home cooking easier.',
    type='Offer',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=2,
    schedule_type='One-Time',
    scheduled_time=borek_seed_time,
    schedule_details='This week at 14:00 in Beşiktaş',
    status='Active',
    created_at=timezone.now() - timedelta(days=5),
)
elif_borek.tags.set([cooking_tag])
services.append(elif_borek)
print(f"  Created: {elif_borek.title}")

elif_tech = Service.objects.create(
    user=elif_user,
    title='Need Help Turning Neighbour Notes into a Shared Welcome Guide',
    description='I have handwritten recommendations from neighbors about ferry stops, affordable groceries, and friendly public spaces. I would love help turning them into a simple welcome guide for new people on our street.',
    type='Need',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Flexible - this weekend preferred',
    status='Active',
    created_at=timezone.now() - timedelta(days=3),
)
elif_tech.tags.set([technology_tag])
services.append(elif_tech)
print(f"  Created: {elif_tech.title}")

cem_chess_offer = Service.objects.create(
    user=cem,
    title='Chess Strategy Hour for New Players',
    description='Friendly chess support for people who know the basics and want more confidence. We can review openings, common mistakes, and how to think a few moves ahead without pressure.',
    type='Offer',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9819'),
    location_lng=Decimal('29.0244'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Next Sunday at 15:00',
    status='Active',
    created_at=timezone.now() - timedelta(days=18),
)
cem_chess_offer.tags.set([chess_tag])
services.append(cem_chess_offer)
print(f"  Created: {cem_chess_offer.title}")

cem_genealogy = Service.objects.create(
    user=cem,
    title='Family Archive Starter Help',
    description='I can help you begin tracing family connections and organizing old records. This is a good fit for anyone who wants to preserve stories, names, and documents for future generations.',
    type='Offer',
    duration=Decimal('1.00'),
    location_type='Online',
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Flexible scheduling via video call',
    status='Active',
    created_at=timezone.now() - timedelta(days=12),
)
cem_genealogy.tags.set([education_tag])
services.append(cem_genealogy)
print(f"  Created: {cem_genealogy.title}")

ayse_gardening = Service.objects.create(
    user=ayse,
    title='Community Balcony Garden Workday',
    description='A hands-on session for neighbors who want to grow herbs and vegetables in small spaces. We will work through containers, soil, watering, and seasonal planning in a practical, shared setting.',
    type='Offer',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Üsküdar',
    location_lat=Decimal('41.0214'),
    location_lng=Decimal('29.0125'),
    max_participants=3,
    schedule_type='One-Time',
    scheduled_time=gardening_seed_time,
    schedule_details='This week at 10:00 in Üsküdar',
    status='Active',
    created_at=timezone.now() - timedelta(days=8),
)
ayse_gardening.tags.set([gardening_tag])
services.append(ayse_gardening)
print(f"  Created: {ayse_gardening.title}")

ayse_plant_advice = Service.objects.create(
    user=ayse,
    title='Plant Rescue Check-In',
    description='Bring photos of a struggling plant and we can work out a realistic care routine together. Good for busy people who want simple, sustainable plant care advice.',
    type='Offer',
    duration=Decimal('1.00'),
    location_type='Online',
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Flexible scheduling',
    status='Active',
    created_at=timezone.now() - timedelta(days=2),
)
ayse_plant_advice.tags.set([gardening_tag])
services.append(ayse_plant_advice)
print(f"  Created: {ayse_plant_advice.title}")

mehmet_genealogy = Service.objects.create(
    user=mehmet,
    title='Local History and Family Archive Help',
    description='I help people make sense of family papers, oral histories, and archive searches. Ideal for anyone trying to preserve family memory or connect younger relatives with older stories.',
    type='Offer',
    duration=Decimal('2.00'),
    location_type='Online',
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Flexible - weekday afternoons preferred',
    status='Active',
    created_at=timezone.now() - timedelta(days=25),
)
mehmet_genealogy.tags.set([education_tag])
services.append(mehmet_genealogy)
print(f"  Created: {mehmet_genealogy.title}")

mehmet_tech = Service.objects.create(
    user=mehmet,
    title='Need Patient Help with e-Devlet and Phone Basics',
    description='I would appreciate calm, step-by-step help with phone settings, e-Devlet access, and everyday apps so I can handle more errands independently.',
    type='Need',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Şişli',
    location_lat=Decimal('41.0602'),
    location_lng=Decimal('28.9874'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Weekday afternoons work best',
    status='Active',
    created_at=timezone.now() - timedelta(days=6),
)
mehmet_tech.tags.set([technology_tag])
services.append(mehmet_tech)
print(f"  Created: {mehmet_tech.title}")

zeynep_language = Service.objects.create(
    user=zeynep,
    title='Conversation Exchange for New Neighbors',
    description='Relaxed Turkish-English conversation practice for people settling into a neighborhood, a new job, or a new community. We can focus on everyday confidence and useful phrases.',
    type='Offer',
    duration=Decimal('1.00'),
    location_type='Online',
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Next Wednesday at 20:00',
    status='Active',
    created_at=timezone.now() - timedelta(days=22),
)
zeynep_language.tags.set([language_tag])
services.append(zeynep_language)
print(f"  Created: {zeynep_language.title}")

zeynep_cooking_need = Service.objects.create(
    user=zeynep,
    title='Learn Turkish Coffee for Community Gatherings',
    description='I want to learn a reliable Turkish coffee routine I can use when hosting neighbors and friends. Looking for someone who can teach both technique and cultural context.',
    type='Need',
    duration=Decimal('1.00'),
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9819'),
    location_lng=Decimal('29.0244'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Weekend preferred',
    status='Active',
    created_at=timezone.now() - timedelta(days=4),
)
zeynep_cooking_need.tags.set([cooking_tag])
services.append(zeynep_cooking_need)
print(f"  Created: {zeynep_cooking_need.title}")

can_photography = Service.objects.create(
    user=can,
    title='Neighborhood Photo Walk for Local Stories',
    description='A relaxed photo walk focused on capturing everyday neighborhood life with more care and confidence. Bring a camera or phone and we will talk through composition, light, and respectful storytelling.',
    type='Offer',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=2,
    schedule_type='One-Time',
    scheduled_time=photography_seed_time,
    schedule_details='This week at golden hour in Beşiktaş',
    status='Active',
    created_at=timezone.now() - timedelta(days=7),
)
can_photography.tags.set([photography_tag])
services.append(can_photography)
print(f"  Created: {can_photography.title}")

can_cooking_need = Service.objects.create(
    user=can,
    title='Learn Two Shared Meal Recipes',
    description='I want to learn a couple of dependable Turkish dishes I can cook for friends, neighbors, and shared dinners. Looking for a patient teacher and practical recipes.',
    type='Need',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Weekend afternoon',
    status='Active',
    created_at=timezone.now() - timedelta(days=1),
)
can_cooking_need.tags.set([cooking_tag])
services.append(can_cooking_need)
print(f"  Created: {can_cooking_need.title}")

deniz_tech = Service.objects.create(
    user=deniz,
    title='Smartphone Help for Parents and Neighbors',
    description='Patient, beginner-friendly support with phone setup, useful apps, backups, and digital basics. Especially helpful for people supporting older relatives or neighbors who are new to smartphones.',
    type='Offer',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9819'),
    location_lng=Decimal('29.0244'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Flexible scheduling',
    status='Active',
    created_at=timezone.now() - timedelta(days=10),
)
deniz_tech.tags.set([technology_tag])
services.append(deniz_tech)
print(f"  Created: {deniz_tech.title}")

burak_chess = Service.objects.create(
    user=burak,
    title='Looking for a Chess Practice Partner',
    description='I am looking for steady, friendly practice games where we can talk through moves and keep each other improving over time. Casual and community-minded is ideal.',
    type='Need',
    duration=Decimal('1.00'),
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9819'),
    location_lng=Decimal('29.0244'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='This Friday evening',
    status='Active',
    created_at=timezone.now() - timedelta(days=9),
)
burak_chess.tags.set([chess_tag])
services.append(burak_chess)
print(f"  Created: {burak_chess.title}")

burak_guitar = Service.objects.create(
    user=burak,
    title='Beginner Guitar Circle',
    description='A welcoming beginner session covering tuning, a few chords, rhythm, and one simple song people can keep practicing together. Good for anyone who wants a gentle start.',
    type='Offer',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9819'),
    location_lng=Decimal('29.0244'),
    max_participants=2,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=5, hours=2),
    schedule_details='Next Tuesday at 19:00 in Kadıköy',
    status='Active',
    created_at=timezone.now() - timedelta(days=11),
)
burak_guitar.tags.set([music_tag])
services.append(burak_guitar)
print(f"  Created: {burak_guitar.title}")

deniz_jogging = Service.objects.create(
    user=deniz,
    title='Morning Accountability Jog in Kadıköy',
    description='Looking for a reliable morning partner for easy-paced runs along the Kadıköy coast. The goal is consistency, motivation, and a supportive routine more than speed.',
    type='Need',
    duration=Decimal('1.00'),
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9819'),
    location_lng=Decimal('29.0244'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Tomorrow at 07:00',
    status='Active',
    created_at=timezone.now() - timedelta(days=4),
)
deniz_jogging.tags.set([sports_tag])
services.append(deniz_jogging)
print(f"  Created: {deniz_jogging.title}")

ayse_watercolor = Service.objects.create(
    user=ayse,
    title='Watercolor Postcards for the Community Board',
    description='A calm beginner-friendly watercolor session where we practice color mixing and simple illustrations by creating postcards or noticeboard art for shared spaces.',
    type='Offer',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Üsküdar',
    location_lat=Decimal('41.0214'),
    location_lng=Decimal('29.0125'),
    max_participants=3,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=7, hours=1),
    schedule_details='Next Sunday at 13:00 in Üsküdar',
    status='Active',
    created_at=timezone.now() - timedelta(days=13),
)
ayse_watercolor.tags.set([art_tag])
services.append(ayse_watercolor)
print(f"  Created: {ayse_watercolor.title}")

selin_reading_circle = create_demo_service(
    user=selin,
    title='Slow Reading Circle for Curious Neighbors',
    description='A gentle reading circle for people who want to read a short text together and actually talk about it without academic pressure. Perfect for newcomers, shy readers, and anyone missing thoughtful conversation.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Beyoğlu',
    location_lat=Decimal('41.0320'),
    location_lng=Decimal('28.9740'),
    max_participants=6,
    schedule_type='One-Time',
    schedule_details='Next Thursday at 19:00 in Cihangir',
    tags=[language_tag, education_tag],
    created_days_ago=30,
)

selin_potluck_need = create_demo_service(
    user=selin,
    title='Looking for a Co-Host for a Neighborhood Potluck',
    description='I can organize the conversation and guest list, but I would love a calm co-host who can help welcome people, set up name tags, and make first-timers feel included.',
    service_type='Need',
    duration='2.00',
    location_type='In-Person',
    location_area='Beyoğlu',
    location_lat=Decimal('41.0320'),
    location_lng=Decimal('28.9740'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Next weekend preferred',
    tags=[education_tag, cooking_tag],
    created_days_ago=8,
)

emre_orientation_walk = create_demo_service(
    user=emre,
    title='Ferry and Market Orientation Walk for New Neighbors',
    description='A practical walking session for people who just moved nearby and want to learn the ferry route, market rhythm, tea stops, and useful public places without feeling rushed.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Üsküdar',
    location_lat=Decimal('41.0257'),
    location_lng=Decimal('29.0154'),
    max_participants=4,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=6, hours=1),
    schedule_details='Next Saturday at 10:30 from Üsküdar pier',
    tags=[sports_tag, education_tag],
    created_days_ago=14,
)

emre_boardgames_need = create_demo_service(
    user=emre,
    title='Looking for a Small Weekend Board Game Group',
    description='I miss low-pressure board game nights where the goal is conversation and consistency more than competition. Open to beginner-friendly games and rotating hosts.',
    service_type='Need',
    duration='2.00',
    location_type='In-Person',
    location_area='Üsküdar',
    location_lat=Decimal('41.0257'),
    location_lng=Decimal('29.0154'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='This Saturday evening',
    tags=[chess_tag, education_tag],
    created_days_ago=11,
)

yasemin_coffee_offer = create_demo_service(
    user=yasemin,
    title='Coffee Rituals for Hosting Friends and Neighbors',
    description='A warm, beginner-friendly session on how to prepare Turkish coffee, pace a visit, and create a welcoming hosting rhythm for neighbors, relatives, or community guests.',
    service_type='Offer',
    duration='1.00',
    location_type='In-Person',
    location_area='Fatih',
    location_lat=Decimal('41.0186'),
    location_lng=Decimal('28.9647'),
    max_participants=3,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=4, hours=2),
    schedule_details='This Friday at 17:00 in Fatih',
    tags=[cooking_tag, education_tag],
    created_days_ago=18,
)

yasemin_recipe_need = create_demo_service(
    user=yasemin,
    title='Help Organizing Family Recipe Notes',
    description='I have recipe cards, voice notes, and margin notes from older relatives and want help turning them into something my children and neighbors can actually use and enjoy.',
    service_type='Need',
    duration='2.00',
    location_type='Online',
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Flexible weeknight video call',
    tags=[cooking_tag, education_tag],
    created_days_ago=7,
)

murat_study_need = create_demo_service(
    user=murat,
    title='Looking for an Accountability Study Session',
    description='Remote work has made my weeks blur together. I am looking for one or two people to meet regularly, set a realistic goal, work quietly, and check in at the end.',
    service_type='Need',
    duration='1.00',
    location_type='Online',
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='This Tuesday evening online',
    tags=[education_tag, technology_tag],
    created_days_ago=5,
)

murat_boardgames_offer = create_demo_service(
    user=murat,
    title='Beginner-Friendly Board Game Evening',
    description='A simple board game evening for people who want a low-stakes way to meet others. I can explain the rules clearly and keep the group welcoming for first-timers.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9870'),
    location_lng=Decimal('29.0280'),
    max_participants=4,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=9),
    schedule_details='Next weekend in Yeldeğirmeni',
    tags=[chess_tag, education_tag],
    created_days_ago=4,
)

levent_singalong = create_demo_service(
    user=levent,
    title='Songs We Grew Up With: Shared Singing Hour',
    description='An informal acoustic singalong for people who want to remember old songs, share stories between verses, and spend time together without needing musical confidence.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Beyoğlu',
    location_lat=Decimal('41.0320'),
    location_lng=Decimal('28.9740'),
    max_participants=5,
    schedule_type='One-Time',
    schedule_details='This Sunday at 16:00',
    tags=[music_tag, education_tag],
    created_days_ago=40,
)

levent_museum_need = create_demo_service(
    user=levent,
    title='Need a Museum Morning Companion',
    description='I enjoy museums much more when I can pause, talk, and compare impressions with someone. Looking for a thoughtful walking companion rather than a formal guide.',
    service_type='Need',
    duration='2.00',
    location_type='In-Person',
    location_area='Beyoğlu',
    location_lat=Decimal('41.0320'),
    location_lng=Decimal('28.9740'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Weekday morning preferred',
    tags=[art_tag, education_tag],
    created_days_ago=6,
)

selin_reading_event = create_demo_service(
    user=selin,
    title='Sunday Reading Circle in Cihangir',
    description='Bring a short passage, poem, or essay that helped you think differently this month. We will read, listen, and discuss in a way that leaves room for quiet voices too.',
    service_type='Event',
    duration='2.00',
    location_type='In-Person',
    location_area='Beyoğlu',
    location_lat=Decimal('41.0320'),
    location_lng=Decimal('28.9740'),
    max_participants=8,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=5, hours=3),
    schedule_details='Sunday at 15:00 in Cihangir',
    tags=[language_tag, education_tag, art_tag],
    created_days_ago=10,
)

emre_walk_event = create_demo_service(
    user=emre,
    title='Bosphorus Sunrise Walk for New Neighbors',
    description='A relaxed early walk for people who want to learn a scenic route, meet others gently, and start the week with shared movement and conversation.',
    service_type='Event',
    duration='2.00',
    location_type='In-Person',
    location_area='Üsküdar',
    location_lat=Decimal('41.0257'),
    location_lng=Decimal('29.0154'),
    max_participants=10,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(hours=12),
    schedule_details='Tomorrow at sunrise from Üsküdar coast',
    tags=[sports_tag, photography_tag],
    created_days_ago=3,
)

yasemin_story_event = create_demo_service(
    user=yasemin,
    title='Recipe Swap and Story Night',
    description='Neighbors bring one recipe, one story, and one memory tied to a table, a person, or a season. The evening is about sharing context as much as ingredients.',
    service_type='Event',
    duration='2.00',
    location_type='In-Person',
    location_area='Fatih',
    location_lat=Decimal('41.0186'),
    location_lng=Decimal('28.9647'),
    max_participants=7,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=8, hours=1),
    schedule_details='Next Friday at 19:00 in Fatih',
    tags=[cooking_tag, education_tag, art_tag],
    created_days_ago=9,
)

levent_music_event = create_demo_service(
    user=levent,
    title='Courtyard Acoustic Singalong',
    description='An intergenerational music evening with simple songs, shared lyrics, and space for stories in between. No performance pressure, just a warm gathering.',
    service_type='Event',
    duration='2.00',
    location_type='In-Person',
    location_area='Beyoğlu',
    location_lat=Decimal('41.0320'),
    location_lng=Decimal('28.9740'),
    max_participants=6,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=2, hours=4),
    schedule_details='This weekend at 18:00 in a Beyoğlu courtyard',
    tags=[music_tag, art_tag],
    created_days_ago=16,
)

elif_photo_event = create_demo_service(
    user=elif_user,
    title='Golden Horn Photography Walk',
    description='A guided walk along the Golden Horn for photography enthusiasts. We will scout light, composition, and local life together. Suitable for all camera types.',
    service_type='Event',
    duration='3.00',
    location_type='In-Person',
    location_area='Eyüpsultan',
    location_lat=Decimal('41.0498'),
    location_lng=Decimal('28.9350'),
    max_participants=4,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=4, hours=7),
    schedule_details='Saturday morning, meets at Eyüp Ferry Dock at 08:00',
    tags=[photography_tag, art_tag],
    created_days_ago=5,
)

# ── New community-aligned services ────────────────────────────────────────────

elif_knitting = create_demo_service(
    user=elif_user,
    title='Neighborhood Knitting and Conversation Circle',
    description='Bring yarn, needles, and whatever you are working on. This is less about perfecting stitches and more about slowing down together, sharing stories, and making something with your hands while the tea stays warm.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=5,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=6, hours=3),
    schedule_details='Saturday afternoon at 15:00 in Beşiktaş',
    tags=[art_tag, education_tag],
    created_days_ago=6,
)

ayse_composting = create_demo_service(
    user=ayse,
    title='Composting Basics for Apartment Dwellers',
    description='A practical walkthrough of how to compost kitchen scraps in a small flat without odor or mess. We will set up a simple system together and talk through what works month to month.',
    service_type='Offer',
    duration='1.00',
    location_type='In-Person',
    location_area='Üsküdar',
    location_lat=Decimal('41.0214'),
    location_lng=Decimal('29.0125'),
    max_participants=3,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=5, hours=1),
    schedule_details='This weekend at 11:00 in Üsküdar',
    tags=[gardening_tag, education_tag],
    created_days_ago=4,
)

mehmet_oral_history = create_demo_service(
    user=mehmet,
    title='Oral History Recording for Elders',
    description='I help families record conversations with older relatives so their stories, voices, and memories are preserved. We use a simple phone setup and I guide the questions gently.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Şişli',
    location_lat=Decimal('41.0602'),
    location_lng=Decimal('28.9874'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Weekday afternoon, flexible scheduling',
    tags=[education_tag],
    created_days_ago=15,
)

selin_meditation = create_demo_service(
    user=selin,
    title='Gentle Morning Meditation in the Park',
    description='A quiet, beginner-friendly guided meditation in a Cihangir park. No experience needed. We sit, breathe, and start the day with a few minutes of shared calm before the city wakes up.',
    service_type='Offer',
    duration='1.00',
    location_type='In-Person',
    location_area='Beyoğlu',
    location_lat=Decimal('41.0320'),
    location_lng=Decimal('28.9740'),
    max_participants=6,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=3, hours=-2),
    schedule_details='Wednesday at 07:30 in Cihangir park',
    tags=[sports_tag, education_tag],
    created_days_ago=7,
)

zeynep_french = create_demo_service(
    user=zeynep,
    title='French Conversation Hour for Curious Neighbors',
    description='Relaxed spoken French practice for anyone who studied it years ago or just wants to try. We talk about food, travel, and daily life in simple sentences with no textbook pressure.',
    service_type='Offer',
    duration='1.00',
    location_type='Online',
    max_participants=2,
    schedule_type='One-Time',
    schedule_details='Thursday evening at 20:00 online',
    tags=[language_tag, education_tag],
    created_days_ago=9,
)

can_zine = create_demo_service(
    user=can,
    title='DIY Photo Zine Workshop for Beginners',
    description='We will take a handful of phone photos, print them cheaply, and fold them into a small zine that tells a neighborhood story. No design experience needed, just curiosity and a few snapshots.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=3,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=8, hours=2),
    schedule_details='Next Sunday at 14:00 in Beşiktaş',
    tags=[photography_tag, art_tag],
    created_days_ago=3,
)

levent_vinyl = create_demo_service(
    user=levent,
    title='Vinyl Listening Session and Music Stories',
    description='Bring a record or just your ears. We listen to one album side together, share what we notice, and talk about the stories behind the music. All genres welcome.',
    service_type='Offer',
    duration='2.00',
    location_type='In-Person',
    location_area='Beyoğlu',
    location_lat=Decimal('41.0320'),
    location_lng=Decimal('28.9740'),
    max_participants=4,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=7, hours=4),
    schedule_details='Next Saturday at 19:00 in Beyoğlu',
    tags=[music_tag, art_tag],
    created_days_ago=12,
)

deniz_bookbox = create_demo_service(
    user=deniz,
    title='Need Help Setting Up a Neighborhood Book Exchange Box',
    description='I bought a small weatherproof box and want to mount it on our street as a free book exchange. Looking for someone handy who can help me install it and maybe paint it together.',
    service_type='Need',
    duration='2.00',
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9819'),
    location_lng=Decimal('29.0244'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Any weekend morning works',
    tags=[education_tag, art_tag],
    created_days_ago=2,
)

murat_walkbuddy = create_demo_service(
    user=murat,
    title='Looking for a Walking Buddy for Weekend Mornings',
    description='I work remotely and most of my week is screens. Looking for someone to share a quiet, no-agenda Saturday morning walk in Kadıköy. Just fresh air, conversation, and getting to know someone.',
    service_type='Need',
    duration='1.00',
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9870'),
    location_lng=Decimal('29.0280'),
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Saturday mornings around 09:00',
    tags=[sports_tag],
    created_days_ago=3,
)

emre_presentation = create_demo_service(
    user=emre,
    title='Need Someone to Practice Presentation Skills With',
    description='I have a community talk coming up and I get nervous speaking in front of people. Would love a patient listener who can give honest, gentle feedback on my delivery and timing.',
    service_type='Need',
    duration='1.00',
    location_type='Online',
    max_participants=1,
    schedule_type='One-Time',
    schedule_details='Any evening this week',
    tags=[education_tag],
    created_days_ago=1,
)

yasemin_potluck_event = create_demo_service(
    user=yasemin,
    title='Neighborhood Potluck Dinner Under the Stars',
    description='Everyone brings one dish and one story about where it comes from. We set up a long table in the courtyard, light candles, and eat together like neighbors used to.',
    service_type='Event',
    duration='3.00',
    location_type='In-Person',
    location_area='Fatih',
    location_lat=Decimal('41.0186'),
    location_lng=Decimal('28.9647'),
    max_participants=12,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=10, hours=3),
    schedule_details='Next Friday evening at 19:30 in a Fatih courtyard',
    tags=[cooking_tag, art_tag],
    created_days_ago=8,
)

burak_openmic = create_demo_service(
    user=burak,
    title='Open Mic Night for First-Timers',
    description='A warm, pressure-free open mic where the audience is there to encourage, not judge. Read a poem, play a song, tell a story, or just come to listen and clap.',
    service_type='Event',
    duration='2.00',
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9819'),
    location_lng=Decimal('29.0244'),
    max_participants=10,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=6, hours=5),
    schedule_details='Saturday evening at 20:00 in Kadıköy',
    tags=[music_tag, art_tag],
    created_days_ago=5,
)

elif_mending = create_demo_service(
    user=elif_user,
    title='Community Mending and Repair Cafe',
    description='Bring something that needs fixing: a torn shirt, a broken zipper, a loose button. We sit together, share tools, teach each other basic repairs, and save things from the bin.',
    service_type='Event',
    duration='2.00',
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=8,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(days=9, hours=2),
    schedule_details='Next Sunday at 14:00 in Beşiktaş community space',
    tags=[art_tag, education_tag],
    created_days_ago=4,
)

print(f"\n  Created {len(services)} services")

for service in services:
    apply_fixed_group_offer_seed_details(service)

print("  Adding service cover images...")
service_media_count = 0
for service in services:
    media_urls = [semantic_service_image(service)]
    if service.type == 'Event':
        media_urls.extend(semantic_gallery_images(service.title, 2, start_offset=5))
    elif service.max_participants > 1:
        media_urls.extend(semantic_gallery_images(service.title, 1, start_offset=3))

    for display_order, media_url in enumerate(media_urls):
        ServiceMedia.objects.create(
            service=service,
            media_type='image',
            file_url=media_url,
            display_order=display_order,
        )
        service_media_count += 1
print(f"  Added {service_media_count} semantic service media items")

print("\n[5/8] Creating handshakes and completing workflows...")

def backdate_timebank_activity(*, created_at, handshake=None, service=None, transaction_type=None):
    """Move generated TimeBank ledger rows onto the demo timeline."""
    queryset = TransactionHistory.objects.all()
    if handshake is not None:
        queryset = queryset.filter(handshake=handshake)
    if service is not None:
        queryset = queryset.filter(service=service)
    if transaction_type is not None:
        queryset = queryset.filter(transaction_type=transaction_type)
    queryset.update(created_at=created_at)


def simulate_handshake_workflow(service, requester, provider_initiated_days_ago=0, completed_days_ago=None):
    """Complete handshake lifecycle through proper system workflows"""
    handshake = HandshakeService.express_interest(service, requester)
    
    created_at_time = timezone.now() - timedelta(days=provider_initiated_days_ago + 2)
    Handshake.objects.filter(pk=handshake.pk).update(created_at=created_at_time)
    handshake.refresh_from_db()
    
    # Conversation participants are always: requester and service owner
    service_owner = service.user
    provider, receiver = get_provider_and_receiver(handshake)
    
    exact_locations = {
        'Beşiktaş': 'Beşiktaş Çarşı, near the ferry terminal',
        'Kadıköy': 'Kadıköy Moda, quiet café on Moda Caddesi',
        'Üsküdar': 'Üsküdar ferry pier area, garden space',
        'Şişli': 'Şişli center, convenient meeting point',
    }
    
    handshake.provider_initiated = True
    if is_fixed_group_offer(service):
        handshake.exact_location = service.session_exact_location or service.location_area
        handshake.exact_location_guide = service.session_location_guide
        handshake.exact_duration = service.duration
        handshake.scheduled_time = service.scheduled_time
        handshake.exact_location_maps_url = build_google_maps_url(
            handshake.exact_location,
            service.session_exact_location_lat,
            service.session_exact_location_lng,
        )
    else:
        handshake.exact_location = exact_locations.get(service.location_area, f'{service.location_area} area')
        handshake.exact_location_guide = None
        handshake.exact_duration = service.duration
        handshake.scheduled_time = timezone.now() + timedelta(days=3)
        handshake.exact_location_maps_url = build_google_maps_url(
            handshake.exact_location,
            service.location_lat,
            service.location_lng,
        )
    handshake.updated_at = created_at_time + timedelta(hours=2)
    handshake.save()
    
    provision_timebank(handshake)
    backdate_timebank_activity(
        created_at=created_at_time + timedelta(hours=3),
        handshake=handshake,
        transaction_type='provision',
    )
    handshake.status = 'accepted'
    handshake.requester_initiated = True
    handshake.updated_at = created_at_time + timedelta(hours=4)
    handshake.save()

    # Mirror accept_handshake view logic:
    # Only when all slots are filled do we deny remaining pending handshakes
    # and transition the service to Agreed.
    if service.schedule_type == 'One-Time':
        accepted_count = Handshake.objects.filter(
            service=service,
            status__in=['accepted', 'completed', 'reported', 'paused'],
        ).count()
        if accepted_count >= service.max_participants and service.status == 'Active':
            other_pending = Handshake.objects.filter(
                service=service,
                status='pending',
            ).exclude(pk=handshake.pk)
            other_pending.update(status='denied')
            Service.objects.filter(pk=service.pk).update(status='Agreed')
            service.refresh_from_db(fields=['status'])
    
    # Replace the default initial message (created by HandshakeService) with a more natural, two-sided conversation.
    ChatMessage.objects.filter(handshake=handshake).delete()

    if service.type == 'Offer':
        # Service owner offers help; requester is asking for it.
        chat_messages = [
            (requester, f"Hi {service_owner.first_name}! I'm interested in your {service.title.lower()}."),
            (requester, "Do you have availability this week?"),
            (service_owner, "Hi! Yes — happy to help. I can do a short session and we can adjust if needed."),
            (service_owner, f"For in-person, let's meet at {handshake.exact_location}. Does the scheduled time work for you?" if service.location_type == 'In-Person' else "Since this is online, we can meet on the scheduled time. Does that work for you?"),
            (requester, "That works perfectly. Thank you!"),
            (service_owner, "Great. If anything changes, just message me here."),
        ]
    else:
        # Service owner needs help; requester is offering it.
        chat_messages = [
            (requester, f"Hi {service_owner.first_name}! I saw your post: {service.title}. I can help with this."),
            (requester, "What outcome are you aiming for, and what timeline works for you?"),
            (service_owner, "Thanks! I mostly need help getting started and making sure I do it the right way."),
            (service_owner, f"If you're okay with it, let's meet at {handshake.exact_location}. Does the scheduled time work?" if service.location_type == 'In-Person' else "Can we do a quick online session at the scheduled time?"),
            (requester, "Yes, the scheduled time works. Feel free to share any context/details beforehand."),
            (service_owner, "Perfect — really appreciate it. I'll send what I have before the session."),
        ]
    
    base_time = created_at_time
    for i, (sender, body) in enumerate(chat_messages):
        msg_time = base_time + timedelta(minutes=12 + i * 11)
        ChatMessage.objects.create(
            handshake=handshake,
            sender=sender,
            body=body,
            created_at=msg_time
        )
    
    if completed_days_ago is not None:
        handshake = complete_seeded_handshake(handshake, completed_days_ago=completed_days_ago)
        return handshake, True
    
    return handshake, False


def sync_fixed_group_offer_time(service, scheduled_time):
    """Backdate the demo-facing session time after seed workflows are created."""
    exact_location = service.session_exact_location or service.location_area
    exact_maps_url = build_google_maps_url(
        exact_location,
        service.session_exact_location_lat,
        service.session_exact_location_lng,
    )
    Service.objects.filter(pk=service.pk).update(scheduled_time=scheduled_time)
    Handshake.objects.filter(
        service=service,
        status__in=['pending', 'accepted', 'reported', 'paused'],
    ).update(
        scheduled_time=scheduled_time,
        exact_location=exact_location,
        exact_location_guide=service.session_location_guide,
        exact_location_maps_url=exact_maps_url,
        exact_duration=service.duration,
    )
    for completed in Handshake.objects.filter(service=service, status='completed'):
        completed_time = completed.updated_at or timezone.now()
        completed_schedule = scheduled_time
        if completed_schedule is None or completed_schedule >= completed_time:
            completed_schedule = completed_time - timedelta(hours=2)
        Handshake.objects.filter(pk=completed.pk).update(
            scheduled_time=completed_schedule,
            exact_location=exact_location,
            exact_location_guide=service.session_location_guide,
            exact_location_maps_url=exact_maps_url,
            exact_duration=service.duration,
        )
    service.refresh_from_db(fields=['scheduled_time'])


def complete_seeded_handshake(handshake, *, completed_days_ago):
    """Mark an already-accepted handshake as completed with realistic backdated timestamps."""
    completion_offset = timedelta(days=completed_days_ago)
    if completed_days_ago <= 0:
        completion_offset = timedelta(hours=3)
    completion_time = timezone.now() - completion_offset
    scheduled_time = handshake.scheduled_time
    if scheduled_time is None or scheduled_time >= completion_time:
        scheduled_time = completion_time - timedelta(hours=2)
    with transaction.atomic():
        handshake.scheduled_time = scheduled_time
        handshake.provider_confirmed_complete = True
        handshake.receiver_confirmed_complete = True
        handshake.updated_at = completion_time
        # Don't set status='completed' before complete_timebank_transfer —
        # the function exits early (idempotency guard) if status is already
        # 'completed', skipping the service-status update logic.
        handshake.save()
        complete_timebank_transfer(handshake)

        # After transfer, manually back-date the timestamps.
        Handshake.objects.filter(pk=handshake.pk).update(
            scheduled_time=scheduled_time,
            updated_at=completion_time,
        )
        backdate_timebank_activity(
            created_at=completion_time + timedelta(minutes=5),
            handshake=handshake,
            transaction_type='transfer',
        )

        # Sync service status: One-Time services should become 'Completed'
        # when no active handshakes remain (mirrors utils.py logic).
        svc = Service.objects.get(pk=handshake.service.pk)
        if svc.schedule_type == 'One-Time':
            active_count = Handshake.objects.filter(
                service=svc,
                status__in=['pending', 'accepted', 'reported', 'paused'],
            ).count()
            if active_count == 0 and svc.status != 'Completed':
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


def add_public_chat_messages(service, messages, base_time):
    room = getattr(service, 'chat_room', None)
    if room is None:
        raise RuntimeError(f"Missing public chat room for service '{service.title}'")
    for index, (sender, body) in enumerate(messages):
        PublicChatMessage.objects.create(
            room=room,
            sender=sender,
            body=body,
            created_at=base_time + timedelta(minutes=index * 9),
        )


def add_group_chat_messages(service, messages, base_time):
    for index, (sender, body) in enumerate(messages):
        ServiceGroupChatMessage.objects.create(
            service=service,
            sender=sender,
            body=body,
            created_at=base_time + timedelta(minutes=index * 7),
        )


def cancel_seeded_handshake(handshake, cancelled_days_ago):
    cancelled_at = timezone.now() - timedelta(days=cancelled_days_ago)
    with transaction.atomic():
        cancel_timebank_transfer(handshake)
        backdate_timebank_activity(
            created_at=cancelled_at,
            handshake=handshake,
            transaction_type='refund',
        )
        Handshake.objects.filter(pk=handshake.pk).update(
            status='cancelled',
            updated_at=cancelled_at,
        )
    handshake.refresh_from_db()
    return handshake


def event_rsvp(service, requester, joined_days_ago):
    handshake = EventHandshakeService.join_event(service, requester)
    joined_at = timezone.now() - timedelta(days=joined_days_ago)
    Handshake.objects.filter(pk=handshake.pk).update(
        created_at=joined_at,
        updated_at=joined_at + timedelta(hours=2),
    )
    handshake.refresh_from_db()
    return handshake


def backdate_completed_event(service, days_ago):
    completed_at = timezone.now() - timedelta(days=days_ago)
    scheduled_at = completed_at - timedelta(hours=2)
    window_end = completed_at + timedelta(hours=48)
    Service.objects.filter(pk=service.pk).update(
        scheduled_time=scheduled_at,
        event_completed_at=completed_at,
        status='Completed',
    )
    Handshake.objects.filter(service=service, status='attended').update(
        evaluation_window_starts_at=completed_at,
        evaluation_window_ends_at=window_end,
        evaluation_window_closed_at=None,
    )
    service.refresh_from_db()


def expect_handshake_state(handshake, completed, *, expected_completed, label):
    if completed != expected_completed:
        expected_label = 'completed' if expected_completed else 'accepted'
        actual_label = 'completed' if completed else 'accepted'
        raise RuntimeError(f"{label} should be {expected_label}, got {actual_label}")
    if expected_completed and handshake.status != 'completed':
        raise RuntimeError(f"{label} handshake did not finish completed")
    if not expected_completed and handshake.status != 'accepted':
        raise RuntimeError(f"{label} handshake did not remain accepted")
    return handshake


def create_pending_interest(service, requester, *, age_delta, label):
    handshake = HandshakeService.express_interest(service, requester)
    created_at = timezone.now() - age_delta
    Handshake.objects.filter(pk=handshake.pk).update(created_at=created_at)
    handshake.refresh_from_db()
    if handshake.status != 'pending':
        raise RuntimeError(f"{label} handshake did not remain pending")
    pending_handshakes.append(handshake)
    print(f"  Pending: {service.title} ({label})")
    return handshake


def create_verified_reputation(handshake, giver, receiver, punctual, helpful, kind, comment):
    rep = ReputationRep.objects.create(
        handshake=handshake,
        giver=giver,
        receiver=receiver,
        is_punctual=punctual,
        is_helpful=helpful,
        is_kind=kind,
        comment=comment,
        created_at=handshake.updated_at + timedelta(hours=2)
    )

    if comment:
        Comment.objects.create(
            service=handshake.service,
            user=giver,
            body=comment,
            is_verified_review=True,
            related_handshake=handshake,
            created_at=rep.created_at
        )
    print(f"  Added reputation: {giver.first_name} -> {receiver.first_name}")
    return rep


def create_negative_reputation(*, handshake, giver, receiver, comment, is_late=False, is_unhelpful=False, is_rude=False):
    return NegativeRep.objects.create(
        handshake=handshake,
        giver=giver,
        receiver=receiver,
        is_late=is_late,
        is_unhelpful=is_unhelpful,
        is_rude=is_rude,
        comment=comment,
    )

completed_handshakes = []
accepted_handshakes = []
pending_handshakes = []
cancelled_handshakes = []
event_handshakes = []
attended_event_handshakes = []
upcoming_event_handshakes = []
no_show_event_handshakes = []

# Create Zeynep's accepted handshake for Manti BEFORE completing Cem's,
# otherwise the service transitions to 'Completed' and blocks new handshakes.
handshake15, completed = simulate_handshake_workflow(
    elif_manti, zeynep, provider_initiated_days_ago=1
)
handshake15 = expect_handshake_state(handshake15, completed, expected_completed=False, label='Neighborhood Manti Cooking Circle (Elif -> Zeynep)')
accepted_handshakes.append(handshake15)
print(f"  Accepted (pending completion): {elif_manti.title} (Elif -> Zeynep)")

handshake1, completed = simulate_handshake_workflow(
    elif_manti, cem, provider_initiated_days_ago=15, completed_days_ago=10
)
handshake1 = expect_handshake_state(handshake1, completed, expected_completed=True, label='Neighborhood Manti Cooking Circle (Elif -> Cem)')
completed_handshakes.append(handshake1)
print(f"  Completed: {elif_manti.title} (Elif -> Cem)")
sync_fixed_group_offer_time(elif_manti, manti_demo_time)

handshake2, completed = simulate_handshake_workflow(
    cem_genealogy, mehmet, provider_initiated_days_ago=10, completed_days_ago=5
)
handshake2 = expect_handshake_state(handshake2, completed, expected_completed=True, label='Family Archive Starter Help (Cem -> Mehmet)')
completed_handshakes.append(handshake2)
print(f"  Completed: {cem_genealogy.title} (Cem -> Mehmet)")

handshake3, completed = simulate_handshake_workflow(
    ayse_gardening, elif_user, provider_initiated_days_ago=6, completed_days_ago=2
)
handshake3 = expect_handshake_state(handshake3, completed, expected_completed=True, label='Community Balcony Garden Workday (Ayşe -> Elif)')
completed_handshakes.append(handshake3)
print(f"  Completed: {ayse_gardening.title} (Ayşe -> Elif)")
sync_fixed_group_offer_time(ayse_gardening, gardening_demo_time)

handshake4, completed = simulate_handshake_workflow(
    mehmet_tech, deniz, provider_initiated_days_ago=4, completed_days_ago=1
)
handshake4 = expect_handshake_state(handshake4, completed, expected_completed=True, label='Need Patient Help with e-Devlet and Phone Basics (Mehmet -> Deniz)')
completed_handshakes.append(handshake4)
print(f"  Completed: {mehmet_tech.title} (Mehmet -> Deniz)")

handshake5, completed = simulate_handshake_workflow(
    zeynep_language, can, provider_initiated_days_ago=20, completed_days_ago=15
)
handshake5 = expect_handshake_state(handshake5, completed, expected_completed=True, label='Conversation Exchange for New Neighbors (Zeynep -> Can)')
completed_handshakes.append(handshake5)
print(f"  Completed: {zeynep_language.title} (Zeynep -> Can)")

handshake6, completed = simulate_handshake_workflow(
    can_photography, burak, provider_initiated_days_ago=5, completed_days_ago=0
)
handshake6 = expect_handshake_state(handshake6, completed, expected_completed=True, label='Neighborhood Photo Walk for Local Stories (Can -> Burak)')
completed_handshakes.append(handshake6)
print(f"  Completed: {can_photography.title} (Can -> Burak)")
sync_fixed_group_offer_time(can_photography, photography_demo_time)

handshake7, completed = simulate_handshake_workflow(
    elif_borek, zeynep, provider_initiated_days_ago=3, completed_days_ago=0
)
handshake7 = expect_handshake_state(handshake7, completed, expected_completed=True, label='Community Börek Prep Session (Elif -> Zeynep)')
completed_handshakes.append(handshake7)
print(f"  Completed: {elif_borek.title} (Elif -> Zeynep)")
sync_fixed_group_offer_time(elif_borek, borek_demo_time)

handshake8, completed = simulate_handshake_workflow(
    cem_chess_offer, burak, provider_initiated_days_ago=16, completed_days_ago=12
)
handshake8 = expect_handshake_state(handshake8, completed, expected_completed=True, label='Chess Strategy Hour for New Players (Cem -> Burak)')
completed_handshakes.append(handshake8)
print(f"  Completed: {cem_chess_offer.title} (Cem -> Burak)")

handshake9, completed = simulate_handshake_workflow(
    mehmet_genealogy, elif_user, provider_initiated_days_ago=23, completed_days_ago=18
)
handshake9 = expect_handshake_state(handshake9, completed, expected_completed=True, label='Local History and Family Archive Help (Mehmet -> Elif)')
completed_handshakes.append(handshake9)
print(f"  Completed: {mehmet_genealogy.title} (Mehmet -> Elif)")

handshake10, completed = simulate_handshake_workflow(
    deniz_tech, mehmet, provider_initiated_days_ago=8, completed_days_ago=3
)
handshake10 = expect_handshake_state(handshake10, completed, expected_completed=True, label='Smartphone Help for Parents and Neighbors (Deniz -> Mehmet)')
completed_handshakes.append(handshake10)
print(f"  Completed: {deniz_tech.title} (Deniz -> Mehmet)")

handshake11, completed = simulate_handshake_workflow(
    zeynep_cooking_need, elif_user, provider_initiated_days_ago=2
)
handshake11 = expect_handshake_state(handshake11, completed, expected_completed=False, label='Learn Turkish Coffee for Community Gatherings (Zeynep -> Elif)')
accepted_handshakes.append(handshake11)
print(f"  Accepted (pending completion): {zeynep_cooking_need.title} (Zeynep -> Elif)")

handshake12, completed = simulate_handshake_workflow(
    can_cooking_need, elif_user, provider_initiated_days_ago=0
)
handshake12 = expect_handshake_state(handshake12, completed, expected_completed=False, label='Learn Two Shared Meal Recipes (Can -> Elif)')
accepted_handshakes.append(handshake12)
print(f"  Accepted (pending completion): {can_cooking_need.title} (Can -> Elif)")

handshake13, completed = simulate_handshake_workflow(
    ayse_plant_advice, zeynep, provider_initiated_days_ago=1
)
handshake13 = expect_handshake_state(handshake13, completed, expected_completed=False, label='Plant Rescue Check-In (Ayşe -> Zeynep)')
accepted_handshakes.append(handshake13)
print(f"  Accepted (pending completion): {ayse_plant_advice.title} (Ayşe -> Zeynep)")

handshake14, completed = simulate_handshake_workflow(
    burak_chess, cem, provider_initiated_days_ago=0
)
handshake14 = expect_handshake_state(handshake14, completed, expected_completed=False, label='Looking for a Chess Practice Partner (Burak -> Cem)')
accepted_handshakes.append(handshake14)
print(f"  Accepted (pending completion): {burak_chess.title} (Burak -> Cem)")

pending1 = create_pending_interest(elif_tech, deniz, age_delta=timedelta(days=1), label='Elif -> Deniz')
pending2 = create_pending_interest(burak_guitar, deniz, age_delta=timedelta(hours=12), label='Burak -> Deniz')

handshake16, completed = simulate_handshake_workflow(
    selin_reading_circle, murat, provider_initiated_days_ago=18
)
handshake16 = expect_handshake_state(handshake16, completed, expected_completed=False, label='Slow Reading Circle for Curious Neighbors (Selin -> Murat)')
print(f"  Accepted (pending completion): {selin_reading_circle.title} (Selin -> Murat)")

handshake17, completed = simulate_handshake_workflow(
    selin_reading_circle, can, provider_initiated_days_ago=12, completed_days_ago=7
)
handshake17 = expect_handshake_state(handshake17, completed, expected_completed=True, label='Slow Reading Circle for Curious Neighbors (Selin -> Can)')
completed_handshakes.append(handshake17)
print(f"  Completed: {selin_reading_circle.title} (Selin -> Can)")
handshake16 = complete_seeded_handshake(handshake16, completed_days_ago=6)
completed_handshakes.append(handshake16)
print(f"  Completed: {selin_reading_circle.title} (Selin -> Murat)")

handshake18, completed = simulate_handshake_workflow(
    yasemin_coffee_offer, zeynep, provider_initiated_days_ago=9, completed_days_ago=6
)
handshake18 = expect_handshake_state(handshake18, completed, expected_completed=True, label='Coffee Rituals for Hosting Friends and Neighbors (Yasemin -> Zeynep)')
completed_handshakes.append(handshake18)
print(f"  Completed: {yasemin_coffee_offer.title} (Yasemin -> Zeynep)")

handshake19, completed = simulate_handshake_workflow(
    levent_singalong, murat, provider_initiated_days_ago=14, completed_days_ago=8
)
handshake19 = expect_handshake_state(handshake19, completed, expected_completed=True, label='Songs We Grew Up With: Shared Singing Hour (Levent -> Murat)')
completed_handshakes.append(handshake19)
print(f"  Completed: {levent_singalong.title} (Levent -> Murat)")

handshake20, completed = simulate_handshake_workflow(
    levent_museum_need, emre, provider_initiated_days_ago=7, completed_days_ago=3
)
handshake20 = expect_handshake_state(handshake20, completed, expected_completed=True, label='Need a Museum Morning Companion (Levent -> Emre)')
completed_handshakes.append(handshake20)
print(f"  Completed: {levent_museum_need.title} (Levent -> Emre)")

handshake21, completed = simulate_handshake_workflow(
    emre_orientation_walk, murat, provider_initiated_days_ago=6, completed_days_ago=2
)
handshake21 = expect_handshake_state(handshake21, completed, expected_completed=True, label='Ferry and Market Orientation Walk for New Neighbors (Emre -> Murat)')
completed_handshakes.append(handshake21)
print(f"  Completed: {emre_orientation_walk.title} (Emre -> Murat)")
sync_fixed_group_offer_time(emre_orientation_walk, now - timedelta(days=2, hours=1))

handshake22, completed = simulate_handshake_workflow(
    murat_boardgames_offer, selin, provider_initiated_days_ago=2
)
handshake22 = expect_handshake_state(handshake22, completed, expected_completed=False, label='Beginner-Friendly Board Game Evening (Murat -> Selin)')
accepted_handshakes.append(handshake22)
print(f"  Accepted (pending completion): {murat_boardgames_offer.title} (Murat -> Selin)")

handshake23, completed = simulate_handshake_workflow(
    murat_study_need, zeynep, provider_initiated_days_ago=1
)
handshake23 = expect_handshake_state(handshake23, completed, expected_completed=False, label='Looking for an Accountability Study Session (Murat -> Zeynep)')
accepted_handshakes.append(handshake23)
print(f"  Accepted (pending completion): {murat_study_need.title} (Murat -> Zeynep)")

handshake24, completed = simulate_handshake_workflow(
    selin_potluck_need, yasemin, provider_initiated_days_ago=3
)
handshake24 = expect_handshake_state(handshake24, completed, expected_completed=False, label='Looking for a Co-Host for a Neighborhood Potluck (Selin -> Yasemin)')
cancelled_handshakes.append(cancel_seeded_handshake(handshake24, cancelled_days_ago=1))
print(f"  Cancelled with refund: {selin_potluck_need.title} (Selin -> Yasemin)")

pending3 = create_pending_interest(emre_boardgames_need, burak, age_delta=timedelta(days=2), label='Emre -> Burak')
pending4 = create_pending_interest(yasemin_recipe_need, elif_user, age_delta=timedelta(hours=30), label='Yasemin -> Elif')
pending5 = create_pending_interest(murat_boardgames_offer, emre, age_delta=timedelta(hours=18), label='Murat -> Emre')

print("  Creating event participation...")
selin_event_1 = event_rsvp(selin_reading_event, elif_user, joined_days_ago=4)
selin_event_2 = event_rsvp(selin_reading_event, cem, joined_days_ago=3)
selin_event_3 = event_rsvp(selin_reading_event, murat, joined_days_ago=2)
event_handshakes.extend([selin_event_1, selin_event_2, selin_event_3])
upcoming_event_handshakes.extend([selin_event_1, selin_event_2, selin_event_3])

emre_event_1 = event_rsvp(emre_walk_event, can, joined_days_ago=3)
emre_event_2 = event_rsvp(emre_walk_event, zeynep, joined_days_ago=2)
emre_event_3 = event_rsvp(emre_walk_event, murat, joined_days_ago=1)
emre_event_1 = EventHandshakeService.checkin(emre_event_1, can)
emre_event_2 = EventHandshakeService.checkin(emre_event_2, zeynep)
event_handshakes.extend([emre_event_1, emre_event_2, emre_event_3])
upcoming_event_handshakes.extend([emre_event_1, emre_event_2, emre_event_3])

yasemin_event_1 = event_rsvp(yasemin_story_event, ayse, joined_days_ago=5)
yasemin_event_2 = event_rsvp(yasemin_story_event, selin, joined_days_ago=4)
yasemin_event_3 = event_rsvp(yasemin_story_event, mehmet, joined_days_ago=2)
event_handshakes.extend([yasemin_event_1, yasemin_event_2, yasemin_event_3])
upcoming_event_handshakes.extend([yasemin_event_1, yasemin_event_2, yasemin_event_3])

# Nearly-full event (75% capacity — 3 of 4 slots taken) — used to verify "Nearly Full" badge
elif_photo_event_1 = event_rsvp(elif_photo_event, cem, joined_days_ago=3)
elif_photo_event_2 = event_rsvp(elif_photo_event, ayse, joined_days_ago=2)
elif_photo_event_3 = event_rsvp(elif_photo_event, mehmet, joined_days_ago=1)
event_handshakes.extend([elif_photo_event_1, elif_photo_event_2, elif_photo_event_3])
upcoming_event_handshakes.extend([elif_photo_event_1, elif_photo_event_2, elif_photo_event_3])

Service.objects.filter(pk=levent_music_event.pk).update(scheduled_time=timezone.now() + timedelta(hours=10))
levent_music_event.refresh_from_db(fields=['scheduled_time'])
levent_event_1 = event_rsvp(levent_music_event, elif_user, joined_days_ago=7)
levent_event_2 = event_rsvp(levent_music_event, yasemin, joined_days_ago=6)
levent_event_3 = event_rsvp(levent_music_event, burak, joined_days_ago=5)
levent_event_4 = event_rsvp(levent_music_event, deniz, joined_days_ago=4)
levent_event_1 = EventHandshakeService.checkin(levent_event_1, elif_user)
levent_event_2 = EventHandshakeService.checkin(levent_event_2, yasemin)
levent_event_3 = EventHandshakeService.checkin(levent_event_3, burak)
levent_event_1 = EventHandshakeService.mark_attended(levent_event_1, levent)
levent_event_2 = EventHandshakeService.mark_attended(levent_event_2, levent)
levent_event_3 = EventHandshakeService.mark_attended(levent_event_3, levent)
EventHandshakeService.complete_event(levent_music_event, levent)
backdate_completed_event(levent_music_event, days_ago=5)
for handshake in [levent_event_1, levent_event_2, levent_event_3, levent_event_4]:
    handshake.refresh_from_db()
event_handshakes.extend([levent_event_1, levent_event_2, levent_event_3, levent_event_4])
attended_event_handshakes.extend([levent_event_1, levent_event_2, levent_event_3])
no_show_event_handshakes.append(levent_event_4)
print(f"  Completed event: {levent_music_event.title} (3 attended, 1 no-show)")

# ── New handshakes for new community-aligned services ─────────────────────────

handshake25, completed25 = simulate_handshake_workflow(
    mehmet_oral_history, yasemin, provider_initiated_days_ago=12, completed_days_ago=7
)
handshake25 = expect_handshake_state(handshake25, completed25, expected_completed=True, label='Oral History Recording for Elders (Mehmet -> Yasemin)')
completed_handshakes.append(handshake25)
print(f"  Completed: {mehmet_oral_history.title} (Mehmet -> Yasemin)")

handshake26, completed26 = simulate_handshake_workflow(
    zeynep_french, selin, provider_initiated_days_ago=7, completed_days_ago=3
)
handshake26 = expect_handshake_state(handshake26, completed26, expected_completed=True, label='French Conversation Hour for Curious Neighbors (Zeynep -> Selin)')
completed_handshakes.append(handshake26)
print(f"  Completed: {zeynep_french.title} (Zeynep -> Selin)")

handshake27, completed27 = simulate_handshake_workflow(
    deniz_bookbox, emre, provider_initiated_days_ago=1
)
handshake27 = expect_handshake_state(handshake27, completed27, expected_completed=False, label='Need Help Setting Up a Neighborhood Book Exchange Box (Deniz -> Emre)')
accepted_handshakes.append(handshake27)
print(f"  Accepted (pending completion): {deniz_bookbox.title} (Deniz -> Emre)")

handshake28, completed28 = simulate_handshake_workflow(
    elif_knitting, yasemin, provider_initiated_days_ago=2
)
handshake28 = expect_handshake_state(handshake28, completed28, expected_completed=False, label='Neighborhood Knitting and Conversation Circle (Elif -> Yasemin)')
accepted_handshakes.append(handshake28)
print(f"  Accepted (pending completion): {elif_knitting.title} (Elif -> Yasemin)")

handshake29, completed29 = simulate_handshake_workflow(
    emre_presentation, zeynep, provider_initiated_days_ago=0
)
handshake29 = expect_handshake_state(handshake29, completed29, expected_completed=False, label='Need Someone to Practice Presentation Skills With (Emre -> Zeynep)')
accepted_handshakes.append(handshake29)
print(f"  Accepted (pending completion): {emre_presentation.title} (Emre -> Zeynep)")

handshake30, completed30 = simulate_handshake_workflow(
    ayse_composting, deniz, provider_initiated_days_ago=3, completed_days_ago=1
)
handshake30 = expect_handshake_state(handshake30, completed30, expected_completed=True, label='Composting Basics for Apartment Dwellers (Ayşe -> Deniz)')
completed_handshakes.append(handshake30)
print(f"  Completed: {ayse_composting.title} (Ayşe -> Deniz)")

handshake31, completed31 = simulate_handshake_workflow(
    levent_vinyl, mehmet, provider_initiated_days_ago=5, completed_days_ago=2
)
handshake31 = expect_handshake_state(handshake31, completed31, expected_completed=True, label='Vinyl Listening Session and Music Stories (Levent -> Mehmet)')
completed_handshakes.append(handshake31)
print(f"  Completed: {levent_vinyl.title} (Levent -> Mehmet)")

pending6 = create_pending_interest(elif_knitting, zeynep, age_delta=timedelta(days=1), label='Elif Knitting -> Zeynep')
pending7 = create_pending_interest(can_zine, emre, age_delta=timedelta(hours=8), label='Can Zine -> Emre')
pending8 = create_pending_interest(selin_meditation, ayse, age_delta=timedelta(hours=16), label='Selin Meditation -> Ayse')

print("  Creating event participation for new events...")
potluck_rsvp_1 = event_rsvp(yasemin_potluck_event, elif_user, joined_days_ago=5)
potluck_rsvp_2 = event_rsvp(yasemin_potluck_event, selin, joined_days_ago=4)
potluck_rsvp_3 = event_rsvp(yasemin_potluck_event, mehmet, joined_days_ago=3)
potluck_rsvp_4 = event_rsvp(yasemin_potluck_event, levent, joined_days_ago=2)
potluck_rsvp_5 = event_rsvp(yasemin_potluck_event, ayse, joined_days_ago=1)
event_handshakes.extend([potluck_rsvp_1, potluck_rsvp_2, potluck_rsvp_3, potluck_rsvp_4, potluck_rsvp_5])
upcoming_event_handshakes.extend([potluck_rsvp_1, potluck_rsvp_2, potluck_rsvp_3, potluck_rsvp_4, potluck_rsvp_5])

openmic_rsvp_1 = event_rsvp(burak_openmic, cem, joined_days_ago=3)
openmic_rsvp_2 = event_rsvp(burak_openmic, levent, joined_days_ago=2)
openmic_rsvp_3 = event_rsvp(burak_openmic, elif_user, joined_days_ago=2)
openmic_rsvp_4 = event_rsvp(burak_openmic, can, joined_days_ago=1)
openmic_rsvp_5 = event_rsvp(burak_openmic, deniz, joined_days_ago=1)
event_handshakes.extend([openmic_rsvp_1, openmic_rsvp_2, openmic_rsvp_3, openmic_rsvp_4, openmic_rsvp_5])
upcoming_event_handshakes.extend([openmic_rsvp_1, openmic_rsvp_2, openmic_rsvp_3, openmic_rsvp_4, openmic_rsvp_5])

mending_rsvp_1 = event_rsvp(elif_mending, ayse, joined_days_ago=3)
mending_rsvp_2 = event_rsvp(elif_mending, yasemin, joined_days_ago=2)
mending_rsvp_3 = event_rsvp(elif_mending, selin, joined_days_ago=1)
mending_rsvp_4 = event_rsvp(elif_mending, zeynep, joined_days_ago=1)
event_handshakes.extend([mending_rsvp_1, mending_rsvp_2, mending_rsvp_3, mending_rsvp_4])
upcoming_event_handshakes.extend([mending_rsvp_1, mending_rsvp_2, mending_rsvp_3, mending_rsvp_4])

print(
    f"\n  Created {len(completed_handshakes)} completed, {len(accepted_handshakes)} accepted, "
    f"{len(pending_handshakes)} pending, {len(cancelled_handshakes)} cancelled handshakes "
    f"and {len(event_handshakes)} event participations"
)

print("\n[6/8] Adding reputation for completed handshakes...")

reputation_data = [
    (handshake1, cem, elif_user, True, True, True, "Elif was amazing! The manti workshop was so detailed and fun. Highly recommend!"),
    (handshake1, elif_user, cem, True, True, True, "Cem came prepared, asked thoughtful questions, and helped make the whole session feel collaborative."),
    (handshake2, mehmet, cem, True, True, False, "Cem is very knowledgeable and patient. Great introduction to genealogy research."),
    (handshake3, elif_user, ayse, True, True, True, "Ayşe's gardening workshop was fantastic! Learned so much about container gardening."),
    (handshake4, deniz, mehmet, True, True, True, "Mehmet was very patient teaching me smartphone basics. Very helpful!"),
    (handshake5, can, zeynep, True, True, True, "Zeynep is a great conversation partner. Our language exchange sessions are always enjoyable."),
    (handshake5, zeynep, can, True, True, True, "Can brought great curiosity and made the conversation easy to sustain. A very thoughtful exchange partner."),
    (handshake6, burak, can, True, False, True, "Can's photography tips were really helpful. Got some great shots of the Bosphorus!"),
    (handshake7, zeynep, elif_user, True, True, True, "Elif taught me to make perfect börek! The technique was easier than I thought."),
    (handshake8, burak, cem, True, True, False, "Cem is a good chess teacher. I'm improving my game strategy."),
    (handshake9, elif_user, mehmet, True, True, True, "Mehmet helped me trace my family history back three generations. Incredible work!"),
    (handshake10, mehmet, deniz, True, True, True, "Deniz was very patient and clear. Now I can use my smartphone confidently!"),
    (handshake10, deniz, mehmet, True, True, True, "Mehmet was curious, patient with the process, and made the session feel very worthwhile."),
    (handshake16, murat, selin, True, True, True, "Selin created such an easy atmosphere. I usually stay quiet in groups, but this circle felt welcoming from the start."),
    (handshake16, selin, murat, True, True, True, "Murat brought careful reflections and helped the group conversation go deeper without dominating it."),
    (handshake17, can, selin, True, True, True, "Thoughtful prompts, warm facilitation, and the kind of conversation that keeps you thinking afterward."),
    (handshake18, zeynep, yasemin, True, True, True, "Yasemin made the coffee practice feel both practical and personal. I left ready to host people more confidently."),
    (handshake18, yasemin, zeynep, True, True, True, "Zeynep was open, attentive, and brought lovely cultural questions into the session."),
    (handshake19, murat, levent, True, True, True, "Levent made the singing hour feel relaxed and welcoming, even for someone who mostly came to listen."),
    (handshake20, emre, levent, True, True, True, "Levent was a delightful museum companion and made space for slow conversation instead of rushing through exhibits."),
    (handshake20, levent, emre, True, True, True, "Emre was observant and generous with his time. It felt more like a shared morning than a guided outing."),
]

for handshake, giver, receiver, punctual, helpful, kind, comment in reputation_data:
    if handshake is None:
        continue
    create_verified_reputation(handshake, giver, receiver, punctual, helpful, kind, comment)

event_rep_1 = create_verified_reputation(
    levent_event_1,
    elif_user,
    levent,
    True,
    True,
    True,
    'Levent held the group together beautifully and made different generations feel equally welcome.'
)
levent.karma_score += 3
levent.save(update_fields=['karma_score'])

event_rep_2 = create_verified_reputation(
    levent_event_2,
    yasemin,
    levent,
    True,
    True,
    True,
    'This felt genuinely communal rather than performative. Levent kept the evening warm and inclusive.'
)
levent.karma_score += 3
levent.save(update_fields=['karma_score'])

create_negative_reputation(
    handshake=handshake8,
    giver=cem,
    receiver=burak,
    is_late=True,
    comment='Burak joined late and the session started well behind schedule, though he was friendly once he arrived.'
)
burak.karma_score -= 2
burak.save(update_fields=['karma_score'])

create_negative_reputation(
    handshake=levent_event_3,
    giver=burak,
    receiver=levent,
    is_unhelpful=True,
    comment='The music part was enjoyable, but the instructions for joining in were not always clear for newcomers.'
)
levent.karma_score -= 2
levent.save(update_fields=['karma_score'])

EventEvaluationService.refresh_summary(levent_music_event)

# ── Reputation for new completed handshakes ───────────────────────────────────

new_reputation_data = [
    (handshake25, yasemin, mehmet, True, True, True,
     "Mehmet was so gentle with my mother during the recording. He asked questions I would never have thought of and she opened up beautifully."),
    (handshake25, mehmet, yasemin, True, True, True,
     "Yasemin's family stories were deeply moving. It was a privilege to help preserve them."),
    (handshake26, selin, zeynep, True, True, True,
     "Zeynep made the French hour feel effortless. We talked about Paris markets and I forgot I was practicing."),
    (handshake26, zeynep, selin, True, True, True,
     "Selin brought such warmth to the conversation. Her French is better than she thinks."),
    (handshake30, deniz, ayse, True, True, True,
     "Ayşe explained composting so clearly that I set up my own bin the same evening. No smell at all."),
    (handshake30, ayse, deniz, True, True, True,
     "Deniz asked really practical questions and already sent me a photo of her working compost bin."),
    (handshake31, mehmet, levent, True, True, True,
     "Listening to Levent's records while he told the stories behind each track was like a private museum visit."),
    (handshake31, levent, mehmet, True, True, True,
     "Mehmet brought a record I hadn't heard in forty years. That alone made the evening."),
]

for handshake, giver, receiver, punctual, helpful, kind, comment in new_reputation_data:
    create_verified_reputation(handshake, giver, receiver, punctual, helpful, kind, comment)

public_chat_scenarios = [
    (
        elif_manti,
        timezone.now() - timedelta(days=4),
        [
            (cem, "Is this suitable if I've only made manti once before?"),
            (elif_user, "Absolutely. The whole point is to learn by doing together."),
            (zeynep, "Love that it's a small group. I learn better that way too."),
            (elif_user, "Same here. I want it to feel like neighbors cooking, not a class."),
        ],
    ),
    (
        selin_reading_circle,
        timezone.now() - timedelta(days=6),
        [
            (murat, "Do people usually prepare notes in advance?"),
            (selin, "Only if that helps. Listening closely is enough."),
            (can, "I might bring a short passage about memory and photography."),
            (selin, "That would fit beautifully."),
        ],
    ),
    (
        emre_orientation_walk,
        timezone.now() - timedelta(days=3),
        [
            (murat, "Would this still be useful if I've been here a few months already?"),
            (emre, "Definitely. It is as much about meeting neighbors as learning the route."),
            (zeynep, "I love the ferry-focused angle. Small practical details make a huge difference."),
        ],
    ),
    (
        yasemin_story_event,
        timezone.now() - timedelta(days=2),
        [
            (ayse, "Can we bring a recipe even if it is written from memory and not exact?"),
            (yasemin, "Please do. Those are usually the best stories."),
            (selin, "I am already looking forward to hearing everyone's family context around the recipes."),
        ],
    ),
    (
        elif_knitting,
        timezone.now() - timedelta(days=3),
        [
            (zeynep, "I have not knitted since I was a child. Is this really open to beginners?"),
            (elif_user, "Absolutely. Half the point is conversation, not perfection."),
            (yasemin, "I will bring extra needles in case anyone forgets theirs."),
            (elif_user, "That would be lovely. Tea is on me."),
        ],
    ),
    (
        ayse_composting,
        timezone.now() - timedelta(days=2),
        [
            (deniz, "Does it really not smell? My flatmate is skeptical."),
            (ayse, "If the ratio is right, it just smells like earth. I will show you."),
            (selin, "I have been curious about this for months. Finally someone offering it."),
        ],
    ),
    (
        levent_vinyl,
        timezone.now() - timedelta(days=4),
        [
            (mehmet, "I might bring my father's old Zeki Müren record if that is alright."),
            (levent, "That would be perfect. The stories behind the records matter as much as the music."),
            (burak, "Do you have a turntable or should someone bring one?"),
            (levent, "I have one. Just bring your ears and your stories."),
        ],
    ),
    (
        can_zine,
        timezone.now() - timedelta(days=1),
        [
            (emre, "Can I use phone photos or does it have to be a real camera?"),
            (can, "Phone photos are perfect. That is actually the whole idea."),
            (ayse, "I love the idea of a neighborhood zine. Would you share the result?"),
            (can, "I was thinking we could leave copies at the local coffee shop."),
        ],
    ),
]

for service, base_time, messages in public_chat_scenarios:
    add_public_chat_messages(service, messages, base_time)

group_chat_scenarios = [
    (
        selin_reading_event,
        timezone.now() - timedelta(days=1, hours=4),
        [
            (selin, "Thanks for joining. Feel free to bring one short passage that stayed with you recently."),
            (elif_user, "I have one about neighborhood memory and food."),
            (cem, "I can bring a poem if that still fits the format."),
            (selin, "Perfect. The goal is variety, not polish."),
        ],
    ),
    (
        emre_walk_event,
        timezone.now() - timedelta(hours=10),
        [
            (emre, "Weather looks good. Please wear comfortable shoes and bring water."),
            (can, "Will do. I might bring my camera too."),
            (zeynep, "I checked in already. Looking forward to meeting everyone."),
            (murat, "I have not done one of these before, but I am in."),
        ],
    ),
    (
        levent_music_event,
        timezone.now() - timedelta(days=6),
        [
            (levent, "No need to perform. Humming along is completely fine."),
            (elif_user, "That is reassuring. I mostly want to listen and join when I can."),
            (yasemin, "I can bring printed lyrics for a few songs."),
            (burak, "Happy to help keep the rhythm if needed."),
        ],
    ),
    (
        murat_boardgames_offer,
        timezone.now() - timedelta(hours=20),
        [
            (murat, "I am aiming for easy-to-learn games and a small group."),
            (burak, "That sounds ideal. I can bring tea and help explain one game too."),
        ],
    ),
    (
        yasemin_potluck_event,
        timezone.now() - timedelta(days=3),
        [
            (yasemin, "Everyone brings one dish and one story. No need to cook anything fancy."),
            (elif_user, "I am making a simple lentil salad. The story is about my grandmother's kitchen."),
            (selin, "I will bring bread and cheese from the Fatih market. Easy to share."),
            (mehmet, "Can I bring my wife's grape leaves? She insists."),
            (yasemin, "Of course. The more hands that touched the food, the better the evening."),
            (levent, "I will bring something sweet and a story about the bakery that used to be on our street."),
        ],
    ),
    (
        burak_openmic,
        timezone.now() - timedelta(days=2),
        [
            (burak, "Just a reminder: no pressure to perform. Coming to listen counts too."),
            (cem, "I might try reading a short poem if the mood is right."),
            (levent, "I can play a few old songs on guitar if there is a gap."),
            (elif_user, "I am coming to listen. That is my way of participating."),
            (can, "I might bring my camera if that is alright. Would love to capture the evening."),
            (burak, "Photos welcome, just keep it candid. No stage fright needed."),
        ],
    ),
    (
        elif_mending,
        timezone.now() - timedelta(days=1),
        [
            (elif_user, "Bring anything that needs a second life. Buttons, zippers, small tears."),
            (ayse, "I have a bag full of things I keep meaning to fix. Finally a reason."),
            (yasemin, "My daughter has a backpack with a broken strap. Can we fix that?"),
            (elif_user, "Definitely. I will bring extra thread and a few spare zippers."),
            (selin, "This is such a good idea. Less waste, more community."),
        ],
    ),
]

for service, base_time, messages in group_chat_scenarios:
    add_group_chat_messages(service, messages, base_time)

print("\n[7/8] Creating comments and forum content...")

print("  Service comments are not seeded (verified reviews come from completed exchanges only)")

default_forum_categories = [
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

forum_categories_by_slug = {}
for category_data in default_forum_categories:
    category = (
        ForumCategory.objects.filter(slug=category_data['slug']).first()
        or ForumCategory.objects.filter(name=category_data['name']).first()
    )
    if category is None:
        category = ForumCategory.objects.create(**category_data)
    forum_categories_by_slug[category_data['slug']] = category

forum_general = forum_categories_by_slug['general']
forum_tips = forum_categories_by_slug['tips']
forum_skills = forum_categories_by_slug['skills-learning']
forum_events = forum_categories_by_slug['community-events']
forum_success = forum_categories_by_slug['success-stories']
forum_feedback = forum_categories_by_slug['feedback-suggestions']

topics = [
    {
        'category': forum_general,
        'author': elif_user,
        'title': 'Welcome to The Hive!',
        'body': 'Hi everyone! Excited to be part of this community. Looking forward to sharing skills, meeting neighbors, and learning through small acts of mutual help.',
        'created_at': timezone.now() - timedelta(days=30),
        'is_pinned': True,
        'view_count': 118,
    },
    {
        'category': forum_general,
        'author': ayse,
        'title': 'Best neighborhoods for in-person meetups?',
        'body': 'What are your favorite spots in Istanbul for meeting up for services? Looking for safe, accessible, low-pressure locations where people can actually hear each other talk.',
        'created_at': timezone.now() - timedelta(days=25),
        'is_locked': True,
        'view_count': 84,
    },
    {
        'category': forum_tips,
        'author': mehmet,
        'title': 'Tips for first-time service providers',
        'body': 'For those new to the platform, here are some tips: be clear about expectations, communicate promptly, and leave enough room for the other person to shape the exchange too.',
        'created_at': timezone.now() - timedelta(days=20),
        'view_count': 76,
    },
    {
        'category': forum_success,
        'author': zeynep,
        'title': 'Language exchange success stories',
        'body': 'Had a great experience practicing Turkish with Can. The platform really works for language learning when both people arrive with curiosity instead of pressure.',
        'created_at': timezone.now() - timedelta(days=15),
        'view_count': 65,
    },
    {
        'category': forum_events,
        'author': selin,
        'title': 'What should people bring to the Sunday reading circle?',
        'body': 'I want the reading circle to feel open to shy newcomers. What makes it easier to join a gathering like this for the first time?',
        'created_at': timezone.now() - timedelta(days=6),
        'view_count': 39,
    },
    {
        'category': forum_events,
        'author': emre,
        'title': 'Planning a newcomer-friendly Bosphorus walk',
        'body': 'I am trying to make the route practical for people who are still figuring out ferry life and everyday navigation. Any suggestions for pacing or stops?',
        'created_at': timezone.now() - timedelta(days=4),
        'view_count': 41,
    },
    {
        'category': forum_skills,
        'author': yasemin,
        'title': 'How do you preserve recipe stories, not just ingredients?',
        'body': 'I have family recipe notes that make sense only because I know the people behind them. Curious how others preserve the context, memories, and voice too.',
        'created_at': timezone.now() - timedelta(days=9),
        'view_count': 58,
    },
    {
        'category': forum_feedback,
        'author': murat,
        'title': 'Could the platform surface smaller meetups more clearly?',
        'body': 'As a newcomer, I can find big events quickly, but I nearly missed small circles that might be better for building trust. Curious if others feel the same.',
        'created_at': timezone.now() - timedelta(days=3),
        'view_count': 33,
    },
    {
        'category': forum_success,
        'author': levent,
        'title': 'What made your most memorable Hive exchange feel different?',
        'body': 'Not asking about efficiency. I mean the moments when something felt genuinely human and stayed with you afterward.',
        'created_at': timezone.now() - timedelta(days=11),
        'view_count': 47,
    },
]

forum_topics = []
for spec in topics:
    topic = ForumTopic.objects.create(
        category=spec['category'],
        author=spec['author'],
        title=spec['title'],
        body=spec['body'],
        is_pinned=spec.get('is_pinned', False),
        is_locked=spec.get('is_locked', False),
        view_count=spec.get('view_count', 0),
    )
    ForumTopic.objects.filter(pk=topic.pk).update(created_at=spec['created_at'])
    forum_topics.append(topic)
    print(f"  Created forum topic: {spec['title']}")

posts_data = [
    (forum_topics[0], cem, "Welcome! Great to have you here.", timezone.now() - timedelta(days=29)),
    (forum_topics[0], ayse, "Looking forward to connecting!", timezone.now() - timedelta(days=28)),
    (forum_topics[1], elif_user, "Beşiktaş has great cafés near the ferry terminal.", timezone.now() - timedelta(days=24)),
    (forum_topics[1], can, "Kadıköy Moda area is perfect - lots of quiet spots.", timezone.now() - timedelta(days=23)),
    (forum_topics[2], zeynep, "Great tips! Communication is key.", timezone.now() - timedelta(days=19)),
    (forum_topics[2], deniz, "Thanks for sharing this!", timezone.now() - timedelta(days=18)),
    (forum_topics[3], elif_user, "That's wonderful! Language exchange is one of my favorite uses of the platform.", timezone.now() - timedelta(days=14)),
    (forum_topics[4], murat, "A sentence starter or optional prompt helps me a lot when I am new to a group.", timezone.now() - timedelta(days=5, hours=20)),
    (forum_topics[4], can, "Maybe invite people to bring something short enough to read aloud in under two minutes.", timezone.now() - timedelta(days=5, hours=14)),
    (forum_topics[4], selin, "That is exactly the tone I want. Thank you both.", timezone.now() - timedelta(days=5, hours=11)),
    (forum_topics[5], zeynep, "A midway tea stop might help quieter people connect without feeling trapped in one long walk.", timezone.now() - timedelta(days=3, hours=18)),
    (forum_topics[5], emre, "That is a great idea. I want the route to be social, not just scenic.", timezone.now() - timedelta(days=3, hours=12)),
    (forum_topics[6], mehmet, "I write down who told the story, where we were sitting, and what season it was. Those details matter later.", timezone.now() - timedelta(days=8, hours=16)),
    (forum_topics[6], yasemin, "That is beautiful. It is exactly the kind of context I am trying not to lose.", timezone.now() - timedelta(days=8, hours=10)),
    (forum_topics[7], selin, "Yes. Smaller gatherings are often where trust actually forms.", timezone.now() - timedelta(days=2, hours=22)),
    (forum_topics[7], ayse, "A filter for 'easy to join' or 'good for newcomers' could help too.", timezone.now() - timedelta(days=2, hours=12)),
    (forum_topics[8], elif_user, "For me it was when the conversation continued after the practical part was over.", timezone.now() - timedelta(days=10, hours=16)),
    (forum_topics[8], levent, "That is such a good way to put it. The exchange becomes memorable when no one is performing usefulness.", timezone.now() - timedelta(days=10, hours=8)),
]

for topic, author, body, created_at in posts_data:
    post = ForumPost.objects.create(
        topic=topic,
        author=author,
        body=body,
    )
    ForumPost.objects.filter(pk=post.pk).update(created_at=created_at)
    print(f"  Added forum post to: {topic.title[:30]}...")

# ── New forum topics and posts ────────────────────────────────────────────────

new_topics_data = [
    {
        'category': forum_success,
        'author': deniz,
        'title': 'My first composting workshop changed more than my kitchen',
        'body': 'I went to Ayşe\'s composting session mostly out of curiosity. Came home and set up a bin the same night. But the real takeaway was meeting three neighbors I see every day but never talked to. We now check in on each other\'s compost bins like they are pets.',
        'created_at': timezone.now() - timedelta(days=2),
        'view_count': 27,
    },
    {
        'category': forum_tips,
        'author': yasemin,
        'title': 'How to make a potluck feel welcoming instead of performative',
        'body': 'I have hosted a few community dinners and learned that the key is lowering the bar. Tell people they can bring bread and butter. Assign someone to greet first-timers at the door. Make the table setting imperfect on purpose. It signals that this is about presence, not presentation.',
        'created_at': timezone.now() - timedelta(days=1, hours=12),
        'view_count': 35,
    },
    {
        'category': forum_events,
        'author': burak,
        'title': 'Open mic night: what makes first-timers actually get on stage?',
        'body': 'I am organizing an open mic and I want it to feel safe for people who have never performed before. What helped you take the leap at a community event? Was it a friend in the audience, a warm host, or just the right amount of dimmed lights?',
        'created_at': timezone.now() - timedelta(days=1),
        'view_count': 22,
    },
    {
        'category': forum_skills,
        'author': elif_user,
        'title': 'Mending clothes together: what I learned about community repair',
        'body': 'I started a small repair cafe out of frustration with throwing things away. What surprised me is how personal it gets. People bring a torn jacket and end up talking about where they wore it, who gave it to them, why it matters. Fixing things becomes a way of telling stories.',
        'created_at': timezone.now() - timedelta(hours=18),
        'view_count': 41,
    },
]

new_forum_topics = []
for spec in new_topics_data:
    topic = ForumTopic.objects.create(
        category=spec['category'],
        author=spec['author'],
        title=spec['title'],
        body=spec['body'],
        is_pinned=spec.get('is_pinned', False),
        is_locked=spec.get('is_locked', False),
        view_count=spec.get('view_count', 0),
    )
    ForumTopic.objects.filter(pk=topic.pk).update(created_at=spec['created_at'])
    new_forum_topics.append(topic)
    print(f"  Created new forum topic: {spec['title'][:40]}...")

new_posts_data = [
    (new_forum_topics[0], ayse, "This makes me so happy. Composting is really just the excuse to start talking to your neighbors.", timezone.now() - timedelta(days=1, hours=20)),
    (new_forum_topics[0], emre, "I had a similar experience at Emre's walk. Sometimes the secondary effect of a meetup is the one that sticks.", timezone.now() - timedelta(days=1, hours=14)),
    (new_forum_topics[1], selin, "I always put out a few conversation starter cards on the table. It helps shy guests find an entry point.", timezone.now() - timedelta(days=1, hours=6)),
    (new_forum_topics[1], elif_user, "The imperfect table setting idea is brilliant. I want to try that at the mending cafe too.", timezone.now() - timedelta(hours=22)),
    (new_forum_topics[1], mehmet, "At my age I have learned that the best gatherings are the ones where nobody is trying too hard.", timezone.now() - timedelta(hours=16)),
    (new_forum_topics[2], levent, "When I hosted my singalong, I started by playing something everyone knows. That broke the ice.", timezone.now() - timedelta(hours=20)),
    (new_forum_topics[2], cem, "I would get on stage if there was a rule that everyone claps no matter what. Kindness over quality.", timezone.now() - timedelta(hours=14)),
    (new_forum_topics[2], can, "Having a host who goes first and is slightly imperfect really helps. It gives permission.", timezone.now() - timedelta(hours=8)),
    (new_forum_topics[3], yasemin, "This is exactly what happened at the recipe swap. The stories outlasted the food.", timezone.now() - timedelta(hours=12)),
    (new_forum_topics[3], selin, "I want to come to the next one. Repair as storytelling is such a beautiful frame.", timezone.now() - timedelta(hours=6)),
    (forum_topics[3], selin, "I had a lovely French conversation hour with Zeynep recently. She made me feel like my rusty French was actually charming.", timezone.now() - timedelta(days=3)),
    (forum_topics[8], mehmet, "The vinyl listening session with Levent. We sat and listened to a whole album side without checking phones. I had forgotten what that felt like.", timezone.now() - timedelta(days=2)),
]

for topic, author, body, created_at in new_posts_data:
    post = ForumPost.objects.create(
        topic=topic,
        author=author,
        body=body,
    )
    ForumPost.objects.filter(pk=post.pk).update(created_at=created_at)
    print(f"  Added new forum post to: {topic.title[:30]}...")

flagged_forum_post = ForumPost.objects.create(
    topic=forum_topics[5],
    author=burak,
    body='Posting a duplicate route list here because the earlier reply got buried.',
    is_deleted=True,
)
ForumPost.objects.filter(pk=flagged_forum_post.pk).update(created_at=timezone.now() - timedelta(days=3, hours=8))

print("\n[8/8] Assigning achievements and finalizing...")

for user in all_users:
    check_and_assign_badges(user)

featured_badge_priority = [
    'top-rated',
    'perfect-record',
    'trusted-member',
    'time-giver-bronze',
    'community-voice',
    'registered-1-year',
    'registered-6-months',
    'seniority',
    'first-service',
]
for user in all_users:
    earned_badges = set(UserBadge.objects.filter(user=user).values_list('badge_id', flat=True))
    for badge_id in featured_badge_priority:
        if badge_id in earned_badges:
            user.featured_achievement_id = badge_id
            user.save(update_fields=['featured_achievement_id'])
            break

print("  Done")

print("\n[9/10] Creating admin account...")
admin_email = 'moderator@demo.com'
admin_password = 'demo123'

existing_admin = User.objects.filter(email=admin_email).first()
if existing_admin:
    admin_user = existing_admin
    admin_user.first_name = 'Moderator'
    admin_user.last_name = 'Admin'
    admin_user.bio = 'Platform moderator and administrator'
    admin_user.avatar_url = dicebear_avatar('moderator')
    admin_user.banner_url = picsum_image('moderator-banner', 1200, 400)
    admin_user.location = 'Beyoğlu, Istanbul'
    admin_user.timebank_balance = Decimal('10.00')
    admin_user.karma_score = 100
    admin_user.role = 'admin'
    admin_user.is_staff = True
    admin_user.is_superuser = True
    admin_user.is_verified = True
    admin_user.is_onboarded = True
    admin_user.set_password(admin_password)
    admin_user.save()
    print(f"  Updated existing admin account")
else:
    admin_user = User.objects.create_superuser(
        email=admin_email,
        password=admin_password,
        first_name='Moderator',
        last_name='Admin',
        bio='Platform moderator and administrator',
        avatar_url=dicebear_avatar('moderator'),
        banner_url=picsum_image('moderator-banner', 1200, 400),
        location='Beyoğlu, Istanbul',
        timebank_balance=Decimal('10.00'),
        karma_score=100,
        role='admin',
        is_staff=True,
        is_superuser=True,
        is_verified=True,
        is_onboarded=True,
    )
admin_user.skills.set([technology_tag, education_tag])
print(f"  Prepared: {admin_email} (Admin account)")

print("\n[10/11] Creating super admin account...")
super_admin_email = 'superadmin@demo.com'
super_admin_password = 'demo123'

existing_super_admin = User.objects.filter(email=super_admin_email).first()
if existing_super_admin:
    super_admin_user = existing_super_admin
    super_admin_user.first_name = 'Super'
    super_admin_user.last_name = 'Admin'
    super_admin_user.bio = 'Platform super administrator with full access to all roles and settings.'
    super_admin_user.avatar_url = dicebear_avatar('superadmin')
    super_admin_user.banner_url = picsum_image('superadmin-banner', 1200, 400)
    super_admin_user.location = 'Beşiktaş, Istanbul'
    super_admin_user.timebank_balance = Decimal('10.00')
    super_admin_user.karma_score = 200
    super_admin_user.role = 'super_admin'
    super_admin_user.is_staff = True
    super_admin_user.is_superuser = True
    super_admin_user.is_verified = True
    super_admin_user.is_onboarded = True
    super_admin_user.set_password(super_admin_password)
    super_admin_user.save()
    print(f"  Updated existing super admin account")
else:
    super_admin_user = User.objects.create_superuser(
        email=super_admin_email,
        password=super_admin_password,
        first_name='Super',
        last_name='Admin',
        bio='Platform super administrator with full access to all roles and settings.',
        avatar_url=dicebear_avatar('superadmin'),
        banner_url=picsum_image('superadmin-banner', 1200, 400),
        location='Beşiktaş, Istanbul',
        timebank_balance=Decimal('10.00'),
        karma_score=200,
        role='super_admin',
        is_staff=True,
        is_superuser=True,
        is_verified=True,
        is_onboarded=True,
    )
super_admin_user.skills.set([technology_tag, education_tag])
print(f"  Prepared: {super_admin_email} (Super Admin account)")

print("\n[11/11] Creating admin-testable data (reports + audit logs)...")

# ── Reports ──────────────────────────────────────────────────────────────────

report1 = Report.objects.create(
    reporter=burak,
    reported_user=cem,
    reported_service=cem_chess_offer,
    type='inappropriate_content',
    status='pending',
    description='The service description is misleading — what was offered during the session had nothing to do with the listed title. I felt uncomfortable and left early.',
)
Report.objects.filter(pk=report1.pk).update(created_at=timezone.now() - timedelta(days=3))

report2 = Report.objects.create(
    reporter=can,
    reported_user=burak,
    type='harassment',
    status='pending',
    description='After I declined their service request I started receiving repeated unsolicited messages. The tone became aggressive and threatening. Please look into this.',
)
Report.objects.filter(pk=report2.pk).update(created_at=timezone.now() - timedelta(days=1))

report3 = Report.objects.create(
    reporter=deniz,
    reported_service=burak_chess,
    reported_user=burak,
    type='spam',
    status='pending',
    description='This listing is an almost word-for-word copy of another listing from the same user. Appears to be duplicate spam to game the search ranking.',
)
Report.objects.filter(pk=report3.pk).update(created_at=timezone.now() - timedelta(days=5))

report4 = Report.objects.create(
    reporter=mehmet,
    reported_user=elif_user,
    reported_service=elif_manti,
    type='service_issue',
    status='resolved',
    description='The cooking session was significantly shorter than the advertised 3 hours. We finished in under 90 minutes and some promised content was skipped.',
    admin_notes='Reviewed chat logs and both users confirmed a mutual agreement to shorten the session due to a scheduling conflict on the requester\'s side. No misconduct found — both parties are satisfied. Closing as resolved.',
    resolved_by=admin_user,
    resolved_at=timezone.now() - timedelta(days=2),
)
Report.objects.filter(pk=report4.pk).update(created_at=timezone.now() - timedelta(days=7))

report5 = Report.objects.create(
    reporter=zeynep,
    reported_user=deniz,
    type='scam',
    status='dismissed',
    description='User asked me to pay outside the platform for an "extended" session. Felt like a scam attempt.',
    admin_notes='Investigated the user\'s exchange history. No payment was requested or made. The "extended session" was a misunderstood offer for additional free help. Report dismissed.',
    resolved_by=admin_user,
    resolved_at=timezone.now() - timedelta(days=10),
)
Report.objects.filter(pk=report5.pk).update(created_at=timezone.now() - timedelta(days=12))

report6 = Report.objects.create(
    reporter=selin,
    reported_user=burak,
    reported_forum_post=flagged_forum_post,
    type='spam',
    status='resolved',
    description='Burak reposted the same route information multiple times in the event planning thread, which started to drown out newer replies.',
    admin_notes='Confirmed duplicate posting behavior. Removed the duplicate reply and sent a reminder about avoiding repetitive forum posts.',
    resolved_by=admin_user,
    resolved_at=timezone.now() - timedelta(days=1),
)
Report.objects.filter(pk=report6.pk).update(created_at=timezone.now() - timedelta(days=2))

report7 = Report.objects.create(
    reporter=deniz,
    reported_user=levent,
    reported_service=levent_music_event,
    related_handshake=levent_event_4,
    type='no_show',
    status='pending',
    description='I was marked as a no-show for the singalong after arriving late because I misunderstood the courtyard entrance. I would like the organizer to review that decision.',
)
Report.objects.filter(pk=report7.pk).update(created_at=timezone.now() - timedelta(hours=18))

print(f"  Created 7 test reports (4 pending, 2 resolved, 1 dismissed)")

# ── Audit Logs ───────────────────────────────────────────────────────────────

now = timezone.now()
AdminAuditLog.objects.bulk_create([
    AdminAuditLog(
        admin=admin_user,
        action_type='warn_user',
        target_entity='user',
        target_id=burak.id,
        reason='Multiple community members reported aggressive follow-up messages. Issued formal warning and reminded of platform code of conduct.',
        created_at=now - timedelta(days=8),
    ),
    AdminAuditLog(
        admin=admin_user,
        action_type='adjust_karma',
        target_entity='user',
        target_id=can.id,
        reason='Manually corrected karma score (+10) after a system error failed to record three completed exchanges from last month.',
        created_at=now - timedelta(days=5),
    ),
    AdminAuditLog(
        admin=admin_user,
        action_type='resolve_report',
        target_entity='report',
        target_id=report4.id,
        reason='Reviewed evidence and closed service_issue report. Both parties confirmed mutual agreement. No policy violation.',
        created_at=now - timedelta(days=2),
    ),
    AdminAuditLog(
        admin=admin_user,
        action_type='lock_topic',
        target_entity='forum_topic',
        target_id=forum_topics[1].id,
        reason='Thread derailed into off-topic arguments. Locked after moderator warning was ignored by participants.',
        created_at=now - timedelta(days=14),
    ),
    AdminAuditLog(
        admin=admin_user,
        action_type='pin_topic',
        target_entity='forum_topic',
        target_id=forum_topics[0].id,
        reason='Pinned welcome thread to top of General Discussion for better visibility for new members.',
        created_at=now - timedelta(days=20),
    ),
    AdminAuditLog(
        admin=admin_user,
        action_type='resolve_report',
        target_entity='report',
        target_id=report6.id,
        reason='Resolved forum spam report and documented removal of duplicate post in event planning thread.',
        created_at=now - timedelta(days=1),
    ),
    AdminAuditLog(
        admin=admin_user,
        action_type='warn_user',
        target_entity='user',
        target_id=deniz.id,
        reason='Issued gentle warning after repeated last-minute cancellations and one unresolved no-show appeal required moderation follow-up.',
        created_at=now - timedelta(hours=12),
    ),
])

print(f"  Created 7 audit log entries")

# ══════════════════════════════════════════════════════════════════════════════
# DEMO SCENARIO: April 23rd Children's Festival (pre-seeded at 3 lifecycle stages)
# ══════════════════════════════════════════════════════════════════════════════
print("\n[DEMO] Seeding April 23rd Festival scenario events...")

FESTIVAL_TITLE = 'April 23rd Children\'s Festival in the Park'
FESTIVAL_DESC = (
    'A neighborhood festival for families to celebrate together! '
    'We will play traditional street games like sack races and tug-of-war, '
    'have face painting for the kids, and share tea and snacks. '
    'Everyone pitches in — this is a community effort (imece). '
    'Bring your kids, your energy, and something to share!'
)
FESTIVAL_IMG = 'https://images.unsplash.com/photo-1472162072942-cd5147eb3902?auto=format&fit=crop&w=800&h=600&q=80'
FESTIVAL_LAT = Decimal('41.1080')
FESTIVAL_LNG = Decimal('28.9680')

# ── Event 1: CHECK-IN READY (Scene 2 — 24h lockdown window open) ──────────
# scheduled_time = 30 min from now → inside lockdown, before start
demo_fest_checkin = Service.objects.create(
    user=zeynep,
    title=FESTIVAL_TITLE,
    description=FESTIVAL_DESC,
    type='Event',
    duration=Decimal('3.00'),
    location_type='In-Person',
    location_area='Eyüpsultan',
    location_lat=FESTIVAL_LAT,
    location_lng=FESTIVAL_LNG,
    max_participants=20,
    schedule_type='One-Time',
    scheduled_time=now + timedelta(minutes=30),
    schedule_details='At the wide grassy area in the middle of the park, 14:00',
    status='Active',
    created_at=now - timedelta(days=8),
)
demo_fest_checkin.tags.set([education_tag, sports_tag])
ServiceMedia.objects.create(
    service=demo_fest_checkin, media_type='image',
    file_url=FESTIVAL_IMG, display_order=0,
)
# Ayse, Burak, Cem joined
for participant in [ayse, burak, cem]:
    h = EventHandshakeService.join_event(demo_fest_checkin, participant)
    Handshake.objects.filter(pk=h.pk).update(
        created_at=now - timedelta(days=5),
        updated_at=now - timedelta(days=5),
    )
# Group chat messages (imece conversation)
add_group_chat_messages(demo_fest_checkin, [
    (ayse, "I will bring the face painting supplies — I can paint the kids' faces!"),
    (burak, "Great, I am coming with my car. I will get the sack race and tug-of-war materials from the warehouse."),
    (cem, "We will take care of tea and plastic cups for everyone on our way."),
    (zeynep, "Wonderful teamwork! See you at the wide grassy area in the middle of the park at 14:00."),
], now - timedelta(days=4))
print(f"  Created: {demo_fest_checkin.title} (check-in ready, 30 min from now)")

# ── Event 2: READY TO CLOSE (Scene 4 — event happened, organizer can close) ─
# scheduled_time = 3h ago → event happened, Ayse+Burak checked in, Cem did not
demo_fest_close = Service.objects.create(
    user=zeynep,
    title=FESTIVAL_TITLE,
    description=FESTIVAL_DESC,
    type='Event',
    duration=Decimal('3.00'),
    location_type='In-Person',
    location_area='Eyüpsultan',
    location_lat=FESTIVAL_LAT,
    location_lng=FESTIVAL_LNG,
    max_participants=20,
    schedule_type='One-Time',
    scheduled_time=now - timedelta(hours=3),
    schedule_details='At the wide grassy area in the middle of the park, 14:00',
    status='Active',
    created_at=now - timedelta(days=8),
)
demo_fest_close.tags.set([education_tag, sports_tag])
ServiceMedia.objects.create(
    service=demo_fest_close, media_type='image',
    file_url=FESTIVAL_IMG, display_order=0,
)
# Directly create handshakes (bypassing join_event since scheduled_time is past)
for participant in [ayse, burak, cem]:
    Handshake.objects.create(
        service=demo_fest_close, requester=participant,
        status='accepted', provisioned_hours=0,
        scheduled_time=demo_fest_close.scheduled_time,
        created_at=now - timedelta(days=5),
        updated_at=now - timedelta(days=5),
    )
for participant in [ayse, burak]:
    Handshake.objects.filter(
        service=demo_fest_close, requester=participant,
    ).update(status='checked_in', updated_at=now - timedelta(hours=4))
# Group chat with Cem's apology
add_group_chat_messages(demo_fest_close, [
    (ayse, "I will bring the face painting supplies — I can paint the kids' faces!"),
    (burak, "Great, I am coming with my car. I will get the sack race and tug-of-war materials from the warehouse."),
    (cem, "We will take care of tea and plastic cups for everyone on our way."),
    (zeynep, "Wonderful teamwork! See you at the wide grassy area in the middle of the park at 14:00."),
    (cem, "I am so sorry everyone. My son got a fever last night, we will not be able to make it to the park tomorrow. Happy holidays!"),
    (zeynep, "Get well soon Cem, health comes first."),
], now - timedelta(days=4))
print(f"  Created: {demo_fest_close.title} (ready to close, Ayse+Burak checked in, Cem not)")

# ── Event 3: COMPLETED (Scene 5 — event completed, evaluation window open) ───
demo_fest_done = Service.objects.create(
    user=zeynep,
    title=FESTIVAL_TITLE,
    description=FESTIVAL_DESC,
    type='Event',
    duration=Decimal('3.00'),
    location_type='In-Person',
    location_area='Eyüpsultan',
    location_lat=FESTIVAL_LAT,
    location_lng=FESTIVAL_LNG,
    max_participants=20,
    schedule_type='One-Time',
    scheduled_time=now - timedelta(hours=4),
    schedule_details='At the wide grassy area in the middle of the park, 14:00',
    status='Active',
    created_at=now - timedelta(days=8),
)
demo_fest_done.tags.set([education_tag, sports_tag])
ServiceMedia.objects.create(
    service=demo_fest_done, media_type='image',
    file_url=FESTIVAL_IMG, display_order=0,
)
# Directly create handshakes and set final states (bypassing service layer)
for participant in [ayse, burak, cem]:
    Handshake.objects.create(
        service=demo_fest_done, requester=participant,
        status='accepted', provisioned_hours=0,
        scheduled_time=demo_fest_done.scheduled_time,
        created_at=now - timedelta(days=5),
        updated_at=now - timedelta(days=5),
    )
# Mark Ayse + Burak as attended
Handshake.objects.filter(
    service=demo_fest_done, requester__in=[ayse, burak],
).update(status='attended', updated_at=now - timedelta(minutes=30))
# Mark Cem as no_show
Handshake.objects.filter(
    service=demo_fest_done, requester=cem,
).update(status='no_show', updated_at=now - timedelta(minutes=30))
# Complete the event and set evaluation windows
completion_time = now - timedelta(minutes=30)
window_end = completion_time + timedelta(hours=48)
Service.objects.filter(pk=demo_fest_done.pk).update(
    status='Completed', event_completed_at=completion_time,
)
Handshake.objects.filter(
    service=demo_fest_done, status='attended',
).update(
    evaluation_window_starts_at=completion_time,
    evaluation_window_ends_at=window_end,
    evaluation_window_closed_at=None,
)
demo_fest_done.refresh_from_db()
# Group chat
add_group_chat_messages(demo_fest_done, [
    (ayse, "I will bring the face painting supplies — I can paint the kids' faces!"),
    (burak, "Great, I am coming with my car. I will get the sack race and tug-of-war materials from the warehouse."),
    (cem, "We will take care of tea and plastic cups for everyone on our way."),
    (zeynep, "Wonderful teamwork! See you at the wide grassy area in the middle of the park at 14:00."),
    (cem, "I am so sorry everyone. My son got a fever last night, we will not be able to make it to the park tomorrow. Happy holidays!"),
    (zeynep, "Get well soon Cem, health comes first."),
], now - timedelta(days=4))
print(f"  Created: {demo_fest_done.title} (completed, Ayse+Burak attended, Cem no-show, evaluation window open)")

print("\n" + "=" * 60)
print("Demo setup complete!")
print("=" * 60)
print(f"\nSummary:")
print(f"  Users: {len(all_users) + 1}")
print(f"  Services: {len(services)}")
print(f"  Service Media: {ServiceMedia.objects.count()}")
print(f"  Completed Handshakes: {len(completed_handshakes)}")
print(f"  Accepted Handshakes: {len(accepted_handshakes)}")
print(f"  Pending Handshakes: {len(pending_handshakes)}")
print(f"  Cancelled Handshakes: {len(cancelled_handshakes)}")
print(f"  Event Participations: {len(event_handshakes)} ({len(attended_event_handshakes)} attended, {len(no_show_event_handshakes)} no-show)")
print(f"  Private Chat Messages: {ChatMessage.objects.filter(handshake__in=completed_handshakes + accepted_handshakes + pending_handshakes + cancelled_handshakes).count()}")
print(f"  Public Chat Messages: {PublicChatMessage.objects.count()}")
print(f"  Group Chat Messages: {ServiceGroupChatMessage.objects.count()}")
print(f"  Comments: {Comment.objects.count()}")
print(f"  Reputation Entries: {ReputationRep.objects.count()}")
print(f"  Negative Reputation Entries: {NegativeRep.objects.count()}")
print(f"  Badges Awarded: {UserBadge.objects.count()}")
print(f"  Forum Topics: {ForumTopic.objects.count()}")
print(f"  Forum Posts: {ForumPost.objects.count()}")
print(f"  Reports: {Report.objects.count()} ({Report.objects.filter(status='pending').count()} pending)")
print(f"  Audit Logs: {AdminAuditLog.objects.count()}")
print(f"\nDemo Accounts (password: demo123):")
print(f"  Admin:   {admin_email} / {admin_password}")
for user in all_users:
    print(f"  {user.first_name} {user.last_name}: {user.email} (Balance: {user.timebank_balance}h, Karma: {user.karma_score})")
print("\n" + "=" * 60)
