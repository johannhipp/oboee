# Plan 006: Unify marketplace read models and row projections

> Executor instructions: Build one public marketplace projection and switch
> callers incrementally. Never reintroduce contentMarkdown into a catalog or
> detail metadata DTO. Mark Plan 006 DONE after all fake RFS row construction
> and unbounded list calls are removed.
>
> Drift check: git diff --stat 7143943..HEAD -- convex/rfs.ts convex/skills.ts
> convex/users.ts src/lib/types.ts src/lib/view-models.ts src/app/page.tsx
> src/app/browse src/app/me src/components/rfs-row.tsx

## Status

- Status: DONE
- Priority: P1
- Effort: M
- Risk: MED
- Depends on: Plans 002, 004, and 005
- Category: tech-debt, perf, architecture
- Planned at: commit 7143943, 2026-07-15

## Why this matters

The product promises one catalog, but the website lists RFS documents while
the API builds a different mixed RFS/skill projection. The shared row accepts
an entire broad RFS interface, so profile and preview callers invent blank
descriptions, null claimants, and fake timestamps. IDs also change meaning
between published website rows and API skill rows.

## Current state

- src/app/page.tsx:12-18 queries rfs.list twice.
- src/app/browse/page.tsx:26-49 queries all RFS rows, filters search in Next,
  maps through toRfsViewModel, and sorts locally.
- convex/skills.ts:46-62 defines a separate catalogItemValidator and
  lines 156-261 build the agent catalog.
- convex/skills.ts:221-243 performs one RFS lookup per published skill.
- convex/rfs.ts:172-200 and 203-230 collect unbounded lists.
- convex/users.ts:101-142 collects all dashboard rows and performs per-row RFS
  and skill/RFS lookups.
- src/lib/types.ts:9-21 defines a broad RFS interface, although RFSRow uses only
  ID, title, status, funding amounts, and author label/ID.
- src/app/me/page.tsx:47-61 fabricates description, scope, claimant, and current
  timestamp to satisfy RFSRow.
- src/components/new-rfs-form.tsx:175-188 repeats the same fake object for a
  preview.
- src/lib/view-models.ts:15-40 manually mirrors a Convex RFS document.
- /api/skills returns itemId as an RFS ID for requests and a skill ID for
  published skills; website /browse links always use an RFS ID.

## Target shape

One Convex public read model returns a discriminated union:

- request: itemId and rfsId are the RFS ID; funding fields are required.
- skill: itemId and skillId are the skill ID; rfsId remains explicit; price and
  summary are required.

Both variants share title, description metadata, tags, author display,
createdAt, and an explicit detailHref. They never contain paid content.
Homepage, browse, API catalog, and row components consume this same shape.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Read-model tests | npm test -- marketplace-read-model | all pass |
| Typecheck | npm run typecheck | exit 0 |
| Lint | npm run lint | exit 0 |
| Build | npm run build | exit 0 |

## Scope

In scope:

- convex/marketplace.ts (create, or rename the existing skills catalog owner)
- convex/rfs.ts
- convex/skills.ts
- convex/users.ts
- convex/schema.ts only if a measured index is needed
- src/lib/marketplace.ts (create)
- src/lib/types.ts
- src/lib/view-models.ts
- src/app/page.tsx
- src/app/browse/page.tsx
- src/app/browse/[id]/page.tsx
- src/app/me/page.tsx
- src/components/rfs-row.tsx (rename to marketplace-row.tsx if appropriate)
- src/components/new-rfs-form.tsx preview adapter
- src/app/api/skills/route.ts and detail routes from Plan 005
- Focused tests

Out of scope:

- Returning protected skill content
- Introducing search infrastructure or denormalizing data without measurement
- Redesigning visual styling; Plan 007 owns it
- Restoring author profile/reputation features

## Git workflow

- Suggested branch: johann/006-marketplace-read-models
- Add the new projection, switch callers, then delete old view mapping.

## Steps

### Step 1: Lock the discriminated projection with tests

Write cases for:

