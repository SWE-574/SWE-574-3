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
    Service, Tag, User, UserBadge, ForumCategory, ForumTopic, ForumPost
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
    Service.objects.filter(user_id__in=user_ids).delete()
    Handshake.objects.filter(Q(requester_id__in=user_ids) | Q(service__user_id__in=user_ids)).delete()
    Notification.objects.filter(user_id__in=user_ids).delete()
    ReputationRep.objects.filter(Q(giver_id__in=user_ids) | Q(receiver_id__in=user_ids)).delete()
    UserBadge.objects.filter(user_id__in=user_ids).delete()
    Comment.objects.filter(user_id__in=user_ids).delete()
    ForumTopic.objects.filter(author_id__in=user_ids).delete()
    ForumPost.objects.filter(author_id__in=user_ids).delete()
    ChatMessage.objects.filter(sender_id__in=user_ids).delete()
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

def create_or_update_user(email, first_name, last_name, bio, balance, karma, date_joined_offset_days=0):
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            'password': make_password('demo123'),
            'first_name': first_name,
            'last_name': last_name,
            'bio': bio,
            'timebank_balance': balance,
            'karma_score': karma,
            'role': 'member',
            'date_joined': timezone.now() - timedelta(days=date_joined_offset_days),
        }
    )
    if not created:
        user.timebank_balance = balance
        user.karma_score = karma
        user.first_name = first_name
        user.last_name = last_name
        user.bio = bio
        user.set_password('demo123')
        if date_joined_offset_days > 0:
            user.date_joined = timezone.now() - timedelta(days=date_joined_offset_days)
        user.save()
    print(f"  {'Created' if created else 'Updated'}: {email} ({first_name} {last_name}, Balance: {balance}h, Karma: {karma})")
    return user

elif_user = create_or_update_user(
    'elif@demo.com', 'Elif', 'Yılmaz',
    'Freelance designer and cooking enthusiast living in Beşiktaş. Love sharing traditional Turkish recipes and learning about Istanbul\'s food culture!',
    Decimal('6.50'), 35, date_joined_offset_days=45
)

cem = create_or_update_user(
    'cem@demo.com', 'Cem', 'Demir',
    'University student in Kadıköy passionate about chess and genealogy research. Always happy to teach beginners and help trace family histories!',
    Decimal('4.00'), 18, date_joined_offset_days=30
)

ayse = create_or_update_user(
    'ayse@demo.com', 'Ayşe', 'Kaya',
    'Gardening enthusiast and community organizer in Üsküdar. Passionate about sustainable living and urban farming. Love sharing knowledge about growing food in small spaces!',
    Decimal('7.00'), 42, date_joined_offset_days=60
)

mehmet = create_or_update_user(
    'mehmet@demo.com', 'Mehmet', 'Özkan',
    'Retired teacher living in Şişli. Expert in genealogy research and Istanbul history. Enjoy helping others discover their family roots and learn about our city\'s rich past.',
    Decimal('8.50'), 55, date_joined_offset_days=90
)

zeynep = create_or_update_user(
    'zeynep@demo.com', 'Zeynep', 'Arslan',
    'Language teacher and cultural exchange enthusiast. Fluent in Turkish, English, and French. Love connecting people through language and helping others practice conversation in a friendly, relaxed setting.',
    Decimal('9.00'), 68, date_joined_offset_days=75
)

can = create_or_update_user(
    'can@demo.com', 'Can', 'Şahin',
    'Photography hobbyist based in Beşiktaş. Specialize in Istanbul landmarks and street photography. Happy to share tips on composition, lighting, and capturing the city\'s unique character.',
    Decimal('5.50'), 28, date_joined_offset_days=25
)

deniz = create_or_update_user(
    'deniz@demo.com', 'Deniz', 'Aydın',
    'Tech-savvy professional in Kadıköy. Enjoy helping others with smartphones, apps, and basic tech troubleshooting. Patient teacher for all skill levels!',
    Decimal('5.00'), 22, date_joined_offset_days=20
)

burak = create_or_update_user(
    'burak@demo.com', 'Burak', 'Kurt',
    'Chess player and music lover. Intermediate level chess player looking to improve and teach others. Also enjoy discussing music and sharing recommendations.',
    Decimal('4.50'), 15, date_joined_offset_days=15
)

all_users = [elif_user, cem, ayse, mehmet, zeynep, can, deniz, burak]

print("\n[4/8] Creating realistic services...")

