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
    Report, AdminAuditLog, ServiceMedia,
)
from api.achievement_utils import check_and_assign_badges
from api.services import HandshakeService
from api.utils import provision_timebank, complete_timebank_transfer, get_provider_and_receiver, create_notification
from django.contrib.auth.hashers import make_password
from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from datetime import timedelta
import random

print("=" * 60)
print("The Hive - Enhanced Demo Data Setup")
print("=" * 60)

print("\n[1/8] Cleaning up existing demo data...")

demo_emails = [
    'elif@demo.com', 'cem@demo.com', 'ayse@demo.com',
    'mehmet@demo.com', 'zeynep@demo.com', 'can@demo.com',
    'deniz@demo.com', 'burak@demo.com'
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

def dicebear_avatar(seed):
    return f"https://api.dicebear.com/9.x/avataaars/png?seed={seed}"


def picsum_image(seed, width, height):
    return f"https://picsum.photos/seed/{seed}/{width}/{height}"


def semantic_service_image(service, width=800, height=600):
    title = service.title.lower()
    semantic_presets = [
        (('manti', 'börek', 'coffee', 'cooking'), ('turkish-food,cooking', 101)),
        (('guitar', 'music'), ('guitar,music', 102)),
        (('jogging', 'running', 'sports'), ('running,fitness', 103)),
        (('watercolor', 'painting', 'art'), ('painting,art', 104)),
        (('gardening', 'plant', 'balcony'), ('gardening,plants', 105)),
        (('photography', 'camera', 'photo'), ('photography,camera', 106)),
        (('chess',), ('chess,board-game', 107)),
        (('language', 'english', 'turkish', 'french'), ('language,conversation', 108)),
        (('genealogy', 'history', 'archive'), ('books,history', 109)),
        (('smartphone', 'tech', 'app', 'printer'), ('technology,devices', 110)),
    ]

    category = 'community,workshop'
    lock = 199
    for keywords, preset in semantic_presets:
        if any(keyword in title for keyword in keywords):
            category, lock = preset
            break

    return f"https://loremflickr.com/{width}/{height}/{category}?lock={lock}"


def is_fixed_group_offer(service):
    return (
        service.type == 'Offer'
        and service.schedule_type == 'One-Time'
        and service.max_participants > 1
    )


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
    Decimal('7.00'), 35, date_joined_offset_days=45,
    avatar_url=dicebear_avatar('elif'),
    banner_url=picsum_image('elif-banner', 1200, 400),
    location='Beşiktaş, Istanbul',
)

cem = create_or_update_user(
    'cem@demo.com', 'Cem', 'Demir',
    'University student in Kadıköy passionate about chess and genealogy research. Always happy to teach beginners and help trace family histories!',
    Decimal('4.00'), 18, date_joined_offset_days=30,
    avatar_url=dicebear_avatar('cem'),
    banner_url=picsum_image('cem-banner', 1200, 400),
    location='Kadıköy, Istanbul',
)

ayse = create_or_update_user(
    'ayse@demo.com', 'Ayşe', 'Kaya',
    'Gardening enthusiast and community organizer in Üsküdar. Passionate about sustainable living and urban farming. Love sharing knowledge about growing food in small spaces!',
    Decimal('7.00'), 42, date_joined_offset_days=60,
    avatar_url=dicebear_avatar('ayse'),
    banner_url=picsum_image('ayse-banner', 1200, 400),
    location='Üsküdar, Istanbul',
)

mehmet = create_or_update_user(
    'mehmet@demo.com', 'Mehmet', 'Özkan',
    'Retired teacher living in Şişli. I help neighbors navigate family archives, local history, and everyday digital tasks with patience and care.',
    Decimal('9.00'), 55, date_joined_offset_days=90,
    avatar_url=dicebear_avatar('mehmet'),
    banner_url=picsum_image('mehmet-banner', 1200, 400),
    location='Şişli, Istanbul',
)

