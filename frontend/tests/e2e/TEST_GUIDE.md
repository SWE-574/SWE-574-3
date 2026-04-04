# E2E Implementation Framework

This document defines the implementation framework for adding a new feature-level E2E suite in this project.
It is based on the structure that was established for Feature 5 and should be treated as the reference pattern for future feature coverage.

## Goal

When a new feature is implemented in E2E:

- tests should map cleanly to requirements
- failures should be readable without opening the code first
- setup should be deterministic
- helpers should stay small and reusable
- assertions should prove the requirement, not the entire page

## Running The Suite

The app stack must already be running before Playwright is started.
Run commands from the `frontend/` directory.

Run the for example the full Feature 5 suite:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5173 npm run test:e2e -- tests/e2e/feature-5
```

Run the for example the full Feature 5 suite in headed mode:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5173 npm run test:e2e -- --headed tests/e2e/feature-5
```

Run a single for example the Feature 5 spec in headed mode:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5173 npm run test:e2e -- --headed tests/e2e/feature-5/07-fr-05g.spec.ts
```

Use `PLAYWRIGHT_BASE_URL=http://localhost:5173` for local runs against the dev stack.

## Core Architecture

Every new feature suite should follow this structure:

- one folder per feature under `frontend/tests/e2e/`
- one spec file per requirement when practical
- shared and feature-specific helpers under `frontend/tests/e2e/helpers/`
- one central barrel export for spec imports

Recommended layout:

```text
frontend/tests/e2e/
  helpers/
    auth.ts
    common.ts
    navigation.ts
    session.ts
    featureX.ts
    index.ts
  feature-x/
    01-fr-xxa.spec.ts
    02-fr-xxb.spec.ts
    03-fr-xxc.spec.ts
    10-nfr-xxa.spec.ts
```

## Requirement Mapping Rule

The suite should be requirement-driven, not page-driven.

That means:

- start from the SRS
- identify each `FR` and `NFR`
- create one primary spec per requirement
- name the file and test after that requirement

Recommended naming:

- `01-fr-05a.spec.ts`
- `02-fr-05b.spec.ts`
- `13-nfr-05a.spec.ts`

Recommended test titles:

- `FR-05a: registered user can create an offer with core details and location type`
- `NFR-05b: only authenticated users can create, edit, or cancel offers`

This is important because the Playwright report should already tell the reader which requirement passed or failed.

## Implementation Workflow

Use this sequence whenever you implement tests for a new feature.

### 1. Break the feature into requirement scenarios

Before writing any code, convert each requirement into a user-visible scenario.

Example conversion:

- requirement says creation should succeed
- scenario becomes: user opens form, submits valid data, lands on detail page, sees created entity

- requirement says unauthorized user cannot edit
- scenario becomes: non-owner attempts edit URL, gets redirected or blocked

Write the scenario first, then the test.

### 2. Decide the minimum proof for each requirement

Each test should prove the requirement with the smallest stable evidence.

Good evidence:

- URL changed
- toast appeared
- lock text appeared
- dashboard search shows the new entity
- action button disappears
- notification item appears

Bad evidence:

- asserting ten unrelated labels
- checking visual details not tied to the requirement
- reproducing the whole page state if only one action matters

### 3. Build deterministic setup

Each test should create its own data whenever possible.
Do not depend on old seeded listings or previous test leftovers.

Use unique entities:

```ts
const title = uniqueTitle('FR-XXx Item')
```

Deterministic setup rules:

- create what you need inside the test
- switch users explicitly
- avoid relying on test execution order
- keep shared state assumptions minimal

### 4. Choose UI setup vs API-assisted setup

Use UI setup when the setup itself is part of what the requirement is testing.

Use API-assisted setup when:

- the user-facing state is the thing you want to assert
- but reaching that state through the UI is repetitive or flaky

Good use of API-assisted setup:

- accepting a pending handshake so the test can verify quota lock behavior
- forcing a state transition that is not the actual subject of the assertion

Bad use of API assistance:

- skipping the exact action that the requirement is supposed to test

Rule:

- stabilize setup with helpers or API
- keep final verification user-visible

## Authentication and User Switching

The default auth helpers live in:

- `frontend/tests/e2e/helpers/auth.ts`

Current shared primitives:

- `loginAs(page, USERS.elif)`
- `expectToast(page, /text/i)`
- `USERS`

### First login rule

Use `loginAs(...)` for the first authenticated action in a test.

Do not use `switchUser(...)` as the first step of a brand-new test page.

Reason:

- `switchUser(...)` clears cookies and browser storage
- if the page is still on `about:blank`, storage access can fail

Safe pattern:

```ts
await loginAs(page, USERS.elif)
await switchUser(page, USERS.mehmet)
```

## Helper Design Rules

Helpers should live under `frontend/tests/e2e/helpers/`.
Specs should import from the central barrel:

```ts
import { loginAs, uniqueTitle, switchUser } from '../helpers'
```

