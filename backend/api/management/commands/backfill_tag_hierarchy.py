"""
Management command to backfill parent_qid and entity_type for existing tags
from WikiData P31/P279 claims.
"""
import re
import time
from django.core.management.base import BaseCommand

from api.models import Tag
from api.wikidata import fetch_wikidata_claims, resolve_entity_type


QID_PATTERN = re.compile(r'^Q\d+$', re.IGNORECASE)


class Command(BaseCommand):
    help = 'Backfill parent_qid and entity_type for existing tags from WikiData'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force', action='store_true',
            help='Re-fetch even for tags that already have parent_qid set',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Show what would change without saving',
        )
        parser.add_argument(
            '--batch-size', type=int, default=10,
            help='Number of tags to process before sleeping (default: 10)',
        )
        parser.add_argument(
            '--sleep', type=float, default=1.0,
            help='Seconds to sleep between batches (default: 1.0)',
        )

    def handle(self, *args, **options):
        force = options['force']
        dry_run = options['dry_run']
        batch_size = options['batch_size']
        sleep_time = options['sleep']

        # Get QID-based tags only
        tags = Tag.objects.filter(id__regex=r'^Q\d+$')
        if not force:
            tags = tags.filter(parent_qid__isnull=True)

        tags = list(tags)
        total = len(tags)
        updated = 0
        skipped = 0
        failed = 0

        self.stdout.write(f'Found {total} tags to process (force={force}, dry_run={dry_run})')

        for i, tag in enumerate(tags):
            if i > 0 and i % batch_size == 0:
                time.sleep(sleep_time)

            claims = fetch_wikidata_claims(tag.id)
            if claims is None:
                failed += 1
                self.stdout.write(self.style.WARNING(
                    f'  [{i+1}/{total}] FAILED: {tag.id} ({tag.name}) — API error'
                ))
                continue

            parents = claims.get('instance_of', []) + claims.get('subclass_of', [])
            parent_qid = parents[0] if parents else None
            entity_type = resolve_entity_type(tag.id)
            depth = 1 if parent_qid else 0

            if dry_run:
                self.stdout.write(
                    f'  [{i+1}/{total}] DRY RUN: {tag.id} ({tag.name}) '
                    f'-> parent={parent_qid}, type={entity_type}, depth={depth}'
                )
                updated += 1
            else:
                tag.parent_qid = parent_qid
                tag.entity_type = entity_type
                tag.depth = depth
                tag.save(update_fields=['parent_qid', 'entity_type', 'depth'])
                updated += 1
                self.stdout.write(
                    f'  [{i+1}/{total}] OK: {tag.id} ({tag.name}) '
                    f'-> parent={parent_qid}, type={entity_type}'
                )

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. Updated: {updated}, Failed: {failed}, Skipped: {skipped}, Total: {total}'
        ))
