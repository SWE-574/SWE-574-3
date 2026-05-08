"""
libcst codemod: convert unittest-style test classes to plain pytest functions.

Scope (mechanical only):
  - Drop `class Foo(TestCase|APITestCase|TransactionTestCase|HypothesisTestCase):`.
  - De-indent methods to module level, drop the `self` parameter.
  - Translate `self.assertX(...)` calls into bare `assert` statements.
  - Translate `with self.assertRaises(E)` into `with pytest.raises(E)` and
    rewrite captured `ctx.exception` reads to `ctx.value`.
  - Add `@pytest.mark.django_db` to functions migrated from a TestCase
    subclass that lived inside Django's TestCase tree.
  - Insert a TODO block above the first migrated function showing the
    original `setUp` body so a human can convert it to a pytest fixture.

Out of scope (manual polish):
  - Rewriting `self.foo` reads inside method bodies.
  - Splitting `setUp` into multiple narrow fixtures.
  - Parametrizing for-loops in tests.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import libcst as cst
import libcst.matchers as m

TESTCASE_BASES = {
    'TestCase', 'APITestCase', 'HypothesisTestCase', 'TransactionTestCase',
}
DJANGO_TESTCASE_BASES = {'TestCase', 'APITestCase', 'TransactionTestCase'}


def _comparison(left, op, right):
    return cst.Comparison(
        left=left,
        comparisons=[cst.ComparisonTarget(operator=op, comparator=right)],
    )


ASSERT_TABLE = {
    'assertEqual':       lambda a, b: _comparison(a, cst.Equal(), b),
    'assertNotEqual':    lambda a, b: _comparison(a, cst.NotEqual(), b),
    'assertGreater':     lambda a, b: _comparison(a, cst.GreaterThan(), b),
    'assertLess':        lambda a, b: _comparison(a, cst.LessThan(), b),
    'assertGreaterEqual':lambda a, b: _comparison(a, cst.GreaterThanEqual(), b),
    'assertLessEqual':   lambda a, b: _comparison(a, cst.LessThanEqual(), b),
    'assertIn':          lambda a, b: _comparison(a, cst.In(), b),
    'assertNotIn':       lambda a, b: _comparison(a, cst.NotIn(), b),
    'assertIs':          lambda a, b: _comparison(a, cst.Is(), b),
    'assertIsNot':       lambda a, b: _comparison(a, cst.IsNot(), b),
    'assertDictEqual':   lambda a, b: _comparison(a, cst.Equal(), b),
    'assertListEqual':   lambda a, b: _comparison(a, cst.Equal(), b),
    'assertSetEqual':    lambda a, b: _comparison(a, cst.Equal(), b),
    'assertTupleEqual':  lambda a, b: _comparison(a, cst.Equal(), b),
}

UNARY_TABLE = {
    'assertTrue':       lambda x: x,
    'assertFalse':      lambda x: cst.UnaryOperation(
                            operator=cst.Not(whitespace_after=cst.SimpleWhitespace(' ')),
                            expression=x,
                        ),
    'assertIsNone':     lambda x: _comparison(x, cst.Is(), cst.Name('None')),
    'assertIsNotNone':  lambda x: _comparison(x, cst.IsNot(), cst.Name('None')),
}


class TestCaseMigrator(cst.CSTTransformer):
    def __init__(self):
        self.needs_pytest_import = False
        self.changed = False

    def leave_ClassDef(self, original_node, updated_node):
        if not self._is_testcase(updated_node):
            return updated_node
        is_django = self._is_django_testcase(updated_node)
        body_items = list(updated_node.body.body)
        new_top: list[cst.BaseStatement] = []
        setup_body: list[cst.BaseStatement] = []
        for item in body_items:
            if m.matches(item, m.FunctionDef(name=m.Name('setUp'))):
                setup_body = list(item.body.body)
                continue
            if m.matches(item, m.FunctionDef(name=m.Name('tearDown'))):
                # Skip tearDown — caller can convert to fixture yield.
                continue
            if m.matches(item, m.FunctionDef()):
                new_top.append(self._migrate_method(item, is_django=is_django))
                continue
            new_top.append(item)
        if setup_body and new_top:
            todo = self._build_setup_todo(setup_body)
            new_top = [todo] + new_top
        self.changed = True
        return cst.FlattenSentinel(new_top)

    def _is_testcase(self, cls):
        for base in cls.bases:
            if self._base_name(base.value) in TESTCASE_BASES:
                return True
        return False

    def _is_django_testcase(self, cls):
        for base in cls.bases:
            if self._base_name(base.value) in DJANGO_TESTCASE_BASES:
                return True
        return False

    def _base_name(self, value):
        if isinstance(value, cst.Attribute):
            return value.attr.value
        if isinstance(value, cst.Name):
            return value.value
        return None

    def _migrate_method(self, method, *, is_django):
        new_params = method.params.with_changes(
            params=tuple(p for p in method.params.params if p.name.value != 'self')
        )
        new_body = method.body.visit(_BodyRewriter(self))
        new_method = method.with_changes(params=new_params, body=new_body)
        if is_django and method.name.value.startswith('test_'):
            self.needs_pytest_import = True
            decorator = cst.Decorator(
                decorator=cst.Attribute(
                    value=cst.Attribute(value=cst.Name('pytest'), attr=cst.Name('mark')),
                    attr=cst.Name('django_db'),
                ),
            )
            new_method = new_method.with_changes(
                decorators=tuple(method.decorators) + (decorator,),
            )
        return new_method

    def _build_setup_todo(self, setup_body):
        rendered = cst.Module(body=[cst.IndentedBlock(body=setup_body)]).code
        rendered = rendered.replace('\r\n', '\n').strip('\n')
        commented_lines = [f'#     {line}' for line in rendered.split('\n')]
        header = [
            '# TODO(testing-overhaul): convert the following setUp body into a pytest',
            '# fixture. Either:',
            '#   1. Add `@pytest.fixture def env(db): ...` returning SimpleNamespace, OR',
            '#   2. Split into per-entity fixtures (preferred when tests need only a',
            '#      subset of the original state).',
            '# Original setUp body:',
        ]
        comment_lines = header + commented_lines
        leading = tuple(
            cst.EmptyLine(comment=cst.Comment(line))
            for line in comment_lines
        )
        # Use a `pass` placeholder statement — the engineer replaces it with
        # the actual fixture during manual polish.
        placeholder = cst.parse_statement('pass\n')
        return placeholder.with_changes(leading_lines=leading)

    def leave_Module(self, original_node, updated_node):
        if not self.needs_pytest_import:
            return updated_node
        for stmt in updated_node.body:
            if not m.matches(stmt, m.SimpleStatementLine()):
                continue
            for s in stmt.body:
                if m.matches(s, m.Import()):
                    for alias in s.names:
                        if isinstance(alias.name, cst.Name) and alias.name.value == 'pytest':
                            return updated_node
        new_import = cst.parse_statement('import pytest\n')
        body = list(updated_node.body)
        # Insert after the docstring (if any), otherwise at the top.
        insert_at = 0
        if body and m.matches(body[0], m.SimpleStatementLine()):
            first = body[0].body[0] if body[0].body else None
            if m.matches(first, m.Expr(value=m.SimpleString())):
                insert_at = 1
        body.insert(insert_at, new_import)
        return updated_node.with_changes(body=tuple(body))


class _BodyRewriter(cst.CSTTransformer):
    def __init__(self, outer):
        self.outer = outer

    def leave_SimpleStatementLine(self, original, updated):
        # Only rewrite `self.assertX(...)` when it appears as a top-level
        # statement (Expr wrapping a Call). Otherwise leave alone.
        if len(updated.body) != 1:
            return updated
        small = updated.body[0]
        if not m.matches(small, m.Expr()):
            return updated
        call = small.value
        if not m.matches(call, m.Call(func=m.Attribute(value=m.Name('self'), attr=m.Name()))):
            return updated
        method_name = call.func.attr.value
        args = [a.value for a in call.args]
        new_test = self._build_assert_test(method_name, args)
        if new_test is None:
            return updated
        return updated.with_changes(body=[cst.Assert(test=new_test)])

    def _build_assert_test(self, method_name, args):
        if method_name in ASSERT_TABLE and len(args) >= 2:
            return ASSERT_TABLE[method_name](args[0], args[1])
        if method_name in UNARY_TABLE and len(args) >= 1:
            return UNARY_TABLE[method_name](args[0])
        if method_name == 'assertIsInstance' and len(args) == 2:
            return cst.Call(
                func=cst.Name('isinstance'),
                args=[cst.Arg(args[0]), cst.Arg(args[1])],
            )
        return None

    def leave_With(self, original, updated):
        # Translate `with self.assertRaises(E)` into `with pytest.raises(E)`.
        new_items = []
        rewrote = False
        for item in updated.items:
            ctx = item.item
            if m.matches(ctx, m.Call(func=m.Attribute(value=m.Name('self'), attr=m.Name('assertRaises')))):
                self.outer.needs_pytest_import = True
                new_call = cst.Call(
                    func=cst.Attribute(value=cst.Name('pytest'), attr=cst.Name('raises')),
                    args=ctx.args,
                )
                new_items.append(item.with_changes(item=new_call))
                rewrote = True
            else:
                new_items.append(item)
        if rewrote:
            return updated.with_changes(items=tuple(new_items))
        return updated

    def leave_Attribute(self, original, updated):
        # `<name>.exception` → `<name>.value` (only safe in test bodies after
        # an `as ctx` capture from pytest.raises). We can't track binding
        # names statically, so we apply heuristically — `exception` as an
        # attribute read is unique to assertRaises captures in test code.
        if m.matches(updated, m.Attribute(value=m.Name(), attr=m.Name('exception'))):
            return updated.with_changes(attr=cst.Name('value'))
        return updated


def migrate_source(src: str) -> str:
    tree = cst.parse_module(src)
    new_tree = tree.visit(TestCaseMigrator())
    return new_tree.code


def migrate_file(path: Path, *, check: bool) -> bool:
    src = path.read_text()
    new_src = migrate_source(src)
    if new_src == src:
        return False
    if check:
        sys.stderr.write(f'{path}: would be migrated\n')
        return True
    path.write_text(new_src)
    print(f'{path}: migrated')
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('paths', nargs='+', type=Path)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    failed = 0
    for p in args.paths:
        targets = [p] if p.is_file() else sorted(p.rglob('test_*.py'))
        for t in targets:
            if migrate_file(t, check=args.check):
                failed += 1
    sys.exit(1 if (args.check and failed) else 0)


if __name__ == '__main__':
    main()