zeynep = create_or_update_user(
    'zeynep@demo.com', 'Zeynep', 'Arslan',
    'Language teacher and cultural exchange enthusiast. Fluent in Turkish, English, and French. Love connecting people through language and helping others practice conversation in a friendly, relaxed setting.',
    Decimal('9.00'), 68, date_joined_offset_days=75,
    avatar_url=dicebear_avatar('zeynep'),
    banner_url=picsum_image('zeynep-banner', 1200, 400),
    location='Beyoğlu, Istanbul',
)

can = create_or_update_user(
    'can@demo.com', 'Can', 'Şahin',
    'Photography hobbyist based in Beşiktaş. I enjoy community photo walks, documenting neighborhood stories, and helping others feel confident behind the camera.',
    Decimal('6.00'), 28, date_joined_offset_days=25,
    avatar_url=dicebear_avatar('can'),
    banner_url=picsum_image('can-banner', 1200, 400),
    location='Beşiktaş, Istanbul',
)

deniz = create_or_update_user(
    'deniz@demo.com', 'Deniz', 'Aydın',
    'Tech-savvy professional in Kadıköy. Enjoy helping others with smartphones, apps, and basic tech troubleshooting. Patient teacher for all skill levels!',
    Decimal('5.00'), 22, date_joined_offset_days=20,
    avatar_url=dicebear_avatar('deniz'),
    banner_url=picsum_image('deniz-banner', 1200, 400),
    location='Kadıköy, Istanbul',
)

burak = create_or_update_user(
    'burak@demo.com', 'Burak', 'Kurt',
    'Chess player and music lover. I like low-pressure skill swaps, practice sessions, and small group meetups where everyone leaves having learned something useful.',
    Decimal('5.00'), 15, date_joined_offset_days=15,
    avatar_url=dicebear_avatar('burak'),
    banner_url=picsum_image('burak-banner', 1200, 400),
    location='Kadıköy, Istanbul',
)

all_users = [elif_user, cem, ayse, mehmet, zeynep, can, deniz, burak]

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
}
user_portfolio_map = {
    'elif@demo.com': [
        picsum_image('elif-portfolio-1', 600, 400),
        picsum_image('elif-portfolio-2', 600, 400),
    ],
    'ayse@demo.com': [
        picsum_image('ayse-portfolio-1', 600, 400),
        picsum_image('ayse-portfolio-2', 600, 400),
        picsum_image('ayse-portfolio-3', 600, 400),
    ],
    'can@demo.com': [
        picsum_image('can-portfolio-1', 600, 400),
        picsum_image('can-portfolio-2', 600, 400),
    ],
    'zeynep@demo.com': [
        picsum_image('zeynep-portfolio-1', 600, 400),
    ],
}

for user in all_users:
    user.skills.set(user_skill_map[user.email])
    user.portfolio_images = user_portfolio_map.get(user.email, [])
    user.save(update_fields=['portfolio_images'])

services = []
now = timezone.now()

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
    title='Help Setting Up a Shared 3D Printer',
    description='Our small building makers group got a 3D printer, and I need help getting it calibrated so more neighbors can use it for signs, labels, and simple repair parts.',
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
    schedule_type='Recurrent',
    schedule_details='Every Sunday at 15:00',
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
    schedule_type='Recurrent',
    schedule_details='Every Wednesday at 20:00',
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
    title='Looking for a Weekly Chess Practice Partner',
    description='I am looking for steady, friendly practice games where we can talk through moves and keep each other improving over time. Casual and community-minded is ideal.',
    type='Need',
    duration=Decimal('1.00'),
    location_type='In-Person',
    location_area='Kadıköy',
    location_lat=Decimal('40.9819'),
    location_lng=Decimal('29.0244'),
    max_participants=1,
    schedule_type='Recurrent',
    schedule_details='Every Friday evening',
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
    schedule_type='Recurrent',
    schedule_details='Weekdays at 07:00',
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

print(f"\n  Created {len(services)} services")

print("  Adding service cover images...")
service_media_specs = [
    elif_manti,
    elif_borek,
    ayse_gardening,
    can_photography,
    burak_guitar,
    deniz_jogging,
    ayse_watercolor,
]
for service in service_media_specs:
    ServiceMedia.objects.create(
        service=service,
        media_type='image',
        file_url=semantic_service_image(service),
        display_order=0,
    )
print(f"  Added {len(service_media_specs)} service cover images")

