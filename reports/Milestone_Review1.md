# Milestone Review - Customer Milestone 1 - Group 3

**Course:** SWE 574 — Software Development as a Team · **Group:** 3

**Repositories:** [SWE-574-3](https://github.com/SWE-574/SWE-574-3) (backend/frontend) · [mobile-client](https://github.com/SWE-574/mobile-client) (mobile app) · **Wiki:** [SWE-574-3 Wiki](https://github.com/SWE-574/SWE-574-3/wiki) · **Deployment:** [apiary.selmangunes.com](https://apiary.selmangunes.com/)

## A summary of the project status and any changes planned for moving forward

For Customer Milestone 1, we reached a demo-ready state with integrated backend and web functionality covering authentication and roles, profile/public profile, forum and community flows, offer/request/event lifecycle, handshake/session flow, private/group/event chat, review/evaluation, moderation/admin capabilities, and Docker-based deployment. We also built delivery reliability with CI and testing infrastructure in `SWE-574-3/.github/workflows`, `backend/api/tests`, and `frontend/tests/e2e`.

On mobile, we now have core screen and navigation coverage including `Home`, `ServiceDetail`, `Login/Register`, `Profile`, `Messages`, `Chat`, `GroupChat`, `PublicChat`, `Forum`, and `PostService`. In the next phase, we will keep mobile progress incremental and quality-focused instead of claiming full parity with web behavior. We have already completed monorepo consolidation, so it is not a Milestone 2 work item.

For Milestone 2, we will implement a partial HiveMind scope as a minimum viable ranking/search slice, convert customer comments into explicit SRS updates before implementation, and enforce implementation-to-SRS traceability with issue/PR/test evidence. We will also keep demo scope narrower through a fixed, customer-aligned script with a capped number of flows and no ad-hoc additions during the session.

## Summary of customer feedback and reflections

Customer feedback from the milestone demo showed both strong appreciation and clear correction points. The customer valued the forum/community concept, the privacy logic that delays sensitive detail visibility until acceptance, and the Wikidata integration as a meaningful extension of platform knowledge.

At the same time, the customer reported that the demo attempted to present too many screens and features, which reduced clarity. They also highlighted a concrete usability issue in Group Offer flow, where date/time visibility and editability created friction, and raised a requirement question about whether events should support unlimited participants.

We will prioritize scenario depth over feature breadth and resolve requirement ambiguities earlier. Customer comments will be converted into explicit SRS deltas before coding. Future reviews will include direct references to decision records or meeting-note excerpts where useful.

## List and status of deliverables

The following table aligns with the wiki page [List and Status of Deliverables](https://github.com/SWE-574/SWE-574-3/wiki/List-and-Status-of-Deliverables).

| Deliverable                               | Description                                                                                                                                                                    | Location     | Status                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------- |
| Software Requirements Specification (SRS) | Functional and non-functional baseline for The Hive. See [Software Requirements Specification](https://github.com/SWE-574/SWE-574-3/wiki/Software-Requirements-Specification). | Wiki         | Completed (updated iteratively) |
| Software Design (UML Diagrams)            | Core design artifacts (class/component/state/sequence/activity).                                                                                                               | Wiki         | Completed                       |
| Scenarios and Mockups                     | User scenarios and mockups for key product flows.                                                                                                                              | Wiki         | Completed                       |
| Project Plan                              | Milestone roadmap and execution plan.                                                                                                                                          | Wiki         | Completed                       |
| Communication Plan                        | Team communication and coordination strategy.                                                                                                                                  | Wiki         | Completed                       |
| Responsibility Assignment Matrix (RACI)   | Role ownership and accountability mapping.                                                                                                                                     | Wiki         | Completed                       |
| Weekly Reports and Meeting Notes          | Ongoing planning, decisions, and tracking.                                                                                                                                     | Wiki         | Ongoing                         |
| Milestone Review                          | Milestone synthesis and reflection report (this document).                                                                                                                     | Wiki         | Completed                       |
| Individual Contributions                  | Member-level substantiated contribution reports.                                                                                                                               | Wiki         | Completed                       |
| Pre-release Software Version              | Running system across backend/frontend plus mobile track artifacts.                                                                                                            | Repositories | Completed (milestone scope)     |

*Note:* “Completed” here means delivered for Customer Milestone 1 scope. The reflection section below identifies areas that are still partial in requirement coverage or behavioral completeness, so the table and reflection are intentionally read together.

## Evaluation of the status of deliverables and its impact on your project plan (reflection)

We delivered a functioning customer milestone and an integrated baseline across core product flows. Our documentation across SRS, UML, scenarios, and weekly planning notes supported onboarding and decision continuity, and CI plus test support strengthened integration quality.

We did not implement full advanced ranking/discovery behavior, full event penalty-management flow completeness, or full mobile parity at end-to-end validation level.

In the next milestone, we will close these requirement gaps first, enforce requirement-to-implementation traceability before scope expansion, define narrower acceptance criteria, and formalize customer-driven SRS updates before implementation begins.

## Evaluation of tools and processes used to manage your team project

We used GitHub Issues/PR workflow for decomposition and integration, wiki artifacts for shared planning and documentation, Docker-based setup for runtime consistency, and GitHub Actions plus backend/Playwright testing for confidence during merges. This process supported accountability and kept collaboration structured under time pressure.

Our main process weaknesses were: Definition of Done did not consistently enforce requirement-level traceability; some requirement clarifications happened too close to demo time, which increased implementation and narrative drift; and we did not always treat demo readiness as a strict quality gate.

For the next cycle we will address each explicitly. We will update Definition of Done so each completed item includes test evidence and linked documentation/SRS traceability. We will introduce a mandatory demo-readiness checklist (device, data, script, and flow list) and block the demo until it is signed off. We will set a requirement-clarification cutoff at mid-milestone. Any later requirement changes will go through a short change-control step so they do not slip into implementation without SRS update and team alignment.

## The requirements addressed in this milestone

This section is based on [Team Milestone 1 Requirements Mapping](https://github.com/SWE-574/SWE-574-3/wiki/Team-Milestone-1-Requirements-Mapping), cross-checked with closed issues and merged PRs in [SWE-574-3](https://github.com/SWE-574/SWE-574-3) and [mobile-client](https://github.com/SWE-574/mobile-client).

The milestone includes 15 implemented features and 4 partial features.

| Feature | SRS refs | Status |
| --- | --- | --- |
| 1 – Login / Authentication | FR-01a–FR-01f | Implemented |
| 2 – User Profile | FR-02a–FR-02f | Implemented |
| 3 – Admin Panel (Backoffice) | FR-03a–FR-03f | Implemented |
| 4 – Forum / Community Module | FR-04a–FR-04g | Implemented |
| 5 – Create Offer | FR-05a–FR-05l | Implemented |
| 6 – Create Request | FR-06a–FR-06l | Implemented |
| 7 – Time Share | FR-07a–FR-07j | Implemented |
| 8 – Transaction Mechanics | FR-08a–FR-08m | Implemented |
| 9 – Handshake Mechanics | FR-09a–FR-09i | Implemented |
| 10 – Chat Mechanics | FR-10a–FR-10f | Implemented |
| 11 – Create Event | FR-11a–FR-11o | Implemented |
| 13 – View Offer / Request Details | FR-13a–FR-13m | Implemented |
| 14 – Service Evaluation | FR-14a–FR-14f | Implemented |
| 15 – Event Evaluation | FR-15a–FR-15g | Implemented |
| 16 – Evaluation Window Rules | FR-16a–FR-16e | Implemented |

| Feature | SRS refs | Gaps (not fully implemented) |
| --- | --- | --- |
| 12 – View Events | FR-12a–FR-12g | We did not fully implement or end-to-end validate FR-12c (filter by category/date/location), FR-12d (search title/description), FR-12e (quota display), and FR-12g (cancelled events excluded from browse). |
| 17 – Ranking and Hot Score | FR-17a–FR-17h | FR-17e, FR-17f, FR-17g, and parts of FR-17h at full formula/product level. |
| 18 – Event Cancellation and Penalties | FR-18a–FR-18f | FR-18d–FR-18f as a complete penalty-management flow. |
| 19 – Discovery, Search, and Ranking Interface | FR-19a–FR-19i | FR-19b (mobile offline cache), FR-19e and FR-19g (social-follow / graph-based recommendation), and parts of FR-19i (strict GPS proximity). |

We will convert customer comments into explicit SRS updates first, maintain issue/PR/test linkage per requirement in the mapping, and close the partial clusters above before adding new functional breadth.

# Individual contributions

# **Member:** Dicle Naz Özdemir 
---

## 1. Responsibilities
My key responsibilities until the first milestone was to guide the team for the workflow (almost like a scrum master role) and bring the mobile app project to a state that includes some core features such as defining the API modules and types, setting up authentication, chat messaging, general home feed and navigation structure in the app. 
- **Navigation and app shell:** Defining and implementing the app’s navigation structure (bottom tabs, stacks), folder structure, and integration with authentication (AuthProvider, RootNavigator).
- **API layer:** Adding API modules and types (auth, chats, services, users, comments, audit logs, etc.) and ensuring consistent use across screens.
- **Feature implementation:** Delivering end-to-end features for the milestone: home screen with service listing and filtering, chat/messaging (including handshake and WebSocket flows), and profile screen with achievements.
- **UI/UX and quality:** Implementing screens and reusable components, fixing issues from code review (navigation, logout, styling), and improving loading and error handling.
- **Configuration and tooling:** App and EAS configuration (e.g. `app.json`, `eas.json`), build/deploy setup, and test configuration (e.g. Jest, API tests).

---

## 2. Main Contributions

- **Project bootstrap and navigation setup, TypeScript configurations: folder structure, BottomTabNavigator, API client and modules (auth, chats, forum, handshakes, notifications, publicChat, reputation, services, comments, tags, transactions, users, admin, wikidata, types). Later: AuthProvider, RootNavigator, AuthStack, token storage, logout, HomeScreen with service listing and filtering, ServiceCard, QuickFilters, Login/Register/Menu/Messages/Profile screens, and dependency/error-handling refinements.

- **Home screen and app configuration (branch `home-screen` → PR #3):** 
 Refactored app config and navigation; integrated Limelight SDK; extended API (comments, audit logs, websocket URLs); added ServiceDetailScreen, ImagePreviewModal, PostServiceTabButton; improved HomeScreen, ServiceCard, ChatScreen, MessagesScreen; added GroupChatScreen and PublicChatScreen; Jest and API test suite; then addressed PR feedback (navigation logic, UI tweaks) and fixed the logout button.

- **Chat and messaging (branch `chat-messages` → PR #4):** 
 Chat API interfaces and `chatMessages` module; refactored ChatScreen and MessagesScreen to use them; loading states and error handling for chat.

- **Profile screen (branch `profile-screen` → PR #5):** 
 Profile screen layout and styling; display of user info; achievements constants and AchievementsSection component; later “chat completion” work on the profile-screen branch.

- **Chat handshake and WebSocket UX (branch `chat-handshake` → PR #6):** 
 `getGroupChat` API, service types (e.g. "Event", participant count); `useChatWebSocket` and `useHandshake` hooks; ChatInputBar, ChatMessageBubble, ChatHandshakeBanner, ChatTopMeta; refactored ChatScreen to use these hooks and components; chat types and utils; ServiceDetailScreen updates.

---

## 3. Code-Related Significant Issues

- **Navigation and auth flow:** Resolved navigation and UI issues raised in PR review (commit `dd224d1`): ProfileStack simplification, ServiceCard adjustments, LoginScreen/RegisterScreen/ProfileScreen refinements, and color constants.
- **Logout behavior:** Fixed logout button (commit `c75c290`) so it correctly clears session and redirects.
- **Chat loading and errors:** Improved error handling and loading states in MessagesScreen and chat flows (commits `8008151`, `825f584`), including dependency cleanup (e.g. removing unused async-storage) and clearer error handling in the API client.
- **Config and build:** Fixed tsconfig base config extension (commit `4363f35`); added EAS build profiles and safe area handling for the tab bar (commit `d92a725`).
- **Testing:** Added and maintained API tests (Jest) for multiple modules (auth, admin, chats, client, forum, handshakes, notifications, publicChat, reputation, services, servicesComments, tags, transactions, users, wikidata) and test helpers/mocks, supporting regression safety for the demo.
- **Documentation:** Authored `deployment.md` (EAS build profiles, versioning, store submission, troubleshooting), enabling repeatable builds and submission for the milestone.

**Relevant PRs and commits:**

| Issue / area              | PR(s)                   | Relevant commits                |
| ------------------------- | ----------------------- | ------------------------------- |
| Navigation + review fixes | PR #3                   | `dd224d1`, `c75c290`            |
| Chat API and UX           | PR #4, #6               | `825f584`, `6c41cf9`            |
| Dependencies and errors   | (navigation-setup / #2) | `8008151`, `d757f80`, `7910607` |
| EAS and tab bar           | PR #7                   | `d92a725`                       |

---

## 4. Non-Code-Related Significant Issues

- **Deployment and release process:** Documented how to build and deploy the app (EAS profiles, versioning, store submission, secrets) in `deployment.md`, reducing ambiguity for the team and for the demo.
- **PR and integration workflow:** Merged several feature branches (PRs #3, #4, #5, #7) into the main line, keeping the integration path clear for the milestone demo.
- **Review feedback:** Addressed non-trivial PR review comments (navigation logic and UI enhancements) in commit `dd224d1`, improving maintainability and consistency without changing feature scope.

# **Member:** Mustafa Selman Güneş (`sgunes16`, `citizenduck`)  

## Responsibilities

My formally assigned responsibilities in the team were **CI/CD (DevOps)**, **Backend development**, and **Project Management**, as documented in the wiki's RACI matrix and meeting notes. However, at the beginning of the project, while the team decided to continue using the older SWE 573 backend as a starting point, we also decided that the web frontend should be rewritten from scratch so that the product could be shaped more easily around the new SWE 574 requirements. In parallel with that decision, the backend also needed to be adapted and modified according to our evolving needs instead of being used as-is.

Because of this architectural decision, my responsibility area, although initially backend-centered in the RACI matrix, naturally expanded into frontend work as well. As can be seen from my commits and pull requests below, a large portion of my contribution for this milestone was centered around establishing the CI/CD environment, implementing the new frontend from the ground up, improving UI/UX quality, and modifying the backend to align with the new product scope.

My recurring areas of ownership included:

- Setting up and hardening the repository workflow, branch protection mindset, CI pipelines, Docker-based environments, deployment configuration, and release preparation,
- Implementing and refining backend exchange logic, authentication flows, service/handshake rules, transaction behavior, serializer/API updates, and tests for feature implementation and regression prevention,
- Delivering major frontend features for the rewritten web client, especially profile, chat, transaction history, achievements, service detail, map/location UX, media flows, and session-detail flows,
- Supporting my teammates during milestone preparation through issues, selected meeting-note contributions, presentation-role planning, and completion of missing deliverables,
- Reviewing teammates' pull requests and helping integrate work into `dev` safely.

## Main Contributions

My overall contribution to the project was to help turn the repository into a stable, demo-ready, full-stack product rather than a collection of isolated features. More specifically, my work sat at the intersection of infrastructure setup, new frontend implementation, UI/UX refinement, and backend adaptation of the legacy SWE 573 base to the new SWE 574 requirements.

For **Customer Milestone 1**, I contributed in four major layers:

1. **Project and delivery infrastructure**
   I opened and drove foundational work for repository governance and automation, including branch/ruleset discussions, `Contributing.md`, GitHub Actions CI, Docker/Makefile improvements, deployment documentation, and production configuration adjustments. This created the baseline that allowed the team to merge safely, test quickly, and ship a pre-release.

2. **Core product implementation**
   I contributed directly to core user-facing features such as authentication and onboarding, forum pages, map integration, profile/public profile pages, transaction history, achievements, chat and group-chat behavior, media upload/MinIO integration, service detail improvements, admin panel UI/UX fixes and handshake/session-detail mechanics.

3. **Complex business-rule fixes**
   I resolved or refined several non-trivial product rules, especially around group offers, mutual cancellation, transaction accounting, post-transaction evaluation visibility, exact vs. privacy-preserving location sharing, and edge cases that surfaced during demo preparation and late integration.

4. **Documentation and project coordination**
   I contributed to the wiki and issue structure by writing and updating scenario/SRS content for offer-request-event-chat flows, opening and closing planning/implementation issues, and helping assign and clarify milestone responsibilities.

## Code-Related Significant Issues

Below are the most significant code-related issues I personally resolved or substantially drove, with representative pull requests and commits from the `dev` branch.

### 1. CI/CD, repository workflow, and deployment baseline

- I opened and delivered the initial CI pipeline and related project automation work, which was critical for keeping the repository mergeable and demo-ready.
- This included GitHub Actions setup, Docker/deployment support, Makefile improvements, and later CI stability fixes.
- Related issues/PRs:
  - [#51 Set up GitHub Actions CI pipelines](https://github.com/SWE-574/SWE-574-3/issues/51)
  - [#57 Chore/51 GitHub actions ci](https://github.com/SWE-574/SWE-574-3/pull/57)
  - [#69 Mapbox token support in prod Docker](https://github.com/SWE-574/SWE-574-3/pull/69)
- Representative commits:
  - [`f818301`](https://github.com/SWE-574/SWE-574-3/commit/f818301) `feat(ci): improve backend stability checks in CI workflows`
  - [`0006c4c`](https://github.com/SWE-574/SWE-574-3/commit/0006c4c) `feat(ci): enhance MinIO health check in CI workflow`
  - [`933505c`](https://github.com/SWE-574/SWE-574-3/commit/933505c) `chore: update Makefile for improved local development setup`
  - [`f3600f7`](https://github.com/SWE-574/SWE-574-3/commit/f3600f7) `chore: enhance deployment documentation and update Nginx configuration for TLS support for production`

### 2. Authentication, onboarding, and account verification flow

- I implemented and integrated major parts of the cookie-based web authentication architecture and account lifecycle.
- The scope included cookie JWT handling, email verification, password reset, onboarding-related user state, frontend auth flow updates, and corresponding tests.
- Related issue/PR:
  - [#39 Implement Registration & Onboarding flow](https://github.com/SWE-574/SWE-574-3/issues/39)
  - [#77 Feature/39 onboarding auth register](https://github.com/SWE-574/SWE-574-3/pull/77)
- Representative commits:
  - [`49c9efd`](https://github.com/SWE-574/SWE-574-3/commit/49c9efd) `feat: implement cookie-based JWT authentication and email verification features`
  - [`5e9ca68`](https://github.com/SWE-574/SWE-574-3/commit/5e9ca68) `feat: enhance user authentication flow with email verification and password management features`
  - [`ecd48da`](https://github.com/SWE-574/SWE-574-3/commit/ecd48da) `feat: add integration and unit tests for email verification and password reset APIs`
  - [`71f3253`](https://github.com/SWE-574/SWE-574-3/commit/71f3253) `feat: update user model to include verification and onboarding fields`

### 3. Forum, chat, and group-chat foundations

- I contributed to both the initial forum/chat implementation and later refinements around group-chat behavior.
- This work was important because chat is one of the project's core collaboration mechanisms and was central to the customer demo.
- Related issues/PRs:
  - [#42 Implement Chat & Messaging page](https://github.com/SWE-574/SWE-574-3/issues/42)
  - [#47 Implement Forum pages](https://github.com/SWE-574/SWE-574-3/issues/47)
  - [#63 PR for frontend backend logic fixes](https://github.com/SWE-574/SWE-574-3/pull/63)
- Representative commits:
  - [`67c466c`](https://github.com/SWE-574/SWE-574-3/commit/67c466c) `feat: implement forum functionality with categories, topics, and posts`
  - [`533f841`](https://github.com/SWE-574/SWE-574-3/commit/533f841) `feat: add group chat functionality for private services`
  - [`5e460e4`](https://github.com/SWE-574/SWE-574-3/commit/5e460e4) `feat: enhance chat functionality with new modals and routing`
  - [`e78e4de`](https://github.com/SWE-574/SWE-574-3/commit/e78e4de) `feat: update ChatViewSet to calculate active member counts for services`

### 4. Transaction history, TimeBank visibility, and balance correctness

- I implemented the transaction-history page and later fixed several follow-up issues related to serialization, caching, upcoming-balance logic, and receiver/provider visibility.
- This work improved both transparency of the TimeBank model and the reliability of accounting-related UI.
- Related issue/PR:
  - [#44 Implement Transaction History page](https://github.com/SWE-574/SWE-574-3/issues/44)
  - [#129 Feature/44 transaction history page](https://github.com/SWE-574/SWE-574-3/pull/129)
- Representative commits:
  - [`625901e`](https://github.com/SWE-574/SWE-574-3/commit/625901e) `feat: enhance transaction caching and handshake serialization`
  - [`907c675`](https://github.com/SWE-574/SWE-574-3/commit/907c675) `feat: enhance transaction history page and sidebar navigation`
  - [`85c0ace`](https://github.com/SWE-574/SWE-574-3/commit/85c0ace) `feat: update TransactionHistorySerializer to handle nullable handshake fields`
  - [`8ec9b0e`](https://github.com/SWE-574/SWE-574-3/commit/8ec9b0e) `feat: update TransactionHistoryPage to include reserved hours in agreement details`

### 5. User profile, media flows, and MinIO-backed service images

- I delivered major profile/public-profile functionality and also helped solve image/media persistence and display problems.
- This area combined frontend UX, backend storage behavior, and deployment integration.
- Related issues/PRs:
  - [#43 Implement User Profile and Public Profile pages](https://github.com/SWE-574/SWE-574-3/issues/43)
  - [#122 Feature/add image slider-carousel-MinIO](https://github.com/SWE-574/SWE-574-3/pull/122)
- Representative commits:
  - [`79e94db`](https://github.com/SWE-574/SWE-574-3/commit/79e94db) `feat(frontend): enhance user profile and public profile pages with new components and API integrations`
  - [`a3ff231`](https://github.com/SWE-574/SWE-574-3/commit/a3ff231) `feat(frontend): add ImageCropModal component for image cropping functionality`
  - [`f9a338d`](https://github.com/SWE-574/SWE-574-3/commit/f9a338d) `feat(infra): integrate MinIO for S3-compatible object storage`
  - [`b0be5d5`](https://github.com/SWE-574/SWE-574-3/commit/b0be5d5) `feat(storage): integrate MinIO for media storage and enhance service media management`
  - [`e6c7c30`](https://github.com/SWE-574/SWE-574-3/commit/e6c7c30) `feat(nginx): add MinIO configuration for media storage proxy`

### 6. Achievements, UX cleanup, and milestone polish

- I implemented the achievements page and followed it with UI/terminology cleanup work that made the product more coherent for demo use.
- Related issues/PRs:
  - [#48 Implement Achievements page](https://github.com/SWE-574/SWE-574-3/issues/48)
  - [#50 Implement 404 Not Found page](https://github.com/SWE-574/SWE-574-3/issues/50)
  - [#138 feat: implement achievements feature in user profile](https://github.com/SWE-574/SWE-574-3/pull/138)
  - [#134 refactor: update terminology and enhance user experience](https://github.com/SWE-574/SWE-574-3/pull/134)
- Representative commits:
  - [`c79d809`](https://github.com/SWE-574/SWE-574-3/commit/c79d809) `feat: implement achievements feature in user profile`
  - [`7cdce80`](https://github.com/SWE-574/SWE-574-3/commit/7cdce80) `refactor: enhance NotFoundPage accessibility and testing`
  - [`bb5dcbc`](https://github.com/SWE-574/SWE-574-3/commit/bb5dcbc) `refactor: update terminology and enhance user experience across multiple components`

### 7. Mutual cancellation, group-offer accounting, and post-transaction correctness

- I resolved backend/frontend logic around accepted-handshake cancellation, group-offer payment behavior, and visibility of post-transaction actions.
- These were high-impact because they directly affected fairness and correctness of the exchange model.
- Related issues/PRs:
  - [#83 Service Canceling](https://github.com/SWE-574/SWE-574-3/issues/83)
  - [#144 Fix double payment on group offers](https://github.com/SWE-574/SWE-574-3/issues/144)
  - [#145 Fix/144 group offer payments and UI](https://github.com/SWE-574/SWE-574-3/pull/145)
  - [#152 Feature/113 mutual cancellation](https://github.com/SWE-574/SWE-574-3/pull/152)
- Representative commits:
  - [`26ec308`](https://github.com/SWE-574/SWE-574-3/commit/26ec308) `feat: implement cancellation request and approval process for handshakes`
  - [`d853b45`](https://github.com/SWE-574/SWE-574-3/commit/d853b45) `feat: add cancellation request handling to chat and notification components`
  - [`a4464a8`](https://github.com/SWE-574/SWE-574-3/commit/a4464a8) `feat: enhance service validation and transaction handling for group offers`
  - [`2477d43`](https://github.com/SWE-574/SWE-574-3/commit/2477d43) `fix: hide Leave Evaluation on service detail after user has reviewed`

### 8. Session-detail sharing, exact-location logic, and late integration fixes

- During late integration and demo hardening, I handled a substantial set of issues around exact location capture, privacy, online/in-person session branching, and session-detail UX.
- This became one of the most integration-heavy areas because it touched serializers, views, UI forms, maps, group offers, and tests simultaneously.
- Related issues/PRs:
  - [#166 Fix/session detail UI enhancement](https://github.com/SWE-574/SWE-574-3/pull/166)
  - [#169 Feat/setup demo hotfix](https://github.com/SWE-574/SWE-574-3/pull/169) (reviewed/integrated)
  - [#170 Update E2E testing framework and add new test cases](https://github.com/SWE-574/SWE-574-3/pull/170) (open)
- Representative commits:
  - [`53b79c4`](https://github.com/SWE-574/SWE-574-3/commit/53b79c4) `feat: add session location details and maps integration for services`
  - [`50ac386`](https://github.com/SWE-574/SWE-574-3/commit/50ac386) `feat: implement exact location details and validation for group offers`
  - [`2d1ad02`](https://github.com/SWE-574/SWE-574-3/commit/2d1ad02) `feat: enhance location handling and user experience in session details`
  - [`350ace6`](https://github.com/SWE-574/SWE-574-3/commit/350ace6) `feat: improve location handling for online and in-person services`
  - [`8d38f0b`](https://github.com/SWE-574/SWE-574-3/commit/8d38f0b) `feat: add migration to merge session-related changes`

## Non-Code-Related Significant Issues

I also contributed to several non-code work items that materially improved team coordination, documentation quality, and milestone readiness.

### 1. Repository governance and contribution process

- I opened and completed foundational process issues such as:
  - [#22 Create Contributing.md](https://github.com/SWE-574/SWE-574-3/issues/22)
  - [#23 Create Branch Ruleset](https://github.com/SWE-574/SWE-574-3/issues/23)
- Related PR:
  - [#24 docs(settings): add Contributing.md](https://github.com/SWE-574/SWE-574-3/pull/24)
- These helped define how the team would open issues, submit PRs, and protect the main and dev branches.

### 2. SRS, scenarios, and wiki deliverables

- I authored or updated multiple wiki artifacts related to feature flows and milestone documentation.
- Confirmed authored wiki commits include:
  - creation of **SRS – Offer, Request, Event & Chat Features**,
  - updates to **Meeting Notes**,
  - updates to **User Interactions & Scenarios**,
  - later enhancement of the SRS with manual-completion fallback and location-privacy clarifications.
- Representative wiki pages:
  - [SRS – Offer, Request, Event & Chat Features](https://github.com/SWE-574/SWE-574-3/wiki/SRS-%E2%80%93-Offer,-Request,-Event-%26-Chat-Features)
  - [User Interactions & Scenarios](https://github.com/SWE-574/SWE-574-3/wiki/User-Interactions-&-Scenarios)
  - [Meeting Notes](https://github.com/SWE-574/SWE-574-3/wiki/Meeting-Notes)
- Related issues:
  - [#25 docs(offers): write scenarios for group offer feature](https://github.com/SWE-574/SWE-574-3/issues/25)
  - [#9 Draft SRS: Time Currency Logic & Collaborative Features](https://github.com/SWE-574/SWE-574-3/issues/9)
  - [#8 Create User Scenarios & Stories](https://github.com/SWE-574/SWE-574-3/issues/8)

### 3. Milestone coordination and presentation preparation

- I participated in milestone readiness through planning and issue management, including:
  - [#58 Define Roles for Customer Presentation](https://github.com/SWE-574/SWE-574-3/issues/58)
  - participation in final milestone planning documented in the wiki meeting notes.
- This included presentation-role distribution, remaining-deliverable assignment, pre-release preparation, and demo stabilization.

### 4. Planning and issue decomposition

- I opened or owned several implementation and planning issues that converted broad project goals into actionable work items, including CI, auth, transaction history, achievements, service cancellation, frontend optimization, setup-demo enhancement, and profile/UI follow-up topics.
- This issue work supported prioritization, accountability, and smoother merge planning across the team.

## Pull Requests

### Pull requests I created

Based on the GitHub history I created **19 pull requests** in the repository during the observed period:

- **Merged (representative/high-impact):**
  - [#57 Chore/51 GitHub actions ci](https://github.com/SWE-574/SWE-574-3/pull/57)
  - [#63 PR for frontend backend logic fixes](https://github.com/SWE-574/SWE-574-3/pull/63)
  - [#69 Mapbox token support to production Docker](https://github.com/SWE-574/SWE-574-3/pull/69)
  - [#77 Feature/39 onboarding auth register](https://github.com/SWE-574/SWE-574-3/pull/77)
  - [#81 Enhancement UI changes](https://github.com/SWE-574/SWE-574-3/pull/81)
  - [#122 Feature/add image slider-carousel-MinIO](https://github.com/SWE-574/SWE-574-3/pull/122)
  - [#124 Minor fix/wikidata tag](https://github.com/SWE-574/SWE-574-3/pull/124)
  - [#129 Feature/44 transaction history page](https://github.com/SWE-574/SWE-574-3/pull/129)
  - [#134 refactor: update terminology and enhance user experience](https://github.com/SWE-574/SWE-574-3/pull/134)
  - [#138 feat: implement achievements feature in user profile](https://github.com/SWE-574/SWE-574-3/pull/138)
  - [#145 Fix/144 group offer payments and UI](https://github.com/SWE-574/SWE-574-3/pull/145)
  - [#152 Feature/113 mutual cancellation](https://github.com/SWE-574/SWE-574-3/pull/152)
  - [#166 Fix/session detail UI enhancement](https://github.com/SWE-574/SWE-574-3/pull/166)
- **Earlier repository/bootstrap PRs:**
  - [#24 docs(settings): add Contributing.md](https://github.com/SWE-574/SWE-574-3/pull/24)
  - [#31 Merge pull request #30 from SWE-574/main merge](https://github.com/SWE-574/SWE-574-3/pull/31)
  - [#36 chore: remove web-server submodule](https://github.com/SWE-574/SWE-574-3/pull/36)
  - [#38 Feature/37 init frontend](https://github.com/SWE-574/SWE-574-3/pull/38)
- **Closed but not merged:**
  - [#61 chore: update Makefile and add post offer page](https://github.com/SWE-574/SWE-574-3/pull/61)

### Pull requests I reviewed

GitHub review history shows that I reviewed a broad set of teammates' pull requests as part of integration and release preparation. Representative reviewed/approved PRs include:

- [#173 Dev to Main #1](https://github.com/SWE-574/SWE-574-3/pull/173)
- [#169 Feat/setup demo hotfix](https://github.com/SWE-574/SWE-574-3/pull/169)
- [#163 Session Detail Sharing & E2E & Group Recurrency](https://github.com/SWE-574/SWE-574-3/pull/163)
- [#158 Filter created events from joined upcoming events in user profile](https://github.com/SWE-574/SWE-574-3/pull/158)
- [#157 Enhance user profile with event features and review categorization](https://github.com/SWE-574/SWE-574-3/pull/157)
- [#156 fix: enforce service-gated chat and integer demo seeds](https://github.com/SWE-574/SWE-574-3/pull/156)
- [#151 Feature/handshake modal ux](https://github.com/SWE-574/SWE-574-3/pull/151)
- [#149 categorize profile reviews by role](https://github.com/SWE-574/SWE-574-3/pull/149)
- [#140 Embed event chat in detail modal](https://github.com/SWE-574/SWE-574-3/pull/140)
- [#139 Enforce 1–10 hour duration for Offer/Need services](https://github.com/SWE-574/SWE-574-3/pull/139)
- [#137 restrict Max People to Offer/Event](https://github.com/SWE-574/SWE-574-3/pull/137)
- [#136 service editing functionality for offer/need/event](https://github.com/SWE-574/SWE-574-3/pull/136)
- [#135 disable Mapbox telemetry CORS errors](https://github.com/SWE-574/SWE-574-3/pull/135)
- [#133 admin pin event to feed](https://github.com/SWE-574/SWE-574-3/pull/133)
- [#132 reset participant state on recurring service cycles](https://github.com/SWE-574/SWE-574-3/pull/132)
- [#128 idempotent and resilient E2E tests](https://github.com/SWE-574/SWE-574-3/pull/128)
- [#125 polling and lazy-load optimization](https://github.com/SWE-574/SWE-574-3/pull/125)
- [#123 real-time notification system](https://github.com/SWE-574/SWE-574-3/pull/123)
- [#110 WebSocket endpoint documentation](https://github.com/SWE-574/SWE-574-3/pull/110)
- [#108 moderation dashboard and report workflows](https://github.com/SWE-574/SWE-574-3/pull/108)
- [#82 event chat system overhaul](https://github.com/SWE-574/SWE-574-3/pull/82)
- [#75 Core Event System MVP](https://github.com/SWE-574/SWE-574-3/pull/75)
- [#67 harden CI for MVP readiness](https://github.com/SWE-574/SWE-574-3/pull/67)
- [#34 core backend infrastructure and custom user model](https://github.com/SWE-574/SWE-574-3/pull/34)

### My commits under pull requests opened by other teammates

In several cases, some of my authored commits were included under pull requests opened by other teammates. This usually happened when work was continued on a shared branch, bundled into an integration branch, or carried forward through a larger `dev` to `main` merge PR.

- **PRs opened by teammates that directly included my commits**
  - [#84 Feature/68 implement service evaluation](https://github.com/SWE-574/SWE-574-3/pull/84) by `mzyavuz`
    - [`4201b76`](https://github.com/SWE-574/SWE-574-3/commit/4201b76) `fix: hide Leave Evaluation on service detail after user has reviewed`
  - [#108 feat(admin): implement moderation dashboard and report resolution workflows](https://github.com/SWE-574/SWE-574-3/pull/108) by `mzyavuz`
    - [`2477d43`](https://github.com/SWE-574/SWE-574-3/commit/2477d43) `fix: hide Leave Evaluation on service detail after user has reviewed`
    - [`7b7389f`](https://github.com/SWE-574/SWE-574-3/commit/7b7389f) `feat(admin): enhance report retrieval and self-management restrictions`
    - [`77f2b76`](https://github.com/SWE-574/SWE-574-3/commit/77f2b76) `feat(admin): update Admin components for enhanced functionality and UI improvements`
  - [#136 fix/126 service editing functionality for offer need and event](https://github.com/SWE-574/SWE-574-3/pull/136) by `mzyavuz`
    - [`a4ed160`](https://github.com/SWE-574/SWE-574-3/commit/a4ed160) `feat: enhance ServiceSerializer and ServiceForm for media management`
    - [`d5709eb`](https://github.com/SWE-574/SWE-574-3/commit/d5709eb) `refactor: remove unused fields from ServiceSerializer`
    - [`625901e`](https://github.com/SWE-574/SWE-574-3/commit/625901e) `feat: enhance transaction caching and handshake serialization`
    - [`907c675`](https://github.com/SWE-574/SWE-574-3/commit/907c675) `feat: enhance transaction history page and sidebar navigation`
  - [#157 Enhance user profile with event features and review categorization](https://github.com/SWE-574/SWE-574-3/pull/157) by `mzyavuz`
    - [`26ec308`](https://github.com/SWE-574/SWE-574-3/commit/26ec308) `feat: implement cancellation request and approval process for handshakes`
    - [`d853b45`](https://github.com/SWE-574/SWE-574-3/commit/d853b45) `feat: add cancellation request handling to chat and notification components`

- **Teammate-opened PRs that still contained a few my authored commits**
  - [#151 Feature/handshake modal ux](https://github.com/SWE-574/SWE-574-3/pull/151) by `yusufizzetmurat`
    - [`8dbf79b`](https://github.com/SWE-574/SWE-574-3/commit/8dbf79b) `Update DEPLOYMENT.md`
  - [#163 Session Detail Sharing & E2E & Group Recurrency](https://github.com/SWE-574/SWE-574-3/pull/163) by `yusufizzetmurat`
    - [`10a866c`](https://github.com/SWE-574/SWE-574-3/commit/10a866c) `chore: update .gitignore to include frontend test results and .DS_Store`

- These cases show that my contribution was not limited only to PRs that I personally opened; some of my work was also merged through teammate-opened feature branches and integration PRs.

### Merge conflicts and integration challenges

- **PR #145** required syncing the branch with the moving `dev` branch while reconciling business rules for group-offer payments, UI expectations, and transaction behavior.
- **PR #166** required another `dev` synchronization pass and extra follow-up work for tests, `useEffect` correctness, and migration alignment. The merge-migration commit [`8d38f0b`](https://github.com/SWE-574/SWE-574-3/commit/8d38f0b) is a concrete example of resolving branch divergence safely.
- In general, the most frequent conflict sources I handled were:
  - frontend/backend schema drift,
  - concurrent edits on chat/session-detail files,
  - migration-branch divergence,
  - CI/lockfile/env differences between local and integrated branches.

## Additional Information

- I contributed to both the **code repository** and the **GitHub wiki**, so my work should be evaluated across implementation, documentation, and coordination rather than code only.
- My Git history on the repository shows sustained activity under the `citizenduck` / `sgunes16` identity across backend, frontend, infrastructure, and integration work, and the wiki history shows direct authorship on planning/SRS/scenario documents.
- I also used issue creation and decomposition as a project-management tool, helping the team track ownership, turn milestone requirements into actionable tasks, and prepare the customer presentation and release deliverables in a structured way.
- A meaningful part of my contribution happened in **integration and stabilization phases**, where the work is less visible than greenfield feature implementation but highly important for a successful demo and a reliable `main` branch.

# **Member:** Yasemin Sirin

## Responsibilities

My contributions to the project mainly focused on documentation coordination, milestone planning, scenario preparation, design artifacts, and feature implementation. I actively supported the preparation and organization of project documentation, including the Software Requirements Specification (SRS), project planning artifacts, and milestone reports.

In addition to documentation activities, I contributed to feature implementation related to service duration and handshake logic. I also supported demo preparation activities and participated in pull request review processes to help ensure system stability and integration.

---

## Main Contributions (Customer Milestone 1)

During Customer Milestone 1, I contributed to both implementation work and the preparation of milestone deliverables. My work mainly focused on documentation artifacts, system design materials, milestone planning, and feature improvements.

My key contributions include contributing to the consolidation and consistency checks of the **Software Requirements Specification (SRS)**. I also participated in preparing and organizing the **project plan and milestone planning artifacts**.

I contributed to the preparation of **mockup screens** used to represent system interfaces and user flows. Additionally, I participated in the creation and refinement of **UML and system design diagrams** describing the system architecture and workflows.

I prepared and refined **user scenarios** that describe system workflows and user interactions. These scenarios were also used in the milestone presentation.

I contributed to **demo scenario planning** for the milestone presentation and participated in **role assignment planning** for the customer presentation.

Another contribution was documenting **weekly team meetings and development discussions** in the project wiki. I also prepared the **"List and Status of Deliverables"** section for the milestone report.

After the MVP presentation, I prepared the **"Summary of Customer Feedback and Reflections"** section to document the feedback obtained during the demo and reflect on potential improvements.

In addition, I contributed to backend validation improvements related to **time-credit and handshake duration logic**. I also participated in **issue planning and milestone organization** through GitHub issues.

---

## Code-related Contributions

I contributed to implementation work related to time-credit validation and handshake transaction behavior.

One of my contributions was supporting the implementation of **negotiated duration support for the Offer and Need handshake flow**. This ensured that the agreed duration between users is used for time-credit transactions instead of the originally posted duration.

I also contributed to improvements related to **duration validation rules for services**. Additionally, I participated in issue tracking and workflow improvements related to **request-change and decline behaviors in service sessions**.

---

## Documentation and Design Contributions

A significant part of my contribution focused on documentation and design artifacts.

I contributed to combining and validating the **Software Requirements Specification (SRS)** sections to ensure structural consistency across the document.

I supported the preparation and organization of the **project plan and related planning artifacts**.

I prepared and refined **user scenarios** describing how users interact with the system and how key workflows operate.

I also contributed to preparing **mockup screens** that visually represent system interfaces and user flows.

In addition, I participated in the preparation and refinement of **UML and system design diagrams** that describe the architecture and interactions of the system components.

I documented **weekly meetings and team discussions** in the project wiki to ensure that development decisions were properly recorded.

I also prepared milestone reporting sections including the **List and Status of Deliverables** and the **Customer Feedback and Reflection summary**.

---

## Pull Requests

I created the following pull request related to handshake duration improvements:

**PR #143 – Negotiated duration support for Offer/Need handshake flow**  
https://github.com/SWE-574/SWE-574-3/pull/143

This pull request was **merged and approved**, contributing to improving the correctness of time-credit transactions within the system.

---

## Pull Request Reviews

In addition to creating pull requests, I also reviewed and approved pull requests related to the mobile client.

These included pull requests related to **chat functionality improvements** and **profile screen interface updates**.

---

## Issue and Project Coordination Contributions

I actively contributed to issue management and project coordination throughout the development process.

I opened and managed GitHub issues related to documentation tasks, UI improvements, validation logic, milestone preparation, and scenario development.

I also supported **milestone planning and development task tracking** through GitHub Issues.

In addition, I participated in **team discussions and coordination activities** to ensure that implementation tasks, documentation artifacts, and milestone deliverables remained aligned.

# **Member:** Yusuf İzzet Murat (`yusufizzetmurat`)  

From the start, I treated my role as both a builder and an integrator. During this period, I contributed around 120 commits in the main repository, 28 commits in the wiki repository, created 25 PRs in `SWE-574-3`, and reviewed/merged PRs across both web and mobile tracks. My contribution was less about one isolated feature and more about connecting moving parts into a stable milestone outcome.

## Responsibilities

According to our [RAM (RACI) Matrix](https://github.com/SWE-574/SWE-574-3/wiki/RAM-(RACI)-Matrix), my formal scope was **Product Owner / Design**, **Wiki Control** (Accountable), **Backend** (Responsible), and **Test** (Responsible), with additional responsibility on **Requirements / SRS** and consultation on web frontend.

At the beginning of the milestone, the team decided to reuse the SWE-573 backend as the starting point because it already covered the required core functionality and had been tested in prior work. I had implemented that backend base previously, and in this milestone I focused on adapting it to the updated SWE-574 product scope while coordinating web/mobile integration.

My recurring ownership areas were:
- backend and API implementation,
- test reliability and CI stability,
- wiki structure and design artifacts,
- issue decomposition and planning,
- PR review and integration across the two repositories.
## Main Contributions

My overall contribution for Customer Milestone 1 was to turn that backend starting point into a stable, demo-ready integrated product across backend, web frontend, mobile integration points, and documentation.

I contributed in four major layers:

1. **Core product implementation**  
   I delivered and integrated backend capabilities for event lifecycle, chat behavior, notification flow, handshake/session-detail logic, and related business-rule updates.

2. **Integration and stabilization**  
   I handled difficult integration areas (session-detail flow, recurring/group behavior, event modal/chat behavior, and late demo fixes) and reduced regressions during rapid parallel development.

3. **Quality and delivery infrastructure**  
   I strengthened CI/E2E reliability, improved API documentation, and refined Makefile/developer workflow so branches stayed stable under milestone pressure.

4. **Documentation and coordination**  
   I maintained a major portion of the wiki/design baseline (plans, UML diagrams, SRS/scenarios, and milestone communication pages), which kept implementation and presentation aligned.
  
## Code-Related Significant Issues

Below are the most significant code-impacting issues I resolved or reviewed for the demoed codebase, with issue to PR mapping.
### 1) Backend foundation and event core

- [#27](https://github.com/SWE-574/SWE-574-3/issues/27), [#29](https://github.com/SWE-574/SWE-574-3/issues/29), [#33](https://github.com/SWE-574/SWE-574-3/issues/33) -> [PR #34](https://github.com/SWE-574/SWE-574-3/pull/34).
- I built the backend foundation and auth model that the rest of the milestone features relied on.
- [#71](https://github.com/SWE-574/SWE-574-3/issues/71) -> [PR #75](https://github.com/SWE-574/SWE-574-3/pull/75).
- I implemented the core event lifecycle that enabled end-to-end event flows in the demo.
### 2) Chat/event-chat/cancellation and transaction behavior

- [#76](https://github.com/SWE-574/SWE-574-3/issues/76), [#83](https://github.com/SWE-574/SWE-574-3/issues/83) -> [PR #82](https://github.com/SWE-574/SWE-574-3/pull/82), [PR #86](https://github.com/SWE-574/SWE-574-3/pull/86), key commit [`f818cd3`](https://github.com/SWE-574/SWE-574-3/commit/f818cd3).
- I stabilized chat and cancellation behavior so service interactions remained consistent under real user scenarios.

- [#112](https://github.com/SWE-574/SWE-574-3/issues/112) -> [PR #143](https://github.com/SWE-574/SWE-574-3/pull/143), merged by me in commit [`5610388`](https://github.com/SWE-574/SWE-574-3/commit/5610388b646154bf7c14c59566fa263354748168).

- [#113](https://github.com/SWE-574/SWE-574-3/issues/113) -> [PR #152](https://github.com/SWE-574/SWE-574-3/pull/152), merged by me in commit [`ecf1e50`](https://github.com/SWE-574/SWE-574-3/commit/ecf1e5084320441503b97773c90de5fc944c834d).
- I reviewed, validated, and merged teammate implementations for negotiated-hours and cancellation rules so the final behavior remained consistent with issue requirements.
### 3) Notification and UX correctness in demo paths

- [#121](https://github.com/SWE-574/SWE-574-3/issues/121) -> [PR #123](https://github.com/SWE-574/SWE-574-3/pull/123), commit [`2a3eb1b`](https://github.com/SWE-574/SWE-574-3/commit/2a3eb1b).
- I implemented the notification flow so users are informed of state changes as they happen.

- [#66](https://github.com/SWE-574/SWE-574-3/issues/66) -> [PR #135](https://github.com/SWE-574/SWE-574-3/pull/135), commit [`6e51c77`](https://github.com/SWE-574/SWE-574-3/commit/6e51c77).
- I handled the Mapbox/WebGL failure path so location-based views remained usable instead of breaking during demo scenarios.

- [#118](https://github.com/SWE-574/SWE-574-3/issues/118) -> [PR #137](https://github.com/SWE-574/SWE-574-3/pull/137), commit [`118eb75`](https://github.com/SWE-574/SWE-574-3/commit/118eb75).
- I enforced role-aware participant limits so Offer/Event and Need flows behaved correctly and consistently.

- [#115](https://github.com/SWE-574/SWE-574-3/issues/115) -> [PR #132](https://github.com/SWE-574/SWE-574-3/pull/132), commit [`deaaf25`](https://github.com/SWE-574/SWE-574-3/commit/deaaf25).
- I fixed recurring participant-state reset so each new cycle started with correct availability and counts.

- [#120](https://github.com/SWE-574/SWE-574-3/issues/120) -> [PR #133](https://github.com/SWE-574/SWE-574-3/pull/133), commit [`1cc44b0`](https://github.com/SWE-574/SWE-574-3/commit/1cc44b0).
- I implemented admin pinning to make critical events visible and easier to discover from the main feed.

- [#117](https://github.com/SWE-574/SWE-574-3/issues/117) -> [PR #140](https://github.com/SWE-574/SWE-574-3/pull/140), commit [`55bb9c4`](https://github.com/SWE-574/SWE-574-3/commit/55bb9c4).
- I moved event chat into the detail modal to keep users in the same view instead of navigating away.

### 4) Session-detail, profile-review taxonomy, and test stability

- [#114](https://github.com/SWE-574/SWE-574-3/issues/114) -> [PR #149](https://github.com/SWE-574/SWE-574-3/pull/149).
- I separated review perspectives (provider vs taker) so profile trust signals became clearer for users.

- [#146](https://github.com/SWE-574/SWE-574-3/issues/146) -> [PR #151](https://github.com/SWE-574/SWE-574-3/pull/151), commit [`ba6c7c5`](https://github.com/SWE-574/SWE-574-3/commit/ba6c7c5).
- I improved handshake modal UX to reduce ambiguity and speed up agreement flow completion.

- [#162](https://github.com/SWE-574/SWE-574-3/issues/162) -> [PR #163](https://github.com/SWE-574/SWE-574-3/pull/163), commits [`56c203e`](https://github.com/SWE-574/SWE-574-3/commit/56c203e), [`9835342`](https://github.com/SWE-574/SWE-574-3/commit/9835342).
- I refined session-detail and recurrence handling so handshake/location behavior matched practical usage.

- [#155](https://github.com/SWE-574/SWE-574-3/issues/155) -> [PR #156](https://github.com/SWE-574/SWE-574-3/pull/156).
- I fixed mobile seed-image compatibility and related UI regressions so demo content rendered correctly across devices.

### 5) CI/DevEx and release readiness

- [#65](https://github.com/SWE-574/SWE-574-3/issues/65) -> [PR #67](https://github.com/SWE-574/SWE-574-3/pull/67).
- I hardened the CI pipeline so integration branches were validated earlier and with fewer regressions.

- [#109](https://github.com/SWE-574/SWE-574-3/issues/109) -> [PR #110](https://github.com/SWE-574/SWE-574-3/pull/110), commit [`41dc77e`](https://github.com/SWE-574/SWE-574-3/commit/41dc77e).
- I expanded WebSocket documentation so backend behavior and frontend expectations stayed aligned.

- [#80](https://github.com/SWE-574/SWE-574-3/issues/80) -> [PR #125](https://github.com/SWE-574/SWE-574-3/pull/125), [PR #128](https://github.com/SWE-574/SWE-574-3/pull/128), commit [`7b8ac3d`](https://github.com/SWE-574/SWE-574-3/commit/7b8ac3d).
- I improved test reliability and frontend responsiveness together, so repeat runs produced consistent results before release.

- Makefile/help and local workflow fixes in [PR #111](https://github.com/SWE-574/SWE-574-3/pull/111), commit [`00c5740`](https://github.com/SWE-574/SWE-574-3/commit/00c5740).
- I simplified developer setup and command discoverability to speed up onboarding and reduce environment errors.

- Playwright E2E + CI flow in commit [`5b21a17`](https://github.com/SWE-574/SWE-574-3/commit/5b21a172bba1da48d3bac8dc759e4e944a0102a6).
- I improved release confidence by combining CI hardening with deterministic E2E coverage.

## Non-Code-Related Significant Issues

### 1) Documentation and wiki ownership

- As wiki controller, I handled key content architecture and milestone documentation consistency.
- I led a major scenario-doc restructure by migrating and iterating `User Scenarios` into `User Scenarios 1-1`, which improved scope clarity and removed ambiguity between 1-1 and group flow descriptions.
- I expanded the SRS narrative with additional requirement detail and alignment notes so implementation and documentation stayed synchronized during late integration.
- I also prepared and maintained core planning/design pages (Project Plan, RACI, Communication Plan, UML set, weekly updates), which gave the team a single reference point during milestone delivery.
### 2) Planning and issue decomposition
I authored and/or drove many milestone-defining issues, including:
- initialization/core architecture: [#1](https://github.com/SWE-574/SWE-574-3/issues/1), [#2](https://github.com/SWE-574/SWE-574-3/issues/2), [#5](https://github.com/SWE-574/SWE-574-3/issues/5), [#6](https://github.com/SWE-574/SWE-574-3/issues/6), [#7](https://github.com/SWE-574/SWE-574-3/issues/7), [#8](https://github.com/SWE-574/SWE-574-3/issues/8), [#9](https://github.com/SWE-574/SWE-574-3/issues/9), [#10](https://github.com/SWE-574/SWE-574-3/issues/10), [#12](https://github.com/SWE-574/SWE-574-3/issues/12), [#27](https://github.com/SWE-574/SWE-574-3/issues/27), [#29](https://github.com/SWE-574/SWE-574-3/issues/29), [#33](https://github.com/SWE-574/SWE-574-3/issues/33);
- product and milestone implementation stream: [#60](https://github.com/SWE-574/SWE-574-3/issues/60), [#65](https://github.com/SWE-574/SWE-574-3/issues/65), [#66](https://github.com/SWE-574/SWE-574-3/issues/66), [#71](https://github.com/SWE-574/SWE-574-3/issues/71), [#72](https://github.com/SWE-574/SWE-574-3/issues/72), [#73](https://github.com/SWE-574/SWE-574-3/issues/73), [#109](https://github.com/SWE-574/SWE-574-3/issues/109), [#112](https://github.com/SWE-574/SWE-574-3/issues/112), [#113](https://github.com/SWE-574/SWE-574-3/issues/113), [#114](https://github.com/SWE-574/SWE-574-3/issues/114), [#115](https://github.com/SWE-574/SWE-574-3/issues/115), [#116](https://github.com/SWE-574/SWE-574-3/issues/116), [#117](https://github.com/SWE-574/SWE-574-3/issues/117), [#118](https://github.com/SWE-574/SWE-574-3/issues/118), [#119](https://github.com/SWE-574/SWE-574-3/issues/119), [#120](https://github.com/SWE-574/SWE-574-3/issues/120), [#121](https://github.com/SWE-574/SWE-574-3/issues/121), [#146](https://github.com/SWE-574/SWE-574-3/issues/146), [#155](https://github.com/SWE-574/SWE-574-3/issues/155), [#160](https://github.com/SWE-574/SWE-574-3/issues/160), [#161](https://github.com/SWE-574/SWE-574-3/issues/161), [#162](https://github.com/SWE-574/SWE-574-3/issues/162), [#174](https://github.com/SWE-574/SWE-574-3/issues/174), [#175](https://github.com/SWE-574/SWE-574-3/issues/175).
## Disputes, Problems, and Conflict Resolution

This section summarizes the most meaningful development frictions I handled and how I resolved them.

1. **Frontend/backend contract drift in session and location flows**

- Problem: session-detail and address/location changes introduced TypeScript/lint breakages and integration regressions.

- Evidence: commits [`7fa8b4b`](https://github.com/SWE-574/SWE-574-3/commit/7fa8b4b4d44ab22f6f73129744953c2c633f6b03), [`70a8b00`](https://github.com/SWE-574/SWE-574-3/commit/70a8b00440d3b258a750ef4a335f456219ba6c37), [`5dc5e9e`](https://github.com/SWE-574/SWE-574-3/commit/5dc5e9e720d464bd4b86ce560d139846c21efb5b).

- Resolution: I synchronized with latest `dev`, fixed contract/type issues, and re-ran checks before merge.

2. **CI/test flakiness under concurrent changes**

- Problem: CI and E2E reliability dropped while many features were merging in parallel.

- Evidence: [#80](https://github.com/SWE-574/SWE-574-3/issues/80), [PR #125](https://github.com/SWE-574/SWE-574-3/pull/125), [PR #128](https://github.com/SWE-574/SWE-574-3/pull/128), commit [`5b21a17`](https://github.com/SWE-574/SWE-574-3/commit/5b21a172bba1da48d3bac8dc759e4e944a0102a6).

- Resolution: I hardened E2E/CI and reduced flaky paths before final milestone integration.

3. **Branch sync, rebase, and merge-conflict handling under moving `dev`**

- Problem: while `dev` was moving quickly, long-lived feature branches frequently diverged and produced integration conflicts.

- Evidence: repeated sync/rebase-style commits such as [`b9bef93`](https://github.com/SWE-574/SWE-574-3/commit/b9bef93) (merge remote-tracking `origin/dev`), [`b2cd857`](https://github.com/SWE-574/SWE-574-3/commit/b2cd857) (merge `dev` into feature branch), [`6ac90f0`](https://github.com/SWE-574/SWE-574-3/commit/6ac90f0) (resolve merge conflicts while preserving event group-chat behavior), and [`067a6dc`](https://github.com/SWE-574/SWE-574-3/commit/067a6dc) (sync `origin/dev` into CI-hardening branch).

- Resolution: I repeatedly rebased/synced with `dev`, resolved conflicts locally, and merged only after lint/type-check/E2E were green.

Across these conflicts, I followed the same approach: preserve momentum, make integration decisions explicit, and leave the branch cleaner than I found it. That approach was critical in the final week when small regressions could have directly affected the live demo narrative.
## Pull Requests

### Pull requests I created

I created **25** PRs in `SWE-574-3` during the M1 period.

- **Merged:** [#30](https://github.com/SWE-574/SWE-574-3/pull/30), [#34](https://github.com/SWE-574/SWE-574-3/pull/34), [#67](https://github.com/SWE-574/SWE-574-3/pull/67), [#75](https://github.com/SWE-574/SWE-574-3/pull/75), [#82](https://github.com/SWE-574/SWE-574-3/pull/82), [#86](https://github.com/SWE-574/SWE-574-3/pull/86), [#110](https://github.com/SWE-574/SWE-574-3/pull/110), [#111](https://github.com/SWE-574/SWE-574-3/pull/111), [#123](https://github.com/SWE-574/SWE-574-3/pull/123), [#125](https://github.com/SWE-574/SWE-574-3/pull/125), [#128](https://github.com/SWE-574/SWE-574-3/pull/128), [#132](https://github.com/SWE-574/SWE-574-3/pull/132), [#133](https://github.com/SWE-574/SWE-574-3/pull/133), [#135](https://github.com/SWE-574/SWE-574-3/pull/135), [#137](https://github.com/SWE-574/SWE-574-3/pull/137), [#140](https://github.com/SWE-574/SWE-574-3/pull/140), [#149](https://github.com/SWE-574/SWE-574-3/pull/149), [#151](https://github.com/SWE-574/SWE-574-3/pull/151), [#156](https://github.com/SWE-574/SWE-574-3/pull/156), [#163](https://github.com/SWE-574/SWE-574-3/pull/163), [#169](https://github.com/SWE-574/SWE-574-3/pull/169), [#173](https://github.com/SWE-574/SWE-574-3/pull/173), [#176](https://github.com/SWE-574/SWE-574-3/pull/176).
- I opened and drove these PRs from implementation through review feedback to final merge-ready state.

- **Closed (not merged):** [#28](https://github.com/SWE-574/SWE-574-3/pull/28), [#147](https://github.com/SWE-574/SWE-574-3/pull/147).
### Pull requests I merged and reviewed

#### SWE-574-3

I reviewed teammates' PRs continuously and also performed maintainer merges during final integration.

- **Representative reviewed PRs:** [#36](https://github.com/SWE-574/SWE-574-3/pull/36), [#38](https://github.com/SWE-574/SWE-574-3/pull/38), [#69](https://github.com/SWE-574/SWE-574-3/pull/69), [#77](https://github.com/SWE-574/SWE-574-3/pull/77), [#84](https://github.com/SWE-574/SWE-574-3/pull/84), [#122](https://github.com/SWE-574/SWE-574-3/pull/122), [#124](https://github.com/SWE-574/SWE-574-3/pull/124), [#129](https://github.com/SWE-574/SWE-574-3/pull/129), [#134](https://github.com/SWE-574/SWE-574-3/pull/134), [#138](https://github.com/SWE-574/SWE-574-3/pull/138), [#143](https://github.com/SWE-574/SWE-574-3/pull/143), [#145](https://github.com/SWE-574/SWE-574-3/pull/145), [#152](https://github.com/SWE-574/SWE-574-3/pull/152), [#166](https://github.com/SWE-574/SWE-574-3/pull/166), [#177](https://github.com/SWE-574/SWE-574-3/pull/177).

- **Representative merge commits by me:** [`daaea77`](https://github.com/SWE-574/SWE-574-3/commit/daaea77c3459a962728702896f6c9abf279fd199), [`27db47c`](https://github.com/SWE-574/SWE-574-3/commit/27db47ccb088dc3a721bed7d17500d96754f93b3), [`89d33c4`](https://github.com/SWE-574/SWE-574-3/commit/89d33c4c18303d6534bc93faa403bf2cb9fb5d08), [`5610388`](https://github.com/SWE-574/SWE-574-3/commit/5610388b646154bf7c14c59566fa263354748168), [`ecf1e50`](https://github.com/SWE-574/SWE-574-3/commit/ecf1e5084320441503b97773c90de5fc944c834d), [`5c1f11a`](https://github.com/SWE-574/SWE-574-3/commit/5c1f11adb8252d2db3e0d97d1566eb3386e6ca4a).
- I took maintainer responsibility by merging high-impact teammate branches after conflict resolution and validation.

#### mobile-client

- **Approved/reviewed PRs:** [#1](https://github.com/SWE-574/mobile-client/pull/1), [#3](https://github.com/SWE-574/mobile-client/pull/3), [#4](https://github.com/SWE-574/mobile-client/pull/4), [#7](https://github.com/SWE-574/mobile-client/pull/7).

- **Review evidence links:** [#1 review](https://github.com/SWE-574/mobile-client/pull/1#pullrequestreview-3880655108), [#3 review](https://github.com/SWE-574/mobile-client/pull/3#pullrequestreview-3911217741), [#4 review](https://github.com/SWE-574/mobile-client/pull/4#pullrequestreview-3911320110), [#7 review](https://github.com/SWE-574/mobile-client/pull/7#pullrequestreview-3911846827).

- **Merged PR in mobile-client:** [PR #1](https://github.com/SWE-574/mobile-client/pull/1), merge commit [`262a6e9`](https://github.com/SWE-574/mobile-client/commit/262a6e99d10c79a2b1b9d31c1cf4c702af689efe).
- I supported the mobile track by reviewing early architecture PRs and merging the initial setup branch.

### Merge conflicts and how I resolved them

As the deadline approached, most conflicts came from simultaneous edits in chat/session-detail UI, serializers, and CI scripts. My approach was:

1. sync with latest `dev` before final merge,

2. keep both needed behaviors when teammate and my changes solved different edge-cases,

3. run lint/type-check/E2E before merge,

4. push a final cleanup commit only after verification.

This is visible in repeated integration commits and final merges (for example around [#143](https://github.com/SWE-574/SWE-574-3/pull/143), [#145](https://github.com/SWE-574/SWE-574-3/pull/145), [#152](https://github.com/SWE-574/SWE-574-3/pull/152), [#163](https://github.com/SWE-574/SWE-574-3/pull/163)).

# **Member:** M.Zeynep Çakmakcı

## Responsibilities

I took on Backend and Product Owner responsibilities as defined in the team role matrix, remained accountable for SRS consistency, and was responsible for backend/API delivery in shared modules. I also owned the event-related documentation scope (use case, scenario paths, and mockup/diagram responsibility) and contributed to customer milestone preparation and demo readiness. In Customer Milestone 1, I took the role in the end-to-end demo scenario, initiating the forum-based need discovery flow and representing the primary user journey from request creation to completion and review.

## Main contributions (Customer Milestone 1)

Delivered core milestone functionality across evaluation, admin/moderation, reporting, service editing, and event-profile integration.
- Implemented backend and frontend integration work for admin panel/report resolution workflows used in the demo-ready build.
- Implemented service evaluation flow and evaluation-window logic.
- Implemented service editing rules for Offer/Need/Event and related migration fixes.
- Contributed to event-centric profile improvements (created/joined/invited separation and filtering logic).
- Participated in cross-team integration and review flow to stabilize customer milestone and merge milestone Pull Requests.

## Code-related significant issues (resolved/reviewed for M1)

Resolved/implemented directly:
| Issue | Commits | PR |
|---|---|---|
| [#68 Implement Service Evaluation](https://github.com/SWE-574/SWE-574-3/issues/68) | [33501ed](https://github.com/SWE-574/SWE-574-3/commit/33501ed14a4b3ca9f138dddb72f6ba0e73967a56), [1141d9c](https://github.com/SWE-574/SWE-574-3/commit/1141d9c71be41028070bab4a05e30b506a0f2a50), [b237db5](https://github.com/SWE-574/SWE-574-3/commit/b237db511952ab609fd3ab71fe6da9263905c044), [3eb546d](https://github.com/SWE-574/SWE-574-3/commit/3eb546dcad4ee9fb1e29810765a0b234ff9c748b), [ebef9f3](https://github.com/SWE-574/SWE-574-3/commit/ebef9f3e520e00470239099250c489194322dc84), [4b782ee](https://github.com/SWE-574/SWE-574-3/commit/4b782ee717c64169c0ac860403d7185378b94bb9) | [PR #84](https://github.com/SWE-574/SWE-574-3/pull/84) |
| [#85 Implement Admin Panel](https://github.com/SWE-574/SWE-574-3/issues/85) | [48aa367](https://github.com/SWE-574/SWE-574-3/commit/48aa367c0f681fe3937bf21e3dc51c66ef59c702), [58a68c7](https://github.com/SWE-574/SWE-574-3/commit/58a68c7e82d26471a9b0dcc528559d72f2aecbbe), [feaf6ca](https://github.com/SWE-574/SWE-574-3/commit/feaf6ca1d38b565e1cb6426c1ce456b883ecbc04), [3e808da](https://github.com/SWE-574/SWE-574-3/commit/3e808da7f9581e1a2a16acf63cbf9f204b4960de), [e274385](https://github.com/SWE-574/SWE-574-3/commit/e2743858f90cdce92f3fc8e86f55a563443f7015), [9b808de](https://github.com/SWE-574/SWE-574-3/commit/9b808decb9286195d038a48438422bf7e347034d), [e37dcae](https://github.com/SWE-574/SWE-574-3/commit/e37dcae11dce4e21e171cbb0eced6bf74f83ff6f), [e066196](https://github.com/SWE-574/SWE-574-3/commit/e0661968883ba9777f64f4d0878169f1af860765), [f8ee2e9](https://github.com/SWE-574/SWE-574-3/commit/f8ee2e9ae7e96b2cdb98ce6220c603158787e400), [aa14223](https://github.com/SWE-574/SWE-574-3/commit/aa14223aad6b1a59837a9a9418d9930605087f69) | [PR #108](https://github.com/SWE-574/SWE-574-3/pull/108) |
| [#126 Service Editing Functionality for Offer, Need, and Event](https://github.com/SWE-574/SWE-574-3/issues/126) | [a6e45c0](https://github.com/SWE-574/SWE-574-3/commit/a6e45c086f5d0ed574c2fc2d7b9b3d7e23b097ce), [580d767](https://github.com/SWE-574/SWE-574-3/commit/580d76769f886855ffc2171bce2e5b0937854461), [54c3915](https://github.com/SWE-574/SWE-574-3/commit/54c3915308d6c7d1ecad1187f8cd54265031e696), [91fed30](https://github.com/SWE-574/SWE-574-3/commit/91fed30b4ae04eeda30087c666e113e167472b30), [bf7b718](https://github.com/SWE-574/SWE-574-3/commit/bf7b71830698a2acf708ae2c9f00234af28f7ce2) | [PR #136](https://github.com/SWE-574/SWE-574-3/pull/136) |
| [#148 Add event features to user profile page](https://github.com/SWE-574/SWE-574-3/issues/148) | [49b0f8f](https://github.com/SWE-574/SWE-574-3/commit/49b0f8fa401bc5f4a5570056e2d1d3faa7dcb659), [db9f6f1](https://github.com/SWE-574/SWE-574-3/commit/db9f6f19298b6234d38dcd3c644cf7b2bf42377e), [9331c87](https://github.com/SWE-574/SWE-574-3/commit/9331c87b61428d54159fadc70508b267e6ee1fc7), [2ed586d](https://github.com/SWE-574/SWE-574-3/commit/2ed586d5d83478a53837e2ad89cb74809105b09e), [cb35165](https://github.com/SWE-574/SWE-574-3/commit/cb35165e33f96af5483ea74f948e6276e6bced6e) | [PR #157](https://github.com/SWE-574/SWE-574-3/pull/157), [PR #158](https://github.com/SWE-574/SWE-574-3/pull/158) |

Collaborative issue participation (assigned/reviewed/integrated):
| Issue | My commits | PR |
|---|---|---|
| [#73 Admin (Moderator) Dashboard](https://github.com/SWE-574/SWE-574-3/issues/73) | [feaf6ca](https://github.com/SWE-574/SWE-574-3/commit/feaf6ca1d38b565e1cb6426c1ce456b883ecbc04), [9b808de](https://github.com/SWE-574/SWE-574-3/commit/9b808decb9286195d038a48438422bf7e347034d), [e274385](https://github.com/SWE-574/SWE-574-3/commit/e2743858f90cdce92f3fc8e86f55a563443f7015), [e37dcae](https://github.com/SWE-574/SWE-574-3/commit/e37dcae11dce4e21e171cbb0eced6bf74f83ff6f), [e066196](https://github.com/SWE-574/SWE-574-3/commit/e0661968883ba9777f64f4d0878169f1af860765) | [PR #108](https://github.com/SWE-574/SWE-574-3/pull/108) |
| [#83 Service Canceling](https://github.com/SWE-574/SWE-574-3/issues/83) | [d9f8429](https://github.com/SWE-574/SWE-574-3/commit/d9f8429cc67a36695e7b6b429a215e57a700b703) | [PR #86](https://github.com/SWE-574/SWE-574-3/pull/86) |
| [#80 Frontend Optimization](https://github.com/SWE-574/SWE-574-3/issues/80) | [efdb4ea](https://github.com/SWE-574/SWE-574-3/commit/efdb4eafbb2a46bc8430eb142af06ec26282235b) | [PR #125](https://github.com/SWE-574/SWE-574-3/pull/125) |


## Non-code-related significant issues (resolved/reviewed)
| Issue | Brief explanation |
|---|---|
| [#58 Define Roles for Customer Presentation](https://github.com/SWE-574/SWE-574-3/issues/58) | Participated in role definition and milestone demo preparation. |
| [#15 Write scenario for Creating an Event](https://github.com/SWE-574/SWE-574-3/issues/15) | Created and maintained event scenario documentation tied to feature ownership. |
| [#9 [DOC-012] Draft SRS: Time Currency Logic & Collaborative Features](https://github.com/SWE-574/SWE-574-3/issues/9) | Contributed to the early SRS baseline. |
| [#8 [DOC-011] Create User Scenarios & Stories](https://github.com/SWE-574/SWE-574-3/issues/8) | Contributed to scenario and story artifacts. |
| [#6 [INIT-015] Decide Tech Stack](https://github.com/SWE-574/SWE-574-3/issues/6) | Participated in the stack-definition process. |
| [#3 [INIT-012] Communication Setup (Slack)](https://github.com/SWE-574/SWE-574-3/issues/3) | Contributed to communication workflow setup. |
| [#2 [INIT-011] Define Project Labels](https://github.com/SWE-574/SWE-574-3/issues/2), [#1 [INIT-01] Project Initiation](https://github.com/SWE-574/SWE-574-3/issues/1) | Contributed to project initiation and governance setup. |

## Pull requests (created, merged, reviewed)

Created by me:
| Pull Request | Status |
|---|---|
| [#84 Feature/68 implement service evaluation](https://github.com/SWE-574/SWE-574-3/pull/84) | Merged |
| [#108 feat(admin): implement moderation dashboard and report resolution workflows](https://github.com/SWE-574/SWE-574-3/pull/108) | Merged |
| [#136 fix/126 service editing functionality for offer need and event](https://github.com/SWE-574/SWE-574-3/pull/136) | Merged |
| [#157 Enhance user profile with event features and review categorization](https://github.com/SWE-574/SWE-574-3/pull/157) | Merged |
| [#158 Filter created events from joined upcoming events in user profile](https://github.com/SWE-574/SWE-574-3/pull/158) | Merged |
| [#26 Add web-server submodule configuration](https://github.com/SWE-574/SWE-574-3/pull/26) | Merged (early infrastructure baseline) |

Reviewed / merged by me:
| Pull Request | Status |
|---|---|
| [#57 Chore/51 GitHub actions ci](https://github.com/SWE-574/SWE-574-3/pull/57) | Reviewed |
| [#63 PR for frontend backend logic fixes](https://github.com/SWE-574/SWE-574-3/pull/63) | Reviewed and merged by me ([e225d78](https://github.com/SWE-574/SWE-574-3/commit/e225d7827268200bb841ff0441aa5ea775ded15f)) |
| [#75 feat: implement Core Event System MVP](https://github.com/SWE-574/SWE-574-3/pull/75) | Reviewed |
| [#77 Feature/39 onboarding auth register](https://github.com/SWE-574/SWE-574-3/pull/77) | Reviewed |
| [#81 Enhancement UI changes](https://github.com/SWE-574/SWE-574-3/pull/81) | Reviewed and merged by me ([bc159b5](https://github.com/SWE-574/SWE-574-3/commit/bc159b5ca8a7f7d23f65905371294b42107af0d6)) |
| [#82 fix: event chat system](https://github.com/SWE-574/SWE-574-3/pull/82) | Merged by me ([174b437](https://github.com/SWE-574/SWE-574-3/commit/174b4371617cd17dbc2c44dc96c3abd03bc86689)) |
| [#86 feat: service cancel UX + event group chat fix](https://github.com/SWE-574/SWE-574-3/pull/86) | Reviewed and merged by me ([d9f8429](https://github.com/SWE-574/SWE-574-3/commit/d9f8429cc67a36695e7b6b429a215e57a700b703)) |
| [#125 perf: optimize polling intervals, lazy-load images, fix tests](https://github.com/SWE-574/SWE-574-3/pull/125) | Reviewed and merged by me ([efdb4ea](https://github.com/SWE-574/SWE-574-3/commit/efdb4eafbb2a46bc8430eb142af06ec26282235b)) |

## Conflict/integration notes

To reduce merge conflicts, I initially created each branch from the latest available commit. As the customer milestone approached, we started working more synchronously as a team, and new branches were merged before I could open my PR. I resolved these conflicts by carefully combining both incoming and current changes where appropriate. For lines that required preserving values from both sides (for example, dashboard constants), I merged both sets of content to keep functionality complete.
- Resolved integration drift by merging `dev` into feature branches before final merge where needed (e.g., event-profile and admin tracks).
- Resolved migration synchronization with merge migration support during parallel backend work. (e.g service editing)

## Additional information
- Supported customer milestone alignment through documentation and planning artifacts, including role and requirement traceability.
- Set up the Slack workspace to organize and track application-related communication and updates.
