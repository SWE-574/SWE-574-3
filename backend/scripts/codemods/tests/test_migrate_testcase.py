import textwrap

from scripts.codemods.migrate_testcase import migrate_source


def _n(s: str) -> str:
    return textwrap.dedent(s).strip() + '\n'


def test_drops_testcase_wrapper_and_self_param():
    src = _n("""
        from django.test import TestCase

        class FooTests(TestCase):
            def test_one(self):
                self.assertEqual(1, 1)
    """)
    out = migrate_source(src)
    assert 'class FooTests' not in out
    assert 'def test_one():' in out
    assert 'assert 1 == 1' in out


def test_translates_assert_methods():
    src = _n("""
        from django.test import TestCase

        class T(TestCase):
            def test_x(self):
                self.assertEqual(a, b)
                self.assertNotEqual(c, d)
                self.assertTrue(x)
                self.assertFalse(y)
                self.assertIn(k, v)
                self.assertIsNone(z)
                self.assertGreater(p, q)
    """)
    out = migrate_source(src)
    assert 'assert a == b' in out
    assert 'assert c != d' in out
    assert 'assert x' in out
    assert 'assert not y' in out
    assert 'assert k in v' in out
    assert 'assert z is None' in out
    assert 'assert p > q' in out


def test_adds_django_db_marker_for_testcase_subclass():
    src = _n("""
        from django.test import TestCase

        class T(TestCase):
            def test_db(self):
                self.assertEqual(1, 1)
    """)
    out = migrate_source(src)
    assert '@pytest.mark.django_db' in out
    assert 'import pytest' in out


def test_translates_assert_raises():
    src = _n("""
        from django.test import TestCase

        class T(TestCase):
            def test_raises(self):
                with self.assertRaises(ValueError):
                    do_thing()
                with self.assertRaises(KeyError) as ctx:
                    other()
                self.assertIn('boom', str(ctx.exception))
    """)
    out = migrate_source(src)
    assert 'with pytest.raises(ValueError):' in out
    assert 'with pytest.raises(KeyError) as ctx:' in out
    assert 'ctx.value' in out


def test_emits_setup_todo_block():
    src = _n("""
        from django.test import TestCase

        class T(TestCase):
            def setUp(self):
                self.user = make_user()

            def test_x(self):
                self.assertEqual(1, 1)
    """)
    out = migrate_source(src)
    assert 'TODO(testing-overhaul)' in out
    assert 'self.user = make_user()' in out


def test_idempotent_on_pure_pytest_file():
    src = _n("""
        import pytest

        def test_foo():
            assert 1 == 1
    """)
    out = migrate_source(src)
    assert out == src
