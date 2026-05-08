"""
Top-level conftest for pytest, including the copy that ships into mutmut's
`mutants/` working tree via `also_copy = ["conftest.py"]` in pyproject.toml.

Inside the mutants tree, mutmut copies the project source under
backend/mutants/ and runs pytest from there. Two things have to happen
before Django's settings module is imported:

1. The .env file at the repo root (one or two parent dirs above) needs to
   be loaded, since `hive_project/settings.py` resolves it relative to
   BASE_DIR which is wrong for the mutants tree.
2. Hardcoded fallbacks need to fire for any vars that load_dotenv missed,
   so the mutants subprocess can boot deterministically.

NOTE on pytest-django plugin order: pytest-django reads
DJANGO_SETTINGS_MODULE during its `pytest_load_initial_conftests` hook,
which fires BEFORE non-rootdir conftest modules are imported. The work
below is therefore done at module import time of THIS rootdir conftest;
it must complete before any `import django` happens elsewhere.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
for _candidate in (_HERE.parent, _HERE.parent.parent, _HERE.parent.parent.parent):
    _env = _candidate / '.env'
    if _env.exists():
        load_dotenv(_env, override=False)
        break

# Fallbacks for local-dev defaults so the mutants subprocess can boot even
# when load_dotenv could not locate a .env file (e.g. on CI runners that
# do not stage .env into the working tree).
_FALLBACKS = {
    'DB_NAME': 'the_hive_db',
    'DB_USER': 'postgres',
    'DB_PASSWORD': 'postgres123',
    'DB_HOST': 'localhost',
    'DB_PORT': '5432',
    'SECRET_KEY': 'mutmut-bootstrap-fallback-secret',
    'ALLOWED_HOSTS': '*',
    'REDIS_URL': 'redis://localhost:6379/0',
    'DEBUG': 'True',
    'DISABLE_THROTTLING': 'True',
}
for _key, _value in _FALLBACKS.items():
    os.environ.setdefault(_key, _value)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hive_project.settings')

import django  # noqa: E402

django.setup()