def get_tag(tag_id, tag_name):
    try:
        return Tag.objects.get(id=tag_id)
    except Tag.DoesNotExist:
        return Tag.objects.get(name=tag_name)

cooking_tag = get_tag('Q8476', 'Cooking')
chess_tag = get_tag('Q7186', 'Chess')
education_tag = get_tag('Q11465', 'Education')
technology_tag = get_tag('Q11466', 'Technology')
gardening_tag = get_tag('Q11467', 'Gardening')
language_tag = get_tag('Q2013', 'Language')
photography_tag = get_tag('Q11631', 'Photography')

services = []

elif_manti = Service.objects.create(
    user=elif_user,
    title='Traditional Manti Cooking Workshop',
    description='Learn to make authentic Turkish manti from scratch! We\'ll cover everything: dough preparation, spiced meat filling, the art of folding those tiny dumplings, and the perfect yogurt-garlic sauce. Perfect for beginners. Takes place in my Beşiktaş kitchen, all ingredients provided.',
    type='Offer',
    duration=Decimal('3.00'),
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=2,
    schedule_type='Recurrent',
    schedule_details='Every Tuesday at 19:00',
    status='Active',
    created_at=timezone.now() - timedelta(days=20),
)
elif_manti.tags.set([cooking_tag])
services.append(elif_manti)
print(f"  Created: {elif_manti.title}")

elif_borek = Service.objects.create(
    user=elif_user,
    title='Börek Making Session',
    description='Master the art of Turkish börek! We\'ll make both cheese and spinach varieties. Learn proper phyllo handling, layering techniques, and achieving that perfect golden crust. Great for anyone who loves Turkish pastries.',
    type='Offer',
    duration=Decimal('2.50'),
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=2,
    schedule_type='One-Time',
    schedule_details='Next Saturday at 14:00',
    status='Active',
    created_at=timezone.now() - timedelta(days=5),
)
elif_borek.tags.set([cooking_tag])
services.append(elif_borek)
print(f"  Created: {elif_borek.title}")

elif_tech = Service.objects.create(
    user=elif_user,
    title='Help with 3D Printer Setup',
    description='I just got a 3D printer but struggling with initial setup and calibration. Looking for someone with experience to help me get started and understand the basics of 3D printing.',
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
    title='Chess Strategy Lessons for Beginners',
    description='Learn chess fundamentals! I\'ll teach opening principles, basic tactics, endgame techniques, and how to think strategically. Perfect for complete beginners or those who know the rules but want to improve. We can play in a quiet café in Kadıköy.',
    type='Offer',
    duration=Decimal('1.50'),
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
    title='Genealogy Research Assistance',
    description='I can help you get started with tracing your family tree! I\'ll show you how to use online databases, read old records, and organize your findings. Great for anyone curious about their family history, especially Turkish ancestry.',
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
    title='Urban Balcony Gardening Workshop',
    description='Learn how to grow vegetables and herbs in small spaces! Perfect for apartment dwellers. We\'ll cover container selection, soil preparation, watering schedules, and basic plant care. Hands-on workshop in my Üsküdar garden.',
    type='Offer',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Üsküdar',
    location_lat=Decimal('41.0214'),
    location_lng=Decimal('29.0125'),
    max_participants=3,
    schedule_type='One-Time',
    schedule_details='Next Saturday at 10:00',
    status='Active',
    created_at=timezone.now() - timedelta(days=8),
)
ayse_gardening.tags.set([gardening_tag])
services.append(ayse_gardening)
print(f"  Created: {ayse_gardening.title}")

ayse_plant_advice = Service.objects.create(
    user=ayse,
    title='Plant Care Consultation',
    description='Having trouble with your houseplants? I can help diagnose issues, suggest care routines, and share tips for keeping your plants healthy. Bring photos or we can video call to see your plants.',
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
    title='Advanced Genealogy Research Help',
    description='Experienced genealogist offering in-depth research assistance. I specialize in Ottoman-era records, Turkish archives, and connecting family branches. Can help with complex cases and hard-to-find ancestors.',
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
    title='Help with Smartphone and Apps',
    description='Need help setting up your smartphone or learning how to use apps? I\'m patient and can help with basics like WhatsApp, email, photos, and navigation apps. Perfect for seniors or anyone new to smartphones.',
    type='Need',
    duration=Decimal('1.50'),
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
    title='Turkish-English Language Exchange',
    description='Practice conversation in a relaxed, friendly setting! I\'m a native Turkish speaker fluent in English. We can chat about daily life, culture, or any topic you\'re interested in. Great for intermediate learners on both sides.',
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
    title='Learn Turkish Coffee Making',
    description='I\'ve always wanted to learn how to make proper Turkish coffee the traditional way. Looking for someone who can teach me the technique, timing, and the cultural aspects of coffee preparation.',
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
    title='Istanbul Landmarks Photography Tips',
    description='Love photography? Join me for a walk around Beşiktaş and learn techniques for capturing Istanbul\'s iconic landmarks. We\'ll cover composition, lighting, timing, and how to avoid crowds. Bring your camera or smartphone!',
    type='Offer',
    duration=Decimal('2.00'),
    location_type='In-Person',
    location_area='Beşiktaş',
    location_lat=Decimal('41.0422'),
    location_lng=Decimal('29.0089'),
    max_participants=2,
    schedule_type='One-Time',
    schedule_details='Next Sunday morning for best light',
    status='Active',
    created_at=timezone.now() - timedelta(days=7),
)
can_photography.tags.set([photography_tag])
services.append(can_photography)
print(f"  Created: {can_photography.title}")

