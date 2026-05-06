"""Daily rebuild of the anonymized handshake cooccurrence matrix used by the
For You feed (#481). Run nightly. Output is the row count written.
"""
from django.core.management.base import BaseCommand

from api.ranking_personalized import rebuild_cooccurrence_matrix


class Command(BaseCommand):
    help = 'Rebuild the HandshakeCooccurrence matrix from completed handshakes.'

    def handle(self, *args, **options):
        written = rebuild_cooccurrence_matrix()
        self.stdout.write(self.style.SUCCESS(
            f'Rebuilt cooccurrence matrix: {written} pairs written.'
        ))
