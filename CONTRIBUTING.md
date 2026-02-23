# Contributing to The Hive

Welcome to **Apiary** — a location-based service management and event planning platform developed as part of SWE 574: Software Development as a Team, Spring 2026, at Boğaziçi University.

This document defines the contribution guidelines and workflows that **every team member must follow**. Consistent practices keep our codebase clean, our history readable, and our collaboration smooth.

---

## Table of Contents

1. [Branch Strategy](#1-branch-strategy)
2. [Commit Message Guidelines](#2-commit-message-guidelines)
3. [Pull Request Guidelines](#3-pull-request-guidelines)
4. [Issue Guidelines](#4-issue-guidelines)
5. [Code Review Process](#5-code-review-process)
6. [Testing Requirements](#6-testing-requirements)
7. [Documentation Standards](#7-documentation-standards)
8. [Communication](#8-communication)

---

## 1. Branch Strategy

We follow a **feature-branch workflow**. All work happens on dedicated branches; nothing is committed directly to `main`.

### Branch Naming Convention

```
<type>/<issue-number>-<short-description>
```

| Type | When to Use |
|---|---|
| `feature` | New functionality |
| `fix` | Bug fix |
| `hotfix` | Critical production fix |
| `docs` | Documentation only changes |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or updating tests |
| `chore` | Dependency updates, CI config, tooling |

**Examples:**
```
feature/42-group-offer-voting
fix/17-ranking-algorithm-null-pointer
docs/8-update-api-readme
```

### Rules

- Always branch off from `main` (or the designated sprint branch if one exists).
- Keep branches short-lived. 
- Delete branches after merging.
- Never force-push to `main`.

---

## 2. Commit Message Guidelines

We use the **Conventional Commits** specification. Every commit message must follow this format:

```
<type>(<scope>): <short summary>

[optional body]

[optional footer: Closes #<issue-number>]
```

### Types

| Type | Description |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Formatting, missing semicolons (no logic change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks (dependencies, CI, configs) |

### Rules

- Write the summary in the **imperative mood**: `add`, `fix`, `update` — not `added`, `fixes`, `updated`.
- Keep the summary line under **72 characters**.
- Reference the related issue in the footer: `Closes #42`.
- Do not end the summary line with a period.

**Good examples:**
```
feat(auth): add Google SSO login flow

Closes #11
```
```
fix(ranking): handle null participant count on new offers

Closes #28
```

**Bad examples:**
```
fixed stuff
updated the thing
WIP
```

---

## 3. Pull Request Guidelines

### Before Opening a PR

- [ ] Your branch is up to date with `main` (`git pull origin main --rebase`).
- [ ] All tests pass locally.
- [ ] New code is covered by tests where applicable.
- [ ] No debug code, `console.log`, or commented-out blocks are left in.
- [ ] Linter passes without errors (`flake8` for Django, `eslint` for frontend/mobile).

### PR Title

Use the same format as commit messages:

```
feat(offers): implement group offer voting mechanism
```

### PR Description Template

When opening a PR, fill in the following sections:

```markdown
## Summary
<!-- What does this PR do? Link the issue it resolves. -->
Closes #<issue-number>

## Changes
<!-- Bullet list of key changes -->
-
-

## How to Test
<!-- Step-by-step instructions for the reviewer to verify this works -->
1.
2.

## Screenshots (if applicable)
<!-- Add screenshots for UI changes -->

## Checklist
- [ ] Tests added / updated
- [ ] Documentation updated
- [ ] No breaking changes (or breaking changes are documented)
```

### PR Rules

- Assign at least **one reviewer** before requesting review.
- A PR must receive **at least one approval** before merging.
- The PR author merges after approval (not the reviewer).
- Resolve all review comments before merging.
- Squash commits only if the commit history is noisy; preserve meaningful commits.
- PRs should remain focused — one feature or fix per PR.

---

## 4. Issue Guidelines

Every task, bug, or improvement **must** be tracked as a GitHub Issue. This is mandatory — do not start working on something without a corresponding issue.

> From our meeting on Feb 21, 2026: *"Everyone must open their own specific issues on GitHub if they are working on something."*

### Issue Title

Use a clear and action-oriented title:

```
[Label] Short description of the problem or task
```

**Examples:**
```
[bug] Ranking algorithm crashes when participant count is null
[enhancement] Add Google SSO to login screen
[wiki] Document group offer voting rules
```

### Issue Body Template

```markdown
## Description
<!-- Clear description of the issue or feature request -->

## Expected Behavior
<!-- What should happen? -->

## Current Behavior (for bugs)
<!-- What is actually happening? -->

## Steps to Reproduce (for bugs)
1.
2.
3.

## Acceptance Criteria
<!-- What must be true for this issue to be considered done? -->
- [ ]
- [ ]

## Additional Context
<!-- Screenshots, logs, links to related issues, wiki pages, etc. -->
```

### Assigning Labels

Every issue must have **at least one label**. Use the labels defined in our [Issue Labels wiki page](https://github.com/SWE-574/SWE-574-3/wiki/Issue-Labels):

| Label | When to Use |
|---|---|
| `bug` | Something is broken or not working as expected |
| `enhancement` | New feature or improvement request |
| `documentation` | Improvements or additions to docs/wiki |
| `wiki` | Tasks and improvements for the GitHub Wiki |
| `initialization` | Initial project setup and configuration |
| `good first issue` | Low complexity, suitable for onboarding |
| `help wanted` | Stuck or needs input from others |
| `question` | Clarification needed before work can begin |
| `duplicate` | Issue already exists (link the original, then close) |
| `wontfix` | Agreed not to address this |
| `Invalid` | Does not represent a real issue |

### Assigning Issues

- Assign the issue to yourself when you start working on it.
- Do not assign an issue to someone without their knowledge.
- If an issue is blocking you, add the `help wanted` label and mention the relevant person in a comment.

### Linking Issues to Branches and PRs

- Reference the issue in your branch name: `feature/42-group-offer`.
- Reference the issue in every commit footer: `Closes #42`.
- Reference the issue in the PR description: `Closes #42`.

GitHub will automatically close the issue when the PR is merged.

### Issue Lifecycle

```
Open → In Progress (assigned + branch created) → In Review (PR opened) → Closed (PR merged)
```

- Move your issue to **In Progress** when you start.
- Do not leave issues open and stale. If blocked, comment with the reason.
- Milestones map to sprints — assign your issue to the correct milestone.

---

## 5. Code Review Process

### For Reviewers

- Review within **48 hours** of the PR being assigned to you.
- Check for: correctness, test coverage, readability, adherence to these guidelines.
- Leave constructive, specific comments. Suggest alternatives when requesting changes.
- Use GitHub's suggestion feature for small fixes.
- Approve only when you are genuinely satisfied.

### For Authors

- Respond to every review comment — either with a change or a reasoned explanation.
- Do not dismiss reviews without addressing them.
- Re-request review after addressing all comments.

---

## 6. Testing Requirements

- **Backend (Django):** Unit tests using `pytest-django`. New endpoints require at least one happy-path and one error-path test.
- **Frontend (React/TypeScript):** Component tests with `Vitest` + `React Testing Library`.
- **Mobile (React Native):** Critical flows (auth, offer creation) must have integration tests.
- All tests must pass in CI before a PR can be merged.
- Do not merge a PR that decreases overall test coverage.

---

## 7. Documentation Standards

- Update the **GitHub Wiki** when you change system behavior, add a new feature, or define new business rules.
- API endpoints must be documented (docstring or OpenAPI/Swagger).
- Follow the **Agile SRS format** as agreed in our Feb 21, 2026 meeting when writing requirements.
- Each member is responsible for the use case, scenario (happy/alternative path), mockup, and diagram for their assigned feature area.

---

## 8. Communication

| Channel | Purpose |
|---|---|
| **Slack** | Day-to-day async communication, quick questions |
| **GitHub Issues** | All task tracking and technical discussion |
| **GitHub Discussions / PR comments** | Code-level feedback |
| **Weekly Friday Sync** | Progress review, blockers, planning |
| **Google Docs / NotebookLM** | Brainstorming and draft documents |

- Prefer GitHub comments over Slack for discussions that should be on record.
- If a Slack discussion produces a decision, document it in the relevant GitHub Issue or Wiki page.
- Notify the team in Slack when you open a PR that needs review.

---

*Last updated: February 2026 — maintained by Selman (CI/CD & Project Management)*