print("\n[5/8] Creating handshakes and completing workflows...")

def simulate_handshake_workflow(service, requester, provider_initiated_days_ago=0, completed_days_ago=None):
    """Complete handshake lifecycle through proper system workflows"""
    try:
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
            handshake.exact_location = service.location_area
            handshake.exact_duration = service.duration
            handshake.scheduled_time = service.scheduled_time
        else:
            handshake.exact_location = exact_locations.get(service.location_area, f'{service.location_area} area')
            handshake.exact_duration = service.duration
            handshake.scheduled_time = timezone.now() + timedelta(days=3)
        handshake.updated_at = created_at_time + timedelta(hours=2)
        handshake.save()
        
        provision_timebank(handshake)
        handshake.status = 'accepted'
        handshake.requester_initiated = True
        handshake.updated_at = created_at_time + timedelta(hours=4)
        handshake.save()

        # Mirror accept_handshake view logic:
        # Only when all slots are filled do we deny remaining pending handshakes
        # and transition the service to Agreed. Recurrent stays Active.
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
            completion_time = timezone.now() - timedelta(days=completed_days_ago)
            with transaction.atomic():
                handshake.provider_confirmed_complete = True
                handshake.receiver_confirmed_complete = True
                handshake.updated_at = completion_time
                # Don't set status='completed' before complete_timebank_transfer —
                # the function exits early (idempotency guard) if status is already
                # 'completed', skipping the service-status update logic.
                handshake.save()
                complete_timebank_transfer(handshake)

                # After transfer, manually back-date the timestamps
                Handshake.objects.filter(pk=handshake.pk).update(updated_at=completion_time)

                # Sync service status: One-Time services should become 'Completed'
                # when no active handshakes remain (mirrors utils.py logic).
                svc = Service.objects.get(pk=service.pk)
                if svc.schedule_type == 'One-Time':
                    active_count = Handshake.objects.filter(
                        service=svc,
                        status__in=['pending', 'accepted', 'reported', 'paused'],
                    ).count()
                    if active_count == 0 and svc.status != 'Completed':
                        svc.status = 'Completed'
                        svc.save(update_fields=['status'])

            check_and_assign_badges(provider)
            check_and_assign_badges(receiver)

            return handshake, True
        
        return handshake, False
    except Exception as e:
        print(f"    Error creating handshake: {e}")
        import traceback
        traceback.print_exc()
        return None, False


def sync_fixed_group_offer_time(service, scheduled_time):
    """Backdate the demo-facing session time after seed workflows are created."""
    Service.objects.filter(pk=service.pk).update(scheduled_time=scheduled_time)
    Handshake.objects.filter(
        service=service,
        status__in=['pending', 'accepted', 'completed', 'reported', 'paused'],
    ).update(
        scheduled_time=scheduled_time,
        exact_location=service.location_area,
        exact_duration=service.duration,
    )
    service.refresh_from_db(fields=['scheduled_time'])

completed_handshakes = []
accepted_handshakes = []
pending_handshakes = []

# Create Zeynep's accepted handshake for Manti BEFORE completing Cem's,
# otherwise the service transitions to 'Completed' and blocks new handshakes.
handshake15, completed = simulate_handshake_workflow(
    elif_manti, zeynep, provider_initiated_days_ago=1
)
if handshake15 and not completed:
    accepted_handshakes.append(handshake15)
    print(f"  Accepted (pending completion): {elif_manti.title} (Elif -> Zeynep)")

handshake1, completed = simulate_handshake_workflow(
    elif_manti, cem, provider_initiated_days_ago=15, completed_days_ago=10
)
if handshake1 and completed:
    completed_handshakes.append(handshake1)
    print(f"  Completed: {elif_manti.title} (Elif -> Cem)")
if handshake15 or handshake1:
    sync_fixed_group_offer_time(elif_manti, manti_demo_time)

handshake2, completed = simulate_handshake_workflow(
    cem_genealogy, mehmet, provider_initiated_days_ago=10, completed_days_ago=5
)
if handshake2 and completed:
    completed_handshakes.append(handshake2)
    print(f"  Completed: {cem_genealogy.title} (Cem -> Mehmet)")