can_cooking_need = Service.objects.create(
    user=can,
    title='Learn Basic Turkish Cooking',
    description='I\'m new to cooking and want to learn some basic Turkish dishes. Looking for someone patient who can teach me simple, delicious recipes I can make at home. Vegetarian-friendly preferred!',
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
    title='Smartphone Setup and App Help',
    description='Need help with your smartphone? I can assist with setup, installing apps, organizing your home screen, backing up photos, and learning useful apps for daily life. Patient and beginner-friendly!',
    type='Offer',
    duration=Decimal('1.50'),
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
    title='Looking for Chess Practice Partner',
    description='Intermediate chess player looking for regular practice games. Prefer casual, friendly matches where we can discuss moves and learn together. Can meet at a quiet café in Kadıköy.',
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

print(f"\n  Created {len(services)} services")

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
                handshake.status = 'completed'
                handshake.updated_at = completion_time
                handshake.save()
                complete_timebank_transfer(handshake)
            
            check_and_assign_badges(provider)
            check_and_assign_badges(receiver)
            
            return handshake, True
        
        return handshake, False
    except Exception as e:
        print(f"    Error creating handshake: {e}")
        import traceback
        traceback.print_exc()
        return None, False

completed_handshakes = []
accepted_handshakes = []
pending_handshakes = []

handshake1, completed = simulate_handshake_workflow(
    elif_manti, cem, provider_initiated_days_ago=15, completed_days_ago=10
)
if handshake1 and completed:
    completed_handshakes.append(handshake1)
    print(f"  Completed: {elif_manti.title} (Elif -> Cem)")

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

handshake7, completed = simulate_handshake_workflow(
    elif_borek, zeynep, provider_initiated_days_ago=3, completed_days_ago=0
)
if handshake7 and completed:
    completed_handshakes.append(handshake7)
    print(f"  Completed: {elif_borek.title} (Elif -> Zeynep)")

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
    pending2 = HandshakeService.express_interest(mehmet_tech, deniz)
    pending_handshakes.append(pending2)
    print(f"  Pending: {mehmet_tech.title} (Mehmet -> Deniz)")
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
    timebank_balance=Decimal('10.00'),
    karma_score=100,
    role='admin',
    is_staff=True,
    is_superuser=True
)
print(f"  Created: {admin_email} (Admin account)")

print("\n" + "=" * 60)
print("Demo setup complete!")
print("=" * 60)
print(f"\nSummary:")
print(f"  Users: {len(all_users)}")
print(f"  Services: {len(services)}")
print(f"  Completed Handshakes: {len(completed_handshakes)}")
print(f"  Accepted Handshakes: {len(accepted_handshakes)}")
print(f"  Pending Handshakes: {len(pending_handshakes)}")
print(f"  Chat Messages: {ChatMessage.objects.filter(handshake__in=completed_handshakes + accepted_handshakes + pending_handshakes).count()}")
print(f"  Comments: {Comment.objects.count()}")
print(f"  Reputation Entries: {ReputationRep.objects.count()}")
print(f"  Forum Topics: {ForumTopic.objects.count()}")
print(f"  Forum Posts: {ForumPost.objects.count()}")
print(f"\nDemo Accounts (password: demo123):")
print(f"  Admin:   {admin_email} / {admin_password}")
for user in all_users:
    print(f"  {user.first_name} {user.last_name}: {user.email} (Balance: {user.timebank_balance}h, Karma: {user.karma_score})")
print("\n" + "=" * 60)
