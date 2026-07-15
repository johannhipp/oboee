# Plan 007: Decompose interactive UI and presentation primitives

> Executor instructions: The concurrent work selects an honest copyable Tempo
> CLI handoff instead of browser custody. Preserve that product choice, split
> workflows around server capabilities rather than status guesses, and do not
> claim the browser completed payment. Mark Plan 007 DONE after component tests
> and a manual keyboard/payment-handoff smoke test.
>
> Drift check: git diff --stat 7143943..HEAD -- src/components src/app
> src/lib/mpp.ts package.json vitest.config.ts

## Status

- Status: DONE
- Priority: P2
- Effort: M
- Risk: MED
- Depends on: Plans 005 and 006
- Category: tech-debt, bug, accessibility
- Planned at: commit 7143943, reconciled with the uncommitted worktree on
  2026-07-15

## Why this matters

RfsActions began as a 242-line client component containing funding, claiming,
submission, and purchase state. Concurrent work improves authorization,
network errors, refreshes, and the 402 handoff, but expands it to 379 lines and
adds payment-command state to the same component. Three older copy components
still duplicate fragile clipboard/timer behavior, and concurrent money cleanup
only covers progress and marketplace-row display.

## Current state

- Concurrent `convex/lib/capabilities.ts` and the detail DTO now expose
  `canSubmit`; preserve server-owned authorization while Plan 004 supplies its
  canonical status type.
- Concurrent `rfs-actions.tsx` owns four handlers, every form field, a shared
  loading/message state, a generated shell command, copy behavior, and payment
  polling/refresh behavior in one 379-line component.
- Successful writes now refresh and network failures now surface messages;
  preserve those improvements in the focused components.
- A 402 now produces an explicit Tempo Moderato command via concurrent
  `src/lib/payment-command.ts`. This is an honest handoff, not an automatic
  browser retry, and must remain labeled accordingly.
- `src/lib/payment-command.ts`, `scripts/pay.sh`, and public agent instructions
  risk becoming three owners for the same payment invocation; Plan 008 will
  consolidate their generated/operational contract.
- copy-box.tsx, copy-id.tsx, and copy-text.tsx each own useState, clipboard
  writes, and a 1500ms timer. None handles rejection or timer cleanup.
- copy-id.tsx:25-30 uses a span role=button and casts a keyboard event through
  unknown to MouseEvent. RFSRow nests it inside a Link.
- Concurrent `formatTokenAmount` and its test fix progress/row sub-cent display.
  Detail and profile still repeat `toFixed(2/3)`, while `ProgressBar` and the
  broad row model still accept floating-point dollar values.
- new-rfs-form.tsx and sign-in-form.tsx duplicate inputStyle.
- layout.tsx renders a main element while several pages render another main,
  creating nested main landmarks.

## Target shape

- Server detail DTO exposes a discriminated list of available actions:
  fund, claim, submit, purchase, or read. UI renders only provided actions.
- Each workflow is a focused component with its own request state and tests.
- Paid actions use an injected PaymentClient. For this MVP the implementation
  renders the exact copyable CLI/agent instruction; browser custody remains out
  of scope.
- Clipboard, field styling, request state, and money display each have one
  accessible primitive.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Component tests | npm test -- ui-actions clipboard money | all pass |
| Typecheck | npm run typecheck | exit 0 |
| Lint | npm run lint | exit 0 |
| Build | npm run build | exit 0 |
| Shell smoke | bash -n scripts/pay.sh | exit 0 |

## Scope

In scope:

- src/components/rfs-actions.tsx (replace/remove)
- src/components/rfs-actions/* (create focused components)
- src/components/copy-box.tsx
- src/components/copy-id.tsx
- src/components/copy-text.tsx
- src/components/copy-button.tsx (create)
- src/components/copy-icon.tsx (create)
- src/components/form-field.tsx (create if it removes real duplication)
- src/components/money-text.tsx (create)
- src/components/progress-bar.tsx
- src/components/marketplace-row.tsx or rfs-row.tsx
- src/components/new-rfs-form.tsx
- src/components/sign-in-form.tsx
- src/lib/client/use-api-action.ts (create)
- src/lib/client/use-clipboard.ts (create)
- src/lib/client/payment.ts (create)
- src/lib/payment-command.ts and its test (retain as the selected instruction
  adapter, or move behind the client payment interface)
- src/app/browse/[id]/page.tsx
- src/app/layout.tsx and page landmark wrappers
- Component-test dependencies/configuration if needed

Out of scope:

- Inventing a browser custody model or embedding a private key
- Changing server authorization or price policy
- A visual redesign
- Adding a general-purpose component library

## Git workflow

- Suggested branch: johann/007-ui-primitives
- Commit shared hooks/primitives, action split, and paid-client behavior in
  separate units. Keep server rendering working between units.

## Steps

### Step 1: Make server capabilities exhaustive

Extend the detail DTO from Plan 006 with an availableActions discriminated
union. Each action carries only the data its component needs:

- fund: RFS ID, minimum, token
- claim: RFS ID and sign-in requirement
- submit: RFS ID and claimant authorization
- purchase: skill ID and formatted/listed price
- read: skill ID

The server, not status-only UI logic, decides whether submit/read is present.
Use an exhaustive switch in the action panel so a new action fails typecheck
until rendered.

### Step 2: Add one request-state hook

Create useApiAction with idle, submitting, success, and error states. It must:

- catch network and JSON parsing failures
- ignore updates after unmount
- support one action at a time per component
- call an injected onSuccess, typically router.refresh
- expose an accessible status message

Do not hide endpoint-specific payload parsing in this generic hook.

Write hook tests for success, structured error, non-JSON error, thrown fetch,
double submit, and unmount.

### Step 3: Split the four workflows

Create FundAction, ClaimAction, SubmitSkillForm, and PurchaseOrReadAction.
Each owns only its fields and payload schema and uses useApiAction.

Remove RfsActions after the detail page composes an ActionPanel from
availableActions. Share FormField/input class constants only where markup,
labels, error linkage, and focus behavior are genuinely the same.

Verify: wc -l src/components/rfs-actions/* and inspect that no focused workflow
owns another workflow’s fields.

### Step 4: Finish the selected instruction payment client

Define a small PaymentClient interface around challenge acquisition and paid
result refresh. Use the selected instruction adapter backed by concurrent
`buildTempoPaymentCommand`; do not add browser custody in this plan.

The adapter must produce a command from the exact method, URL, body, and
`WWW-Authenticate` challenge, shell-quote every dynamic value, avoid an
unpinned/unreviewed `npx --yes` install at execution time, and keep account/RPC
choices explicit. Plan 008 should make `scripts/pay.sh` and agent docs consume
the same command contract rather than copy it.

Never create a browser account from a server key or expose an env private key.
Label the control “copy payment command” or “prepare testnet contribution,”
and do not claim the browser completed payment.

Add a test proving raw 402 is not reported as success and a paid 200 response
refreshes the detail state.

STOP if a later requirement reintroduces browser wallet support without an
approved wallet provider/account UX; that is a separate custody decision.

### Step 5: Consolidate clipboard behavior accessibly

Create useClipboard and CopyButton:

- await navigator.clipboard.writeText
- expose success and failure
- clear/reset timers on repeated copy and unmount
- render a semantic button with an accessible name
- announce “copied” through an aria-live region without replacing visible
  content layout
- support disabled/unavailable clipboard state

Make CopyId and CopyText thin presentational wrappers. Reuse one CopyIcon.
Restructure MarketplaceRow so the copy button is not nested inside its detail
link; the title can be the link while author copy is a sibling.

Verify: rg -n 'navigator\\.clipboard|setTimeout\\(' src/components

Expected: only the shared hook owns those APIs.

### Step 6: Centralize sub-cent display

Create MoneyText and update ProgressBar, marketplace rows, detail contributions,
profile contributions/purchases, form previews, and action labels to use Plan
004’s formatter. The formatter must show $0.003 and $0.009 exactly enough to
distinguish them; never round either to $0.00.

ProgressBar receives base-unit bigint/string values or a Money value, not
floating-point dollars.

### Step 7: Fix landmarks and complete interaction tests

Keep exactly one main landmark per page tree. Prefer the root layout main and
replace nested page main elements with section/div, or remove the layout main
and make every page own one consistently.

Add component tests for:

- only server-provided actions render
- submit is absent for a non-claimant
- successful writes refresh
- errors remain visible and controls re-enable
- copy works by mouse, Enter, and Space through native button semantics
- sub-cent values render accurately

Run a manual keyboard smoke test and, if a browser payment adapter exists, one
authorized low-value MPP payment smoke test.

Verify: npm test -- ui-actions clipboard money && npm run lint &&
npm run typecheck && npm run build

Expected: all pass.

## Done criteria

- [x] No multi-workflow RfsActions component remains.
- [x] UI actions are an exhaustive rendering of server capabilities.
- [x] Every successful write refreshes; every network failure is shown.
- [x] Paid controls either complete MPP or honestly provide an external command.
- [x] One clipboard hook/icon/button implementation exists.
- [x] No interactive control is nested inside another interactive control.
- [x] Sub-cent amounts never display as $0.00.
- [x] Exactly one main landmark exists per rendered page.
- [x] Tests, lint, typecheck, and build pass.
- [x] Plan 007 is marked DONE.

## STOP conditions

- Browser payment is required but no approved wallet/custody UX exists.
- The server detail contract cannot distinguish claimant/author permissions.
- Clipboard tests require weakening native button semantics.
- A shared form component needs a large prop matrix to support two callers;
  keep focused markup instead.

## Maintenance notes

Keep components organized by user action, not database status. New paid actions
must depend on PaymentClient and add a 402/retry test. Reviewers should reject
status-derived authorization, floating-point money, and “generic” components
whose variants reproduce the old conditionals.
