from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        import api.signals  # noqa

        # Ensure the MinIO bucket exists (and has a public-read policy).
        # Runs once on startup; failures are logged but never crash the server.
        import threading
        def _init_bucket():
            from api.storage import ensure_minio_bucket
            ensure_minio_bucket()
        threading.Thread(target=_init_bucket, daemon=True).start()