handshake3, completed = simulate_handshake_workflow(
    ayse_gardening, elif_user, provider_initiated_days_ago=6, completed_days_ago=2
)
if handshake3 and completed:
    completed_handshakes.append(handshake3)
    print(f"  Completed: {ayse_gardening.title} (Ayşe -> Elif)")
if handshake3:
    sync_fixed_group_offer_time(ayse_gardening, gardening_demo_time)

handshake4, completed = simulate_handshake_workflow(
    mehmet_tech, deniz, provider_initiated_days_ago=4, completed_days_ago=1
)
if handshake4 and completed:
    completed_handshakes.append(handshake4)
    print(f"  Completed: {mehmet_tech.title} (Mehmet -> Deniz)")

handshake5, completed = simulate_handshake_workflow(
    zeynep_language, can, provider_initiated_days_ago=20, completed_days_ago=15
)
if handshake5 and completed:
    completed_handshakes.append(handshake5)
    print(f"  Completed: {zeynep_language.title} (Zeynep -> Can)")

handshake6, completed = simulate_handshake_workflow(
    can_photography, burak, provider_initiated_days_ago=5, completed_days_ago=0
)
if handshake6 and completed:
    completed_handshakes.append(handshake6)
    print(f"  Completed: {can_photography.title} (Can -> Burak)")
if handshake6:
    sync_fixed_group_offer_time(can_photography, photography_demo_time)

handshake7, completed = simulate_handshake_workflow(
    elif_borek, zeynep, provider_initiated_days_ago=3, completed_days_ago=0
)
if handshake7 and completed:
    completed_handshakes.append(handshake7)
    print(f"  Completed: {elif_borek.title} (Elif -> Zeynep)")
if handshake7:
    sync_fixed_group_offer_time(elif_borek, borek_demo_time)

handshake8, completed = simulate_handshake_workflow(
    cem_chess_offer, burak, provider_initiated_days_ago=16, completed_days_ago=12
)
if handshake8 and completed:
    completed_handshakes.append(handshake8)
    print(f"  Completed: {cem_chess_offer.title} (Cem -> Burak)")

handshake9, completed = simulate_handshake_workflow(
    mehmet_genealogy, elif_user, provider_initiated_days_ago=23, completed_days_ago=18
)
if handshake9 and completed:
    completed_handshakes.append(handshake9)
    print(f"  Completed: {mehmet_genealogy.title} (Mehmet -> Elif)")

handshake10, completed = simulate_handshake_workflow(
    deniz_tech, mehmet, provider_initiated_days_ago=8, completed_days_ago=3
)
if handshake10 and completed:
    completed_handshakes.append(handshake10)
    print(f"  Completed: {deniz_tech.title} (Deniz -> Mehmet)")

handshake11, completed = simulate_handshake_workflow(
    zeynep_cooking_need, elif_user, provider_initiated_days_ago=2
)
if handshake11 and not completed:
    accepted_handshakes.append(handshake11)
    print(f"  Accepted (pending completion): {zeynep_cooking_need.title} (Zeynep -> Elif)")

handshake12, completed = simulate_handshake_workflow(
    can_cooking_need, elif_user, provider_initiated_days_ago=0
)
if handshake12 and not completed:
    accepted_handshakes.append(handshake12)
    print(f"  Accepted (pending completion): {can_cooking_need.title} (Can -> Elif)")

handshake13, completed = simulate_handshake_workflow(
    ayse_plant_advice, zeynep, provider_initiated_days_ago=1
)
if handshake13 and not completed:
    accepted_handshakes.append(handshake13)
    print(f"  Accepted (pending completion): {ayse_plant_advice.title} (Ayşe -> Zeynep)")

handshake14, completed = simulate_handshake_workflow(
    burak_chess, cem, provider_initiated_days_ago=0
)
if handshake14 and not completed:
    accepted_handshakes.append(handshake14)
    print(f"  Accepted (pending completion): {burak_chess.title} (Burak -> Cem)")

try:
    pending1 = HandshakeService.express_interest(elif_tech, deniz)
    pending1.created_at = timezone.now() - timedelta(days=1)
    pending1.save()
    pending_handshakes.append(pending1)
    print(f"  Pending: {elif_tech.title} (Elif -> Deniz)")
