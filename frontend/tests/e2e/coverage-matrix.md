# E2E coverage matrix

This file maps every Playwright spec to the SRS requirement it asserts.
Closes the requirement-mapping checklist on issue #461.

Regenerate after adding or renaming a spec:

```bash
python3 scripts/regenerate-e2e-matrix.py > frontend/tests/e2e/coverage-matrix.md
```

(The current file is hand-maintained until that script lands; PRs that add a
spec must keep it up to date.)

## Mapping convention

Spec filenames encode their requirement: `NN-<fr|nfr>-<feature>-<sub>.spec.ts`.
Example: `feature-5/01-fr-05a.spec.ts` covers FR-05a.

Specs that don't match the pattern are listed as "unmapped" — these are
exploratory specs (`auth.spec.ts`, `dashboard.spec.ts`, root smoke tests) or
cross-cutting flows (`follow-system/`).

## feature-1 (Auth)
- `feature-1/01-fr-01a.spec.ts` → FR-01a
- `feature-1/02-fr-01b.spec.ts` → FR-01b
- `feature-1/03-fr-01c.spec.ts` → FR-01c
- `feature-1/04-fr-01d.spec.ts` → FR-01d
- `feature-1/05-fr-01e.spec.ts` → FR-01e
- `feature-1/06-fr-01f.spec.ts` → FR-01f
- `feature-1/07-nfr-01a.spec.ts` → NFR-01a
- `feature-1/08-nfr-01b.spec.ts` → NFR-01b
- `feature-1/09-nfr-01c.spec.ts` → NFR-01c
- `feature-1/10-nfr-01d.spec.ts` → NFR-01d

## feature-2 (Profile)
- `feature-2/profile-fr02a.spec.ts` → FR-02a
- `feature-2/profile-fr02b.spec.ts` → FR-02b
- `feature-2/profile-fr02c.spec.ts` → FR-02c
- `feature-2/profile-fr02d.spec.ts` → FR-02d

## feature-3 (Admin / Audit)
- `feature-3/01-fr-03a.spec.ts` → FR-03a
- `feature-3/02-fr-03b.spec.ts` → FR-03b
- `feature-3/03-fr-03c.spec.ts` → FR-03c
- `feature-3/04-fr-03d.spec.ts` → FR-03d
- `feature-3/05-fr-03e.spec.ts` → FR-03e
- `feature-3/06-fr-03f.spec.ts` → FR-03f
- `feature-3/07-nfr-03a.spec.ts` → NFR-03a
- `feature-3/08-nfr-03b.spec.ts` → NFR-03b

## feature-4 (Forum)
- `feature-4/01-fr-04a.spec.ts` … `feature-4/10-nfr-04c.spec.ts` → FR-04a..FR-04g, NFR-04a..NFR-04c

## feature-5 (Services)
- `feature-5/01-fr-05a.spec.ts` … `feature-5/16-nfr-05d.spec.ts` → FR-05a..FR-05l, NFR-05a..NFR-05d

## feature-6 (Discovery / Search)
- `feature-6/01-fr-06a.spec.ts` … `feature-6/15-nfr-06c.spec.ts` → FR-06a..FR-06l, NFR-06a..NFR-06c

## feature-7 (Handshake)
- `feature-7/01-fr-07a.spec.ts` … `feature-7/13-nfr-07c.spec.ts` → FR-07a..FR-07j, NFR-07a..NFR-07c

## feature-8 (Time-bank exchange)
- `feature-8/01-fr-08a.spec.ts` … `feature-8/16-nfr-08c.spec.ts` → FR-08a..FR-08m, NFR-08a..NFR-08c

## feature-9 (QR / check-in)
- `feature-9/01-fr-09a.spec.ts` … `feature-9/12-nfr-09c.spec.ts` → FR-09a..FR-09i, NFR-09a..NFR-09c

## feature-10 (Notifications)
- `feature-10/01-fr-10a.spec.ts` … `feature-10/09-nfr-10c.spec.ts` → FR-10a..FR-10f, NFR-10a..NFR-10c

## feature-11 (Events) — TO BE ADDED
- See issue #268 — feature-11 specs ship as part of this overhaul.

## feature-13 (Detail page)
- `feature-13/01-fr-13a.spec.ts` … `feature-13/17-nfr-13d.spec.ts` → FR-13a..FR-13m, NFR-13a..NFR-13d
- `feature-13/h-interests-public-profile-link.spec.ts` → unmapped (cross-cutting interest link)

## feature-14 (Reputation)
- `feature-14/01-fr-14a.spec.ts` … `feature-14/11-nfr-14d.spec.ts` → FR-14a..FR-14g, NFR-14a..NFR-14d

## feature-15 (Hot score / events)
- `feature-15/01-fr-15a.spec.ts` … `feature-15/09-nfr-15c.spec.ts` → FR-15a..FR-15f, NFR-15a..NFR-15c

## feature-16 (Personalisation)
- `feature-16/01-fr-16a.spec.ts` … `feature-16/07-nfr-16c.spec.ts` → FR-16a..FR-16e, NFR-16a, NFR-16c

## feature-20 (Urgency badge)
- `feature-20/urgency-badge.spec.ts` → unmapped (UX detail spec, no FR)

## a11y
- `a11y/baseline.spec.ts` → NFR-11c (a11y baseline)

## Cross-cutting / smoke
- `auth.spec.ts` → smoke (cookie auth, login redirect)
- `chat.spec.ts` → smoke (1:1 chat happy path)
- `dashboard.spec.ts` → smoke (dashboard renders for authed user)
- `edit-locks.spec.ts` → smoke (concurrent edit lock)
- `email-verification-gate.spec.ts` → smoke (verification gating)
- `group-chat.spec.ts` → smoke (group chat happy path)
- `handshake.spec.ts` → smoke (full handshake flow)
- `service-detail.spec.ts` → smoke (service detail page renders)

## Currently uncovered

Captured from a no-retry full run on dev. Update after each milestone.

- FR-11* — feature-11 suite (#268)
- FR-12* — feature-12 (search ranking) — only backend tests cover this; no E2E
- NFR-11a / NFR-11c — perf + a11y for events (k6 covers NFR-11a; a11y baseline.spec.ts covers part of NFR-11c)
