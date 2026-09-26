# Frontend experience implementation ledger

Current visual specification: the warm-white / technology-blue revision below supersedes the historical dark-theme and particle-typography revisions. Earlier entries are implementation history.

## Factory contacts and order completion (2026-09-26)

- The owning brand's order drawer shows the assigned factory's current contact name and phone for production and completed orders, resolved only by `order.factoryId`. Pending/rejected orders, other brands and guests do not see that section. Each missing field has an explicit unavailable message.
- Server factory contacts, including cleared fields, take precedence over local account caches. Existing-factory login sync omits contacts, preserves the latest server values and refreshes its local cache from the response. Explicit profile edits and initial new-factory sync remain supported; the profile editor opens with current server contacts.
- The owning factory may complete its production order from the existing drawer using `/api/portal/order-status`. Store checks role, ownership and latest state; invalid and repeated completion attempts fail without writes. The existing brand completion workflow is preserved.
- Shared form operations suppress duplicate submissions and remain busy across drawer reopening. Failed status changes refresh the current snapshot while retaining an inline error. Completed orders remain in factory all/completed views and release booked capacity. No CSS or unrelated workspace layout changes.
- Verification: `npm test` (74 tests), `npm run build`, and `node app/verify-factory-completion.cjs` pass. The dedicated browser regression uses isolated temporary state on port 4189 and exercises contacts, cache precedence, permissions, stale state, duplicate submissions, filters and brand completion.
- Existing `verify-order-flow.cjs`, `verify-auth.cjs`, `verify-factory-tabs.cjs` and `verify-brand-workspace.cjs` also pass. Auth/order-flow screenshots now use their existing temporary test directories so these checks run on Windows. `git diff --check` passes.
- Existing demo identity uses `X-Account-Id`; public profiles and snapshot API visibility are unchanged. The contact visibility gate applies to the order drawer, not a new API confidentiality boundary.

Approved brief: the user's implementation plan in this conversation.

- Work in the existing checkout on codex/frontend-experience so the result remains immediately usable in the shared workspace. Preserve the unrelated deleted PDF and local data.
- Architecture: shared CSS tokens and browser runtime; React UI adapters; existing vanilla workspace retained.
- Baseline: 44 Node tests pass using bundled Node (npm not on default PATH).
- Tasks: shared UI/runtime; portal visuals and persistent actions; workspace stepper/demo/bridge; regression and visual review.
- Preserve business APIs, authentication boundaries, metric definitions and provider failures. Static allowlist additions only.

## Progress
- Shared UI runtime and design system implemented; notification and operation primitives tested RED → GREEN.
- Portal visual rewrite, responsive order cards, loading/empty states, reusable dialogs and retained form drafts implemented.
- Canvas particles honor visibility and reduced motion. Notifications use the browser top layer inside the active dialog's accessibility subtree.
- Workspace stepper, two local PNG BOM examples, reversible fill, validated iframe height/scroll/notification bridge implemented.
- Background account profile save is pinned to the initiating account; regression test reproduced cross-account overwrite and now passes.
- 49 unit tests pass. Auth, portal, order flow, feedback and order alert browser suites passed during development; final combined run still pending.
- Experience browser suite passes: demo/undo, failed recognition, stale response, detached form failure/recovery, five widths, reduced motion and static assets.
- Ruling: keep validation errors inline while the submitting form remains open; show actionable error Toast when it has closed. This avoids duplicate screen-reader announcements while retaining recoverability.

## Final verification
- Independent reviewer found two P2 issues: reopened forms did not observe terminal request results; unrelated Toast updates removed focused DOM nodes. Both reproduced and fixed with shared operation snapshots and keyed notification elements.
- New operation-terminal unit test and Toast-focus browser test were observed failing before their fixes, then passed.
- 50 Node tests pass; esbuild production bundle builds; diff whitespace check passes.
- Browser checks: auth, portal, split-order flow, feedback, order alerts, standalone workspace UI, BOM linkage, and expanded experience suite.
- Expanded experience suite includes successful and failed detached requests, login reopening, form recovery, five screen widths, both workspaces, loading/error recovery and local image allowlist checks.
- Screenshots: outputs/frontend-experience/ (ignored build artifacts).
- Delivery: source changes retained on codex/frontend-experience in the shared checkout; no merge, push, remote publication, or modification of the user's existing business data.

## Dark visual revision and narrative landing (2026-09-21)

