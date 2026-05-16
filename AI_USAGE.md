# AI Usage Disclosure

We used AI tools throughout this project with discipline. Every change cleared the existing test suites before it was committed. Every pull request needed at least one peer review approval before it could land on `dev`. Reviews were done by reading the diff, understanding the change, and manually testing on the deployed app when the change touched a user-visible surface. We expected each pull request to be tested by its author before it was opened. When the AI got something wrong we diagnosed it ourselves rather than asking the bot to find its own bug. The bulk of what reached `dev` and then `main` began as an AI draft. The combination of AI drafting and team-led validation is what produced the v0.9 codebase, not the AI alone.

## Summary

| Area | Tool | Level of reliance |
| --- | --- | --- |
| Backend code (Django REST + service layer) | Claude Code | Major generation |
| Frontend code (React + Vite + TypeScript) | Claude Code, Cursor / Codeium | Partial generation |
| Mobile code (React Native + Expo) | Claude Code, Cursor / Codeium | Partial generation |
| Backend tests (pytest + integration suite) | Claude Code | Major generation |
| Frontend tests (Vitest + Playwright) | Claude Code | Major generation |
| Mobile tests (Jest + manual test plan) | Claude Code | Partial generation |
| Test data and demo seeds (52-service `setup_demo.py`) | Claude Code | Major generation |
| Architectural docs (`docs/security/`, `docs/testing/`) | Claude Code | Major generation |
| Wiki pages (SRS, mockups, scenarios, RACI) | Claude Code | Suggestion only (prose polish) |
| PR review (bot comments) | GitHub Copilot | Suggestion only (advisory) |
| Conceptual learning, library research | ChatGPT, Gemini | Learning only (no code copied) |
| UI / UX design decisions, Figma artefacts | none | n/a |
| Requirements analysis, system design, project management | none | n/a |

This disclosure follows the structure the course specification requires. For each tool we used, we name the task, the level of reliance, and how the output was validated. After that, we map the same use to the artefact categories listed in the spec.

## Tools and how we used them

### Claude Code (Anthropic)