- Open and funded requests have request kind and required funding fields.
- Published skills have skill kind, distinct skillId/rfsId, price, and summary.
- No variant contains contentMarkdown.
- Search matches title, description, scope, summary, and normalized tags.
- Status, tag, author, and query filters compose.
- Ordering is deterministic for equal timestamps.
- Pagination cursor and page size bound every read.

Use Plan 004’s canonical status/money types and Plan 005’s public DTO rules.

### Step 2: Create the single marketplace query

Move the mixed list behavior out of convex/skills.ts into one clearly named
owner such as convex/marketplace.ts. Define its return validator once and infer
the TypeScript result from it.

Accept validated filters and Convex pagination options. Apply filters as close
to indexed reads as possible. When joining a bounded page of skills to RFS
metadata, use bounded parallel lookups; do not collect entire tables.

If current indexes cannot support the chosen page/order, add the smallest
compound index and prove it with the query test. Do not duplicate RFS fields
into skills merely to avoid a bounded lookup.

### Step 3: Make IDs and navigation explicit

Every item must carry itemId, rfsId, optional skillId, and detailHref with
unambiguous semantics. Published skill links may use the skill detail API while
human browse pages may remain RFS-centric, but the chosen href must be produced
by the projection rather than inferred differently by each caller.

Remove the polymorphic assumptions from row and detail callers.

### Step 4: Switch API, homepage, and browse

Use the marketplace query for:

- GET /api/skills
- Homepage open and recently published sections
- Browse filters/search/sort

Use page-size constants and cursors. Preserve current visible ordering unless
the contract test intentionally documents a correction. Remove local full-list
search/sort logic after the query owns it.

Verify: rg -n 'api\\.rfs\\.list|toRfsViewModel' src/app/page.tsx
src/app/browse/page.tsx

Expected: no matches.

### Step 5: Give rows a narrow prop

Replace the broad RFS prop with MarketplaceRowView, containing only rendered
fields. Let the marketplace DTO satisfy it directly. Add a dedicated preview
factory for unsaved form state rather than pretending preview is a database
RFS.

Change dashboard requests to return the same narrow row projection, including
real creation time and author/claim fields only if rendered. Remove the fake
object in src/app/me/page.tsx.

Verify:

- rg -n 'description: ""|scope: ""|new Date\\(\\)\\.toISOString\\(\\)' src/app/me
- rg -n 'interface RFS' src

Expected: no matches.

### Step 6: Bound dashboard and contribution reads

Add explicit limits/pagination to dashboard requests, contributions, and
purchases. Resolve related titles for only the page being returned. Preserve
empty/missing-related-record fallbacks as explicit tombstone labels and test
them.

Do not add caching or denormalization until query metrics show the bounded join
is a problem.

### Step 7: Delete obsolete mapping/types

Remove toRfsViewModel and any remaining broad mirror type. Keep Plan 004’s
shared money formatting and explicit DTO adapters. Rename RFSRow if it now
renders both request and skill variants.

Verify: npm test -- marketplace-read-model && npm run lint &&
npm run typecheck && npm run build

Expected: all pass.

## Done criteria

- [x] One public marketplace projection serves API and website catalog callers.
- [x] Request and skill IDs cannot be confused.
- [x] No catalog/detail metadata DTO contains paid content.
- [x] Row props contain only rendered fields; no caller fabricates document
      fields.
- [x] List/dashboard reads are bounded and have deterministic ordering.
- [x] Old RFS mirror/view mapper is gone.
- [x] Tests, lint, typecheck, and build pass.
- [x] Plan 006 is marked DONE.

## STOP conditions

- Existing clients require the current ambiguous itemId meaning.
- Pagination would change a documented ordering without a migration path.
- A proposed optimization requires duplicating mutable RFS data into skills
  without a consistency mechanism.
- Protected content appears necessary for a public row/preview.

## Maintenance notes

Treat the marketplace projection as the read contract, not the write model.
Add fields only when a consumer renders them. Reviewers should watch for
unbounded collect calls and for a DTO that makes both rfsId and skillId optional
without a discriminant.