except Exception as e:
    print(f"  Could not create pending handshake: {e}")

try:
    pending2 = HandshakeService.express_interest(burak_guitar, deniz)
    pending2.created_at = timezone.now() - timedelta(hours=12)
    pending2.save(update_fields=['created_at'])
    pending_handshakes.append(pending2)
    print(f"  Pending: {burak_guitar.title} (Burak -> Deniz)")
except Exception as e:
    print(f"  Could not create pending handshake: {e}")

print(f"\n  Created {len(completed_handshakes)} completed, {len(accepted_handshakes)} accepted, {len(pending_handshakes)} pending handshakes")

print("\n[6/8] Adding reputation for completed handshakes...")

reputation_data = [
    (handshake1, cem, elif_user, True, True, True, "Elif was amazing! The manti workshop was so detailed and fun. Highly recommend!"),
    (handshake2, mehmet, cem, True, True, False, "Cem is very knowledgeable and patient. Great introduction to genealogy research."),
    (handshake3, elif_user, ayse, True, True, True, "Ayşe's gardening workshop was fantastic! Learned so much about container gardening."),
    (handshake4, deniz, mehmet, True, True, True, "Mehmet was very patient teaching me smartphone basics. Very helpful!"),
    (handshake5, can, zeynep, True, True, True, "Zeynep is a great conversation partner. Our language exchange sessions are always enjoyable."),
    (handshake6, burak, can, True, False, True, "Can's photography tips were really helpful. Got some great shots of the Bosphorus!"),
    (handshake7, zeynep, elif_user, True, True, True, "Elif taught me to make perfect börek! The technique was easier than I thought."),
    (handshake8, burak, cem, True, True, False, "Cem is a good chess teacher. I'm improving my game strategy."),
    (handshake9, elif_user, mehmet, True, True, True, "Mehmet helped me trace my family history back three generations. Incredible work!"),
    (handshake10, mehmet, deniz, True, True, True, "Deniz was very patient and clear. Now I can use my smartphone confidently!"),
]

for handshake, giver, receiver, punctual, helpful, kind, comment in reputation_data:
    if handshake is None:
        continue
    try:
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

        # Seed a verified review for Service Detail from the reputation comment.
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
    except Exception as e:
        print(f"  Error adding reputation: {e}")

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

forum_category = forum_categories_by_slug['general']
forum_category2 = forum_categories_by_slug['tips']

topics = [
    (forum_category, elif_user, 'Welcome to The Hive!', 'Hi everyone! Excited to be part of this community. Looking forward to sharing skills and learning from all of you!', timezone.now() - timedelta(days=30)),
    (forum_category, ayse, 'Best neighborhoods for in-person meetups?', 'What are your favorite spots in Istanbul for meeting up for services? Looking for safe, accessible locations.', timezone.now() - timedelta(days=25)),
    (forum_category2, mehmet, 'Tips for first-time service providers', 'For those new to the platform, here are some tips: be clear about expectations, communicate promptly, and enjoy the exchange!', timezone.now() - timedelta(days=20)),
    (forum_category, zeynep, 'Language exchange success stories', 'Had a great experience practicing Turkish with Can. The platform really works for language learning!', timezone.now() - timedelta(days=15)),
]

forum_topics = []
for category, author, title, body, created_at in topics:
    topic = ForumTopic.objects.create(
        category=category,
        author=author,
        title=title,
        body=body,
        created_at=created_at
    )
    forum_topics.append(topic)
    print(f"  Created forum topic: {title}")

posts_data = [
    (forum_topics[0], cem, "Welcome! Great to have you here.", timezone.now() - timedelta(days=29)),
    (forum_topics[0], ayse, "Looking forward to connecting!", timezone.now() - timedelta(days=28)),
    (forum_topics[1], elif_user, "Beşiktaş has great cafés near the ferry terminal.", timezone.now() - timedelta(days=24)),
    (forum_topics[1], can, "Kadıköy Moda area is perfect - lots of quiet spots.", timezone.now() - timedelta(days=23)),
    (forum_topics[2], zeynep, "Great tips! Communication is key.", timezone.now() - timedelta(days=19)),
    (forum_topics[2], deniz, "Thanks for sharing this!", timezone.now() - timedelta(days=18)),
    (forum_topics[3], elif_user, "That's wonderful! Language exchange is one of my favorite uses of the platform.", timezone.now() - timedelta(days=14)),
]