**Task performed.** First-pass authoring of feature files across the Django REST backend, the React + Vite web client, and the React Native + Expo mobile client. Multi-file refactors including the service layer extraction (PR [#354](https://github.com/SWE-574/SWE-574-3/pull/354)) and the three-phase ranking pipeline (PR [#460](https://github.com/SWE-574/SWE-574-3/pull/460)). Test scaffolding for backend pytest and Playwright E2E. Long-form documentation, including the three docs under `docs/` and the v0.9 release notes. Synthetic and mock data, including the 52-service Turkish-language demo seed used during the final presentation rehearsal.

**Level of reliance.** Major generation.

**How the output was validated.** Every change cleared the existing test suites locally and in CI before it was committed. Every PR went through at least one peer reviewer who read the full diff, mentally ran the change against the rest of the codebase, and manually tested on the deployed app when the surface was user-visible. PRs were expected to be tested by their author before being opened. When the AI produced output that did not match production reality, the team diagnosed and fixed the gap itself rather than re-prompting. The proximity NULL collapse and the chip diversifier (described in the examples section below) are concrete records of that pattern.

**Test-driven development with AI.** For most non-trivial backend changes we worked in a test-first loop. We described the behaviour we wanted, asked the AI to draft the failing test against the public API of the module, read the test ourselves to confirm it actually asserted what we meant, then asked the AI to implement against that test. Iteration on the implementation continued until the test went green without weakening the test itself. The same pattern was used for new Playwright flows: write the assertion that would fail today, confirm the assertion captures the user-visible behaviour, then implement until it passes. Writing the test before the implementation kept the AI from drifting toward "code that compiles and looks plausible" and pinned the change to an executable specification.

### GitHub Copilot

**Task performed.** Automated pull-request review only. We did not use Copilot as a code-generation tool or as an inline autocomplete inside editors. The role Copilot played in our workflow was the bot reviewer that posts comments on open PRs.

**Level of reliance.** Suggestion only (advisory). The bot's review never replaced the team's peer review approval gate.

**How the output was validated.** Each Copilot comment was read by a team member, analysed against the surrounding diff, and either acted on or closed without action. Commit `64bb1f5 chore(review): address copilot review comments on #620` and commit `36b9cf4 fix: address review concerns on deferred carve-outs` are records of that triage. Comments that surfaced real issues produced follow-up commits. The rest were closed.

### Cursor, Codeium, and similar AI-assisted editors

**Task performed.** Inline edits, rename refactors, and small component scaffolds inside individual team members' editors.

**Level of reliance.** Suggestion to partial generation, depending on the scope of the edit.

**How the output was validated.** Same gates as Claude Code. Tests had to pass, the diff had to be reviewed, and the change had to be testable end-to-end before it could be opened as a PR.

### Chatbots used for learning (ChatGPT, Gemini, and similar)

**Task performed.** Conceptual learning and research. Team members used web chatbots like ChatGPT and Gemini to learn unfamiliar topics, explore library APIs, and compare implementation approaches before writing code. Typical examples were brushing up on Django Channels semantics, PostGIS proximity functions, Wilson-score confidence intervals, Expo push token registration, and React Native navigation patterns.

**Level of reliance.** Learning only. No code was copied directly from these chat sessions into the repository. Once the concept was understood, the implementation work itself moved into Claude Code, into a peer-reviewed PR, or into a hand-typed edit in the editor.

**How the output was validated.** Every implementation that drew on a chatbot learning session went through the same test-suite, peer-review, and live-app testing gates as the rest of the codebase.

## By artefact category

The spec lists seven categories the disclosure must cover. The mapping below states our actual use for each.

**Source code.** Major generation through Claude Code. Validation through the test suites, peer review of the full diff, and manual testing on the deployed app when the change was user-visible. PRs were expected to be tested by their author before they were opened.

**Documentation.** Major generation through Claude Code for the three docs under `docs/` (`security/geolocation-encryption-posture.md`, `push-notifications.md`, `testing/README.md`) and the v0.9 release notes. Validation by re-reading each doc against the code it described and correcting any drift before commit. The wiki pages (SRS, mockups, UML, meeting notes, weekly status reports, RAM matrix) were authored directly by team members and edited by hand, with AI used at most for spelling and layout polish on a small subset of pages.

**Test cases.** Major generation through Claude Code for the Playwright cluster stabilisation and a large share of the backend pytest scaffolding. Tests had to run green against the live stack. Flaky or wrong-shape tests were removed rather than retried.

**Test data and synthetic or mock data.** Major generation through Claude Code for the 52 demo personas, the Turkish-language service titles, and the event descriptions used during the final presentation rehearsal. Validation by loading each demo run into a clean database and walking the user-facing flows before the rehearsal.

**UI and UX designs.** No AI involvement at the design-decision level. Progressive privacy on listings, the handshake modal flow, the trust-signal placement on profiles, and the Figma artefacts behind all of them were decided in design reviews and recorded on the wiki. Component scaffolds inside the codebase did use Claude Code, but the design decisions behind those scaffolds were ours.

**Prototypes.** No AI involvement at the prototype-design level. The staging deployment at `apiary.selmangunes.com` and the Expo preview builds exercise the source code that fell under the source-code row above.

## Specific examples

**Geolocation encryption documentation** (`docs/security/geolocation-encryption-posture.md`). Drafted with Claude Code, then edited against the actual implementation. Reliance: major generation. Validation: line-by-line check against the production code path. Passages where the AI described an encryption mode the code did not use were rewritten before commit.

**Push notifications documentation** (`docs/push-notifications.md`). Drafted with Claude Code from an outline of the Expo and Firebase wiring. Reliance: major generation. Validation: cross-referenced against the actual notification handlers and preference settings. The draft initially documented a handler signature that did not exist in the codebase, which was corrected before commit.

**Three-phase ranking pipeline refactor** (PR [#460](https://github.com/SWE-574/SWE-574-3/pull/460)). Drafted by Claude Code from a written specification of the three phases (base score, multiplicative factors, stochastic boosts). Reliance: major generation. Validation: the existing ranking tests had to stay green, new tests covered the urgency and capacity multipliers, and the diff was reviewed before merge. The first draft collapsed two factors that needed to remain independent. The team caught it during review and asked for a second pass.

**Online proximity NULL collapse fix** (commit `c0e1ae9`). Two weeks of chasing what looked like an unrelated browse-filter problem before the team worked out that the AI's first fix had used `Coalesce(NULL, 0)`, which had given Online rows the maximum `proximity_factor` of 1.0 instead of the proximity-neutral 0.5 the production fix now uses. Validation: a teammate diagnosed the bug from symptoms on the live deployment.

**Chip diversifier iterations** (commits `5503210`, `c41137b`, `a8c7ac4`, `7e6c39d`, `8bacd0e`). Each AI pass missed a real failure mode that only showed up against the live Browse grid and never against a unit test. The inactive tail. The identity space drift. The invisible-identity run. Validation: the team walked the live Browse page after every iteration until the diversifier did the right thing.

**Onboarding regression** (commit `38eeea3`). Started life as a Copilot review-bot suggestion that, when applied, broke the onboarding E2E test. Validation: the test suite caught the regression and a teammate authored the fix.

**Demo seed data** (`backend/setup_demo.py` and `backend/setup_final_presentation.py`). Major generation through Claude Code. Validation: each demo run loaded into a fresh database and walked through the user-facing flows before the presentation. Earlier seeds with implausible service descriptions were edited or replaced before merge.

## What we did not delegate to AI

Requirements analysis, system design, and project management were done by the team. Customer engagement on this project was the course instructor acting as the customer, so that interaction was a mandatory part of the curriculum rather than a team-led activity. We read the SRS ourselves and decided what each FR and NFR meant in practice. We made the design decisions ourselves: progressive privacy on listings, the handshake state machine, the three-phase ranking pipeline architecture, the trust-signal placement on profiles, the Figma artefacts behind those choices, and the service-layer extraction pattern. We managed the project ourselves through GitHub issues, milestone planning, weekly meetings recorded on the wiki, and the RAM (RACI) matrix.

Where AI did appear in this layer, it was at the level of partial text generation from our own written input. For an issue like "[FR-17l] Location privacy: blur distance to 500m in the feed until handshake is accepted", the team chose the title, the FR anchor, the acceptance criteria, and the technical scope. The AI helped phrase the issue body in clear prose from that input. Organising the SRS on the wiki for correctness, which means consolidating entries, normalising acceptance-criteria phrasing, and catching cross-cluster contradictions, also used AI for the prose pass. The underlying decisions about what each FR required, what the gaps were, and how to scope them were team decisions throughout. None of the 120 SRS-anchored issues was generated from a raw "summarise the SRS" prompt.

Customer feedback from the instructor surfaced changes the team converted into scope decisions ourselves. Dropping the no-show penalty for public events, reworking the age dampener on the ranking feed, and tightening the recurrence rules to Events only were team decisions made in response to that feedback, not AI summaries of it. The discussion of the feedback, the engineering trade-offs, and the eventual scope agreement were team work.

## Authorship

The author of every commit owns the work that commit changes. That has not changed because the first draft came from a tool rather than from a person typing. The purpose of this disclosure is to not shift authorship away from the team members whose names sit on the merged code.
