# Backend integration spec

The frontend is a static shell. Every page imports from `src/lib/mock-data.ts` and renders hardcoded data. This doc maps each mock dependency to the real backend work needed to replace it.

## Database schema

Use whatever ORM/DB you want. The TypeScript interfaces in `src/lib/types.ts` are the contract. Match them exactly.

```sql
users
  id            text primary key
  name          text not null
  email         text unique not null
  wallet_address text
  created_at    timestamp default now()

rfs
  id            text primary key
  title         text not null
  description   text not null
  scope         text not null
  funding_threshold numeric not null
  current_amount   numeric default 0
  status        text check (status in ('open','funded','fulfilled','published')) default 'open'
  author_id     text references users(id)
  claimant_id   text references users(id) nullable
  created_at    timestamp default now()

contributions
  id            text primary key
  user_id       text references users(id)
  rfs_id        text references rfs(id)
  amount        numeric not null
  created_at    timestamp default now()

skills
  id            text primary key
  rfs_id        text references rfs(id) unique
  title         text not null
  content       text not null
  created_at    timestamp default now()

purchases
  id            text primary key
  user_id       text references users(id)
  skill_id      text references skills(id)
  amount        numeric not null
  created_at    timestamp default now()
```

Auto-transition `rfs.status` from `open` to `funded` when `current_amount >= funding_threshold`. Do this in the fund endpoint, not a cron.

## Auth

BetterAuth. The frontend has no auth wiring yet. You need to:

1. Set up BetterAuth at `src/lib/auth.ts`
2. Create `src/app/api/auth/[...all]/route.ts` catch-all
3. Add sign-in/sign-up UI (keep the ASCII aesthetic -- monospace inputs, no component library)
4. Gate `/new` and `/me` behind auth. `/browse` and `/` stay public.
5. Replace `getCurrentUser()` calls in `src/app/me/page.tsx` with the real session user
6. The header (`src/components/header.tsx`) needs a sign-in link when unauthenticated, user name when authenticated. This component is already `'use client'`.

User's `walletAddress` can be set in profile or derived from BetterAuth session if using wallet-based auth.

## API routes

### Reads (replace mock-data.ts imports)

These are the mock functions each page calls. Replace with real DB queries. Keep the same return types.

| Page | Currently imports from mock-data.ts | Replace with |
|------|-------------------------------------|--------------|
| `page.tsx` (landing) | `rfsList` filtered by status | DB query: `SELECT * FROM rfs WHERE status = 'open'` and `WHERE status = 'published' ORDER BY created_at DESC LIMIT 4` |
| `browse/page.tsx` | `rfsList` (all, sorted) | DB query: `SELECT * FROM rfs ORDER BY ...` with optional `?status=` and `?q=` query params |
| `browse/[id]/page.tsx` | `getRFSById`, `getContributionsForRFS`, `getSkillForRFS`, `getUserById` | DB queries by id. Join contributions and user for the backers list. |
| `me/page.tsx` | `getCurrentUser`, `getUserContributions`, `getUserPurchases`, `rfsList`, `skills` | Session user id → query rfs, contributions, purchases |
| `new/page.tsx` | nothing (static form) | Needs form action (see writes below) |

You can do these as direct DB calls in server components (no API route needed) or via API routes if you prefer. Server component DB calls are simpler for reads.

### Writes (new API routes)

```
POST /api/rfs
  Auth: required
  Body: { title, description, scope, fundingThreshold }
  Action: Insert new RFS with status 'open', author_id from session
  Response: { id } (redirect to /browse/{id})
  Wire to: <form> in src/app/new/page.tsx (add server action or form action)

POST /api/rfs/[id]/fund
  Auth: required (for tracking backer)
  MPP: mppx.charge({ amount: contribution_amount })
  Body: { amount }
  Action:
    1. Verify MPP payment
    2. Insert contribution (user_id, rfs_id, amount)
    3. UPDATE rfs SET current_amount = current_amount + amount
    4. If current_amount >= funding_threshold: UPDATE status = 'funded'
  Response: { rfs_id, new_total, status }
  Wire to: "fund this request" button in src/app/browse/[id]/page.tsx

POST /api/rfs/[id]/claim
  Auth: required
  Action: UPDATE rfs SET claimant_id = session.user.id, status = 'fulfilled' WHERE status = 'funded'
  Guard: Only one claimant. Reject if already claimed.
  Response: { rfs_id }
  Wire to: "claim & write this skill" button

POST /api/rfs/[id]/submit-skill
  Auth: required (must be claimant)
  Body: { content } (markdown string)
  Action: Insert skill, update rfs status to 'published'
  Response: { skill_id }
  Note: No review step for hackathon. Auto-publish on submit.

GET /api/skills/[id]/content
  Auth: none (agent-accessible)
  MPP: mppx.charge({ amount: "0.005" })
  Action:
    1. If requester is a backer (contributed >= min amount): return content free
    2. Otherwise: charge via MPP, insert purchase record, return content
  Response: { content } (the full skill markdown)
  Wire to: "buy for $0.005" button
  Note: This is the agent-facing purchase endpoint. Agents discover via GET /api/skills.
```

