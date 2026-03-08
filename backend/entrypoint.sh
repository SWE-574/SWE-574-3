#!/bin/bash
# Entrypoint script for The Hive backend
# Waits for database to be ready before starting the application

set -e

echo "Starting The Hive backend..."

# Wait for database to be ready with exponential backoff
echo "Waiting for database connection..."
python manage.py wait_for_db --max-retries 30 --initial-delay 1 --max-delay 30 --backoff-factor 2

# Run database migrations
echo "Running database migrations..."
python manage.py migrate --noinput

# Collect static files (for Django admin and other static assets)
echo "Collecting static files..."
python manage.py collectstatic --noinput

# Ensure default forum categories exist (non-destructive unless --force is used)
echo "Seeding default forum categories..."
python manage.py seed_forum_categories

# Start the application
echo "Starting Daphne server..."
exec "$@"
