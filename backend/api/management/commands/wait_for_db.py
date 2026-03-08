"""
Management command to wait for database to be available.
This command implements exponential backoff retry logic for database connections.
"""
import time
from django.core.management.base import BaseCommand
from django.db import connection
from django.db.utils import OperationalError


class Command(BaseCommand):
    """Django command to wait for database to be available"""
    
    help = 'Wait for database to be available with exponential backoff'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--max-retries',
            type=int,
            default=30,
            help='Maximum number of retry attempts (default: 30)'
        )
        parser.add_argument(
            '--initial-delay',
            type=float,
            default=1.0,
            help='Initial delay in seconds between retries (default: 1.0)'
        )
        parser.add_argument(
            '--max-delay',
            type=float,
            default=30.0,
            help='Maximum delay in seconds between retries (default: 30.0)'
        )
        parser.add_argument(
            '--backoff-factor',
            type=float,
            default=2.0,
            help='Exponential backoff multiplier (default: 2.0)'
        )
    
    def handle(self, *args, **options):
        max_retries = options['max_retries']
        initial_delay = options['initial_delay']
        max_delay = options['max_delay']
        backoff_factor = options['backoff_factor']
        
        self.stdout.write('Waiting for database...')
        
        db_conn = None
        retry_count = 0
        delay = initial_delay
        
        while retry_count < max_retries:
            try:
                # Attempt to connect to the database
                connection.ensure_connection()
                db_conn = True
                break
            except OperationalError as e:
                retry_count += 1
                if retry_count >= max_retries:
                    self.stdout.write(
                        self.style.ERROR(
                            f'Database unavailable after {max_retries} attempts: {str(e)}'
                        )
                    )
                    raise
                
                self.stdout.write(
                    self.style.WARNING(
                        f'Database unavailable (attempt {retry_count}/{max_retries}), '
                        f'waiting {delay:.1f}s... Error: {str(e)}'
                    )
                )
                
                time.sleep(delay)
                
                # Calculate next delay with exponential backoff
                delay = min(delay * backoff_factor, max_delay)
        
        if db_conn:
            self.stdout.write(self.style.SUCCESS('Database available!'))