- Root cause of the user's broken screenshot: the existing 4173 server process predated the shared asset allowlist; workspace CSS and runtime returned 404. Restarted that exact project process and verified assets on 4173. Added no-cache for unversioned static assets.
- User revised the palette after reviewing byocc.cc: charcoal, champagne accents and warm gray typography; green branding removed across both frontends, forms and dialogs.
- Stepper uses a single flex row with explicit list reset and connected progress indicators at all viewport widths. Parent and iframe content use intrinsic min-width constraints; root overflow hiding is a final guard.
- One fixed canvas per standalone document. Homepage particle formations sample a shoe and manufacturing network, slowly scatter and regroup; ambient workspaces retain low-density lines. Embedded workspace has no second animation. Pauses for hidden/offscreen/reduced-motion, with observer and listener cleanup.
- User selected the narrative “让好设计，遇见好制造。” and approved a 3-second automatic, skippable opening, one playback per session. Permanent role actions are “寻找制造伙伴” and “承接品牌订单”. Top navigation remains usable.
- Independent review found the skip button below the fold on short screens; moved it to the top of the hero and added 360×640 / 390×700 / 1440×800 geometry checks.
- The live-site test also reproduced mobile Toast covering Login and pausing its own expiration on hover. Notifications now stay below the measured visible navigation and update on scroll/resize.

### Revision verification

- Production esbuild bundle builds; 50 Node tests pass; whitespace diff check passes.
- Actual `http://localhost:4173` passes the read-only dark UI suite: shared assets 200/no-cache, intro and immediate skip/focus, once-per-session behavior, static reduced-motion mode, shoe/network Canvas transitions, offscreen pause, all six widths and both iframe layers.
- Isolated browser suites pass: auth, portal, experience, order flow, feedback and order alerts.
- Desktop/mobile screenshots and intro/network frames: `outputs/dark-tech/`. Live business writes were intercepted in the 4173 check; no existing orders were modified.

## Persistent particle motto revision (2026-09-21, supersedes prior intro)

- Keep the approved warm charcoal/champagne palette. Studied the reference site's persistent particle lettering, spring return and scroll background transition.
- Replace shoe/network cycling with 1500 desktop / 1000 mobile particles covering the viewport and converging into the two-line motto on every refresh. The motto persists; local pointer repulsion springs back.
- New landing-only Canvas module samples actual heading typography on layout changes, caps DPR at 1.5 and drawing near 30fps, and uses linear frame work. Hidden/nonvisible/reduced-motion states stop the loop; cleanup releases observers and listeners.
- Scroll fades and blurs only the fixed canvas. Foreground controls, headings and cards stay crisp; returning to the top restores the particle motto.
- Added three revealed advantage cards, existing role entry flows, a focus-restoring skip button, and static/semantic heading fallback. Avoid unsupported timing or optimization guarantees in copy.
- Independent review identified invisible role buttons on short landscape screens caused by scroll-driven foreground fading. Removed foreground fading and added 844×390 / 1440×500 viewport regressions.
- Physics tests cover full-field distribution, convergence, pointer displacement and recovery, persistence, reversible scroll and reduced motion. Browser screenshots: outputs/landing-convergence/.
- Final verification: 54 Node tests pass; production esbuild and git diff whitespace checks pass. Landing and dark UI browser suites pass against actual localhost:4173 using read-only business requests, including six widths, two short landscape sizes, iframe bounds and reduced-motion static pixels after font/layout initialization. The isolated experience suite also passed during this revision.

## Warm white and technology blue revision (2026-09-21, current)

- All portal routes, brand/factory workspaces, profiles, forms, dialogs, notifications and standalone/embedded BOM pages share tokens: #F9F8F6 background, white cards, subtle borders/shadows and #2563EB actions. Brand/factory desktop headers share 64px styling; iframe hides its duplicate header. Semantic feedback colors remain.
- Preserve the brand overview, navigation, filters, pagination and drawers. Business APIs, persistence and permission rules are unchanged by this visual revision.
- The homepage uses crisp selectable DOM text with independent sub-second entrance. The first line is slate and the second blue; entry controls never depend on particle completion. Skip immediately reveals content and focuses the first entry.
- Hero-local Canvas reuses canonical shoe and network paths: 2.8s initial convergence, 5s shoe hold, 2.4s morph, 5s network hold, 2.4s return. No particle lettering or global workplace Canvas remains.
- 900 desktop / 450 narrow-screen points, linear updates, 30fps drawing cap, DPR 1.5; pointer avoidance and spring return. Pause offscreen/background and resume current progress. Reduced motion renders a static shoe; unavailable Canvas leaves usable DOM content.
- Current visual browser verification: verify-theme.cjs (legacy verify-dark-ui.cjs delegates), verify-landing.cjs. Screenshots are in outputs/warm-theme/. Workflow regressions use isolated temporary state.
- Final verification: 60 Node tests and production build pass. Landing and experience browser suites pass; warm-theme read-only checks pass against the actual localhost:4173 service. Brand workspace and full order-flow suites also passed during integration. Reviewed 390px mobile, 1280px desktop, 1440×500 short-screen and shoe/network screenshots; independent code review found no unresolved functional issue.
