"""
libcst codemod: replace status-only response assertions with
assert_api_response / assert_problem_detail and fold trivial body-shape
follow-ups into kwargs.

Run:
    python -m scripts.codemods.sweep_status_assertions [--check] PATH [PATH...]

`--check` exits with code 1 if any rewrite would happen, used as the CI
guardrail. With no `--check` flag, files are rewritten in place.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import libcst as cst
import libcst.matchers as m
from libcst.helpers import get_full_name_for_node

HTTP_CONST_TO_INT = {
    'HTTP_200_OK': 200, 'HTTP_201_CREATED': 201, 'HTTP_202_ACCEPTED': 202,
    'HTTP_204_NO_CONTENT': 204,
    'HTTP_301_MOVED_PERMANENTLY': 301, 'HTTP_302_FOUND': 302,
    'HTTP_303_SEE_OTHER': 303, 'HTTP_307_TEMPORARY_REDIRECT': 307,
    'HTTP_308_PERMANENT_REDIRECT': 308,
    'HTTP_400_BAD_REQUEST': 400, 'HTTP_401_UNAUTHORIZED': 401,
    'HTTP_402_PAYMENT_REQUIRED': 402, 'HTTP_403_FORBIDDEN': 403,
    'HTTP_404_NOT_FOUND': 404, 'HTTP_405_METHOD_NOT_ALLOWED': 405,
    'HTTP_406_NOT_ACCEPTABLE': 406, 'HTTP_409_CONFLICT': 409,
    'HTTP_410_GONE': 410, 'HTTP_413_REQUEST_ENTITY_TOO_LARGE': 413,
    'HTTP_415_UNSUPPORTED_MEDIA_TYPE': 415,
    'HTTP_422_UNPROCESSABLE_ENTITY': 422,
    'HTTP_429_TOO_MANY_REQUESTS': 429,
    'HTTP_500_INTERNAL_SERVER_ERROR': 500,
    'HTTP_502_BAD_GATEWAY': 502, 'HTTP_503_SERVICE_UNAVAILABLE': 503,
}

MAX_FOLD = 3


class SweepStatusAssertions(cst.CSTTransformer):
    def __init__(self) -> None:
        self.helper_used = False
        self.problem_used = False
        self.changed = 0

    def leave_IndentedBlock(self, original_node, updated_node):
        body = list(updated_node.body)
        new_body: list[cst.BaseStatement] = []
        i = 0
        while i < len(body):
            stmt = body[i]
            match = self._match_status_assert(stmt)
            if not match:
                new_body.append(stmt)
                i += 1
                continue
            var_name, status_int, status_node = match
            # Only fold body-shape followups for 2xx (assert_api_response).
            # assert_problem_detail's signature is (response, status, *, contains_text=None)
            # — it does not accept contains/schema, so leaving the followups
            # in place is the correct behaviour for 4xx/5xx assertions.
            is_error = status_int is not None and status_int >= 400
            if is_error:
                contains, schema, consumed = [], [], 0
            else:
                contains, schema, consumed = self._collect_followups(
                    body, start=i + 1, var_name=var_name, max_lookahead=MAX_FOLD,
                )
            new_body.append(self._build_helper_call(
                stmt, var_name, status_int, status_node, contains, schema,
            ))
            i += 1 + consumed
            self.changed += 1
            if status_int is not None and status_int >= 400:
                self.problem_used = True
            else:
                self.helper_used = True
        return updated_node.with_changes(body=tuple(new_body))

    def _match_status_assert(self, stmt):
        if not m.matches(stmt, m.SimpleStatementLine()):
            return None
        small = stmt.body[0] if stmt.body else None
        if not m.matches(small, m.Assert()):
            return None
        test = small.test
        if not m.matches(test, m.Comparison()):
            return None
        if len(test.comparisons) != 1:
            return None
        op = test.comparisons[0].operator
        rhs = test.comparisons[0].comparator
        if not m.matches(op, m.Equal()):
            return None
        lhs = test.left
        if not m.matches(lhs, m.Attribute(attr=m.Name('status_code'))):
            return None
        if not m.matches(lhs.value, m.Name()):
            return None
        var_name = lhs.value.value
        status_int, status_node = self._resolve_status(rhs)
        if status_node is None:
            return None
        return var_name, status_int, status_node

    def _resolve_status(self, rhs):
        if isinstance(rhs, cst.Integer):
            try:
                return int(rhs.value), rhs
            except ValueError:
                return None, None
        if m.matches(rhs, m.Attribute(value=m.Name('status'))):
            attr = rhs.attr.value
            return HTTP_CONST_TO_INT.get(attr), rhs
        return None, None

    def _collect_followups(self, body, *, start, var_name, max_lookahead):
        contains: list[str] = []
        schema: list[tuple[str, cst.BaseExpression]] = []
        consumed = 0
        for j in range(start, min(start + max_lookahead, len(body))):
            stmt = body[j]
            key = self._match_contains(stmt, var_name)
            if key is not None:
                contains.append(key)
                consumed += 1
                continue
            schema_pair = self._match_schema(stmt, var_name)
            if schema_pair is not None:
                schema.append(schema_pair)
                consumed += 1
                continue
            break
        return contains, schema, consumed

    def _match_contains(self, stmt, var_name):
        # `assert <key> in <var>.data` or `assert <key> in <var>.json()`
        if not m.matches(stmt, m.SimpleStatementLine()):
            return None
        small = stmt.body[0] if stmt.body else None
        if not m.matches(small, m.Assert()):
            return None
        test = small.test
        if not m.matches(test, m.Comparison()) or len(test.comparisons) != 1:
            return None
        op = test.comparisons[0].operator
        rhs = test.comparisons[0].comparator
        if not m.matches(op, m.In()):
            return None
        if not self._is_data_or_json(rhs, var_name):
            return None
        if not isinstance(test.left, cst.SimpleString):
            return None
        return test.left.evaluated_value

    def _match_schema(self, stmt, var_name):
        # `assert <var>.data['<key>'] == <expr>` or
        # `assert <var>.json()['<key>'] == <expr>`
        if not m.matches(stmt, m.SimpleStatementLine()):
            return None
        small = stmt.body[0] if stmt.body else None
        if not m.matches(small, m.Assert()):
            return None
        test = small.test
        if not m.matches(test, m.Comparison()) or len(test.comparisons) != 1:
            return None
        op = test.comparisons[0].operator
        rhs = test.comparisons[0].comparator
        if not m.matches(op, m.Equal()):
            return None
        sub = test.left
        if not m.matches(sub, m.Subscript()):
            return None
        if not self._is_data_or_json(sub.value, var_name):
            return None
        if not sub.slice or not isinstance(sub.slice[0].slice, cst.Index):
            return None
        idx = sub.slice[0].slice.value
        if not isinstance(idx, cst.SimpleString):
            return None
        return idx.evaluated_value, rhs

    def _is_data_or_json(self, node, var_name):
        if m.matches(node, m.Attribute(value=m.Name(var_name), attr=m.Name('data'))):
            return True
        if m.matches(node, m.Call(func=m.Attribute(value=m.Name(var_name), attr=m.Name('json')))):
            return len(node.args) == 0
        return False

    def _build_helper_call(self, original_stmt, var_name, status_int, status_node, contains, schema):
        status_arg_value = (
            cst.Integer(str(status_int)) if status_int is not None else status_node
        )
        args = [
            cst.Arg(value=cst.Name(var_name)),
            cst.Arg(value=status_arg_value),
        ]
        if contains:
            elements = [cst.Element(value=cst.SimpleString(repr(k))) for k in contains]
            args.append(cst.Arg(
                keyword=cst.Name('contains'),
                value=cst.Set(elements=elements),
                equal=cst.AssignEqual(
                    whitespace_before=cst.SimpleWhitespace(''),
                    whitespace_after=cst.SimpleWhitespace(''),
                ),
            ))
        if schema:
            elements = [
                cst.DictElement(key=cst.SimpleString(repr(k)), value=v)
                for k, v in schema
            ]
            args.append(cst.Arg(
                keyword=cst.Name('schema'),
                value=cst.Dict(elements=elements),
                equal=cst.AssignEqual(
                    whitespace_before=cst.SimpleWhitespace(''),
                    whitespace_after=cst.SimpleWhitespace(''),
                ),
            ))
        helper = (
            'assert_problem_detail'
            if (status_int is not None and status_int >= 400)
            else 'assert_api_response'
        )
        call = cst.Call(func=cst.Name(helper), args=args)
        return cst.SimpleStatementLine(
            body=[cst.Expr(value=call)],
            leading_lines=original_stmt.leading_lines,
            trailing_whitespace=original_stmt.trailing_whitespace,
        )

    def leave_Module(self, original_node, updated_node):
        if not (self.helper_used or self.problem_used):
            return updated_node
        if self._already_imports(updated_node):
            return updated_node
        new_import = cst.parse_statement(
            'from api.tests.helpers.assertions import '
            'assert_api_response, assert_problem_detail\n'
        )
        return self._insert_after_last_import(updated_node, new_import)

    def _already_imports(self, mod):
        for stmt in mod.body:
            if not m.matches(stmt, m.SimpleStatementLine()):
                continue
            for sub in stmt.body:
                if not m.matches(sub, m.ImportFrom()):
                    continue
                if sub.module is None:
                    continue
                name = get_full_name_for_node(sub.module)
                if name == 'api.tests.helpers.assertions':
                    return True
        return False

    def _insert_after_last_import(self, mod, new_stmt):
        body = list(mod.body)
        insert_at = 0
        for i, stmt in enumerate(body):
            if m.matches(stmt, m.SimpleStatementLine()) and any(
                m.matches(s, m.Import() | m.ImportFrom()) for s in stmt.body
            ):
                insert_at = i + 1
        body.insert(insert_at, new_stmt)
        return mod.with_changes(body=tuple(body))


def rewrite_source(src: str) -> tuple[str, int]:
    tree = cst.parse_module(src)
    transformer = SweepStatusAssertions()
    new_tree = tree.visit(transformer)
    return new_tree.code, transformer.changed


def rewrite_file(path: Path, *, check: bool) -> bool:
    src = path.read_text()
    new_src, changed = rewrite_source(src)
    if changed == 0:
        return False
    if check:
        sys.stderr.write(f'{path}: {changed} sites would be rewritten\n')
        return True
    path.write_text(new_src)
    print(f'{path}: rewrote {changed} sites')
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('paths', nargs='+', type=Path)
    ap.add_argument('--check', action='store_true',
                    help='exit 1 if any rewrite would happen, do not modify files')
    args = ap.parse_args()
    failed = 0
    for p in args.paths:
        targets = [p] if p.is_file() else sorted(p.rglob('test_*.py'))
        for t in targets:
            if rewrite_file(t, check=args.check):
                failed += 1
    sys.exit(1 if (args.check and failed) else 0)


if __name__ == '__main__':
    main()