### Agent-facing discovery (new API route)

```
GET /api/skills
  Auth: none
  Query params: ?status=open|funded|published  ?q=search_term
  Response: JSON array of RFS objects (same shape as src/lib/types.ts RFS)
  Purpose: Agents call this to discover available skills and open requests
  Note: This replaces the decorative `curl oboe.sh/api/skills` on the landing page
```

## MPP integration

`src/lib/mpp.ts` is already configured with Tempo on testnet. Use `mppx.charge()` for:

1. **Fund endpoint** (`/api/rfs/[id]/fund`): variable amount from request body. `mppx.charge({ amount: body.amount.toString() })`.
2. **Buy endpoint** (`/api/skills/[id]/content`): fixed amount. `mppx.charge({ amount: "0.005" })`.

Pattern from existing code (`src/app/api/bid/route.ts`):
```ts
export const POST = mppx.charge({ amount: "0.01" })(() =>
  Response.json({ accepted: true, timestamp: Date.now() })
)
```

For variable amounts, you'll need to read the body first, then call charge. Check mppx docs for dynamic pricing.

The existing `/api/bid/route.ts` is a demo endpoint. Delete it once the real endpoints are built.

## Frontend wiring checklist

Each item is a specific file change. No new pages needed -- all routes exist.

```
src/app/new/page.tsx
  □ Add 'use client' (needs form state)
  □ Add onChange handlers to inputs
  □ Add onSubmit → POST /api/rfs
  □ Redirect to /browse/{new_id} on success
  □ Add error display for validation failures

src/app/browse/page.tsx
  □ Replace rfsList import with server-side DB query
  □ Wire filter pills to ?status= query param (use searchParams)
  □ Wire search input to ?q= query param
  □ Add 'use client' for interactive filters, or use URL-based filtering (server component + searchParams)

src/app/browse/[id]/page.tsx
  □ Replace getRFSById/getContributionsForRFS/getSkillForRFS/getUserById with DB queries
  □ Wire "fund this request" button → POST /api/rfs/[id]/fund
  □ Wire "claim & write this skill" button → POST /api/rfs/[id]/claim
  □ Wire "buy for $0.005" button → GET /api/skills/[id]/content (MPP flow)
  □ Add client-side fund amount input (how much to contribute)
  □ Show "funded" success state after payment

src/app/page.tsx (landing)
  □ Replace rfsList import with DB queries (open + recent published)

src/app/me/page.tsx
  □ Replace getCurrentUser() with BetterAuth session
  □ Replace mock data queries with DB queries using session user id
  □ Show sign-in prompt if not authenticated

src/components/header.tsx
  □ Add auth state (sign in / user name)
  □ Conditionally show sign-in link vs. profile link
```

## What to delete when done

- `src/lib/mock-data.ts` -- all mock data and helper functions
- `src/app/api/bid/route.ts` -- demo endpoint
- All imports of mock-data in page files

Keep `src/lib/types.ts` and `src/lib/constants.ts`. The types should match your DB schema. The ASCII logo constant is used by the landing page.

## Order of operations

1. Database + schema setup
2. BetterAuth integration (auth routes, session, sign-in UI)
3. Read endpoints: wire pages to real DB queries (landing, browse, detail, profile)
4. Write endpoints: /api/rfs (create), /api/rfs/[id]/fund, /api/rfs/[id]/claim
5. MPP-gated endpoints: /api/skills/[id]/content (buy), /api/rfs/[id]/fund (pay)
6. Agent discovery: GET /api/skills
7. Delete mock-data.ts and demo bid route