Feature-specific helper modules can still exist internally, but specs should not import from scattered helper files directly unless there is a strong reason.

Helpers should be:

- small
- explicit
- feature-focused
- easy to debug

Good helper candidates:

- create common entity
- switch role
- open dashboard search
- request from detail page
- parse entity id from URL

Bad helper candidates:

- very long end-to-end flows with many branches
- logic that hides important assertions
- one-off behavior used in only one fragile test

### Helper threshold

If a flow is used only once and is UI-fragile, keep it inline in the spec.
Do not abstract too early.

## Recommended Spec Structure

Each spec should read like a short scenario.

Preferred order:

1. create data
2. switch actor if needed
3. build the target state
4. assert the requirement outcome

Recommended shape:

```ts
import { test, expect } from '@playwright/test'
import { loginAs, uniqueTitle, USERS } from '../helpers'

test('FR-XXx: short requirement statement', async ({ page }) => {
  const title = uniqueTitle('FR-XXx Item')

  // Create the initial state.
  await loginAs(page, USERS.elif)

  // Build the scenario.

  // Assert the minimum requirement proof.
  await expect(page.getByText(title).first()).toBeVisible()
})
```

## Comment Style

Every spec should include short scenario comments.
The goal is not code narration.
The goal is fast readability.

Comments should explain:

- who is acting
- what state is being built
- what final outcome is being verified

Good examples:

```ts
// Create the offer as the owner.
// Another user creates a pending handshake on that offer.
// Owner should remain on detail page and see the lock reason.
```

Avoid:

- repeating what the code already says line by line
- long paragraphs inside test bodies

## Assertion Strategy

Use assertions that directly support the requirement.

Preferred assertion types:

- `toHaveURL(...)`
- `toBeVisible(...)`
- `toHaveCount(0)`
- toast checks
- targeted text checks

Rules:

- assert only the important result
- keep text checks as specific as necessary
- use regex when UI copy may vary slightly
- do not assert unstable decorative content

## Data and Naming Strategy

Each test should generate its own unique entity names.

Use:

```ts
const title = uniqueTitle('FR-XXx Offer')
```

This avoids collisions in:

- dashboard search
- notifications
- detail page checks
- multi-user flows

## State-Building Patterns

When a feature has role-based flows, the most stable pattern is:

1. owner creates entity
2. second user performs related action
3. owner returns
4. assertion checks owner-side state or public state

When a feature has capacity or transition rules:

1. create base entity
2. create enough related records to reach the target state
3. use helper/API only if UI state transitions are flaky
4. assert the final locked/filled/hidden/blocked behavior in UI

## Custom Inputs and Non-Native Controls

Do not assume all form controls are native HTML inputs or selects.

Before automating a complex field:

1. inspect the actual component
2. inspect how selection is committed
3. inspect whether the visible results are inline, portal-based, or sibling-based

If the field is custom:

- target the actual rendered result row
- do not assume typing text alone commits selection
- do not assume native select semantics

This is especially important for:

- search-driven inputs
- map/location pickers
- segmented controls
- custom dropdown-like components

## Reliability Rules

A test should fail because the requirement is broken, not because setup is vague.

To keep tests stable:

- create only the minimum state needed
- avoid unnecessary waits
- assert intermediate checkpoints when the flow is complex
- prefer helper reuse over copy-paste, but only when the helper is stable
- keep one main scenario per test

If a scenario is flaky:

1. identify whether the problem is setup or assertion
2. stabilize setup first
3. keep the final requirement proof in the UI

## Performance and NFR Cases

NFR tests should still follow the same structure.

Examples:

- performance: measure one visible flow and assert the threshold
- auth/security: verify access is blocked or protected actions are hidden
- responsiveness: verify core UI remains usable across viewports
- reliability: simulate concurrent or repeated actions with controlled contexts

Do not turn NFR tests into broad system audits.
Each one should still target a specific measurable behavior.

## What to Reuse First

Before implementing a new feature suite, check:

- `frontend/tests/e2e/helpers/index.ts`
- `frontend/tests/e2e/helpers/auth.ts`
- existing feature helper modules under `frontend/tests/e2e/helpers/`
- one nearby spec with a similar actor flow
- `playwright.config.ts`

The goal is consistency first, novelty second.

## Review Checklist for a New Feature Suite

Before considering a new feature suite complete, confirm:

- filenames map to requirement ids
- test titles map to requirement ids
- each test creates its own main data
- first auth step uses `loginAs(...)`
- later user changes use `switchUser(...)`
- comments are short and scenario-focused
- assertions prove the requirement directly
- fragile setup is stabilized
- helper usage is justified
- no test depends on a previous test's data

## Final Principle

A good E2E feature suite in this project should feel like a requirement execution map:

- one requirement
- one scenario
- one proof

If a future agent follows this framework, the resulting suite should look structurally similar to Feature 5 even if the product area is completely different.