for topic, author, body, created_at in posts_data:
    ForumPost.objects.create(
        topic=topic,
        author=author,
        body=body,
        created_at=created_at
    )
    print(f"  Added forum post to: {topic.title[:30]}...")

print("\n[8/8] Assigning achievements and finalizing...")

for user in all_users:
    check_and_assign_badges(user)

print("  Done")

print("\n[9/9] Creating admin account...")
admin_email = 'moderator@demo.com'
admin_password = 'demo123'

existing_admin = User.objects.filter(email=admin_email).first()
if existing_admin:
    existing_admin.delete()
    print(f"  Removed existing admin account")

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
print(f"  Created: {admin_email} (Admin account)")

print("\n[10/10] Creating admin-testable data (reports + audit logs)...")

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

print(f"  Created 5 test reports (3 pending, 1 resolved, 1 dismissed)")

# ── Audit Logs ───────────────────────────────────────────────────────────────

audit1 = AdminAuditLog.objects.create(
    admin=admin_user,
    action_type='warn_user',
    target_entity='user',
    target_id=burak.id,
    reason='Multiple community members reported aggressive follow-up messages. Issued formal warning and reminded of platform code of conduct.',
)
AdminAuditLog.objects.filter(pk=audit1.pk).update(created_at=timezone.now() - timedelta(days=8))

audit2 = AdminAuditLog.objects.create(
    admin=admin_user,
    action_type='adjust_karma',
    target_entity='user',
    target_id=can.id,
    reason='Manually corrected karma score (+10) after a system error failed to record three completed exchanges from last month.',
)
AdminAuditLog.objects.filter(pk=audit2.pk).update(created_at=timezone.now() - timedelta(days=5))

audit3 = AdminAuditLog.objects.create(
    admin=admin_user,
    action_type='resolve_report',
    target_entity='report',
    target_id=report4.id,
    reason='Reviewed evidence and closed service_issue report. Both parties confirmed mutual agreement. No policy violation.',
)
AdminAuditLog.objects.filter(pk=audit3.pk).update(created_at=timezone.now() - timedelta(days=2))

audit4 = AdminAuditLog.objects.create(
    admin=admin_user,
    action_type='lock_topic',
    target_entity='forum_topic',
    target_id=forum_topics[1].id,
    reason='Thread derailed into off-topic arguments. Locked after moderator warning was ignored by participants.',
)
AdminAuditLog.objects.filter(pk=audit4.pk).update(created_at=timezone.now() - timedelta(days=14))

audit5 = AdminAuditLog.objects.create(
    admin=admin_user,
    action_type='pin_topic',
    target_entity='forum_topic',
    target_id=forum_topics[0].id,
    reason='Pinned welcome thread to top of General Discussion for better visibility for new members.',
)
AdminAuditLog.objects.filter(pk=audit5.pk).update(created_at=timezone.now() - timedelta(days=20))

print(f"  Created 5 audit log entries")

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
print(f"  Chat Messages: {ChatMessage.objects.filter(handshake__in=completed_handshakes + accepted_handshakes + pending_handshakes).count()}")
print(f"  Comments: {Comment.objects.count()}")
print(f"  Reputation Entries: {ReputationRep.objects.count()}")
print(f"  Forum Topics: {ForumTopic.objects.count()}")
print(f"  Forum Posts: {ForumPost.objects.count()}")
print(f"  Reports: {Report.objects.count()} ({Report.objects.filter(status='pending').count()} pending)")
print(f"  Audit Logs: {AdminAuditLog.objects.count()}")
print(f"\nDemo Accounts (password: demo123):")
print(f"  Admin:   {admin_email} / {admin_password}")
for user in all_users:
    print(f"  {user.first_name} {user.last_name}: {user.email} (Balance: {user.timebank_balance}h, Karma: {user.karma_score})")
print("\n" + "=" * 60)
