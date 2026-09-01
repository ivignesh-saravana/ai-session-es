Date created: 2026-09-01
Date last modified: 2026-09-01

# Register, Login, and Logout - Technical PRD

## Overview/Problem

Teachers needed a shared quiz-maker so several of them could contribute to one multiple-choice question bank. The starter had no user model, no database, and no way for a teacher to create an account or sign in.

**As of 2026-09-01**, that identity slice is implemented on `feature/register-login-logout`: D1 `users` table, user service, register/login/logout HTTP APIs, and shadcn-based UI. Successful register or login lands on a stub MCQ page. The user has verified locally that they can open login, register, log in, and log out. MCQ CRUD is still the next sprint.

---

## Hypothesis

We believe that a simple hashed-password register/login/logout flow, backed by a D1 user table and a user service, will let multiple teachers enter the app as distinct users so later sprints can attach a shared test bank to real accounts.

---

## Scope

### In Scope

- Cloudflare D1 database bound as `DB`, created and configured in this phase
- A `users` table via a Wrangler migration, with primary key, first name, last name, username, email, and hashed password
- Username and email stored as separate fields; they may be the same value for a given user
- A user service in `src/lib/services/` with create, read, update, and delete operations against D1
- HTTP POST endpoints for register, login, and logout
- Register and login use the user service to write and read user rows
- Client-side hashing of the password before the HTTP POST on both register and login; the server stores and compares that hash (never plaintext)
- Register and login pages with forms, validation, and error display, built from the shadcn signup/login blocks (`Card`, `Field`, `Input`, `Button`) and adapted to this app’s fields
- After a successful register or login, navigate to a stub MCQ page
- Logout returns the user to the login page
- A stub MCQ page with no question-bank functionality
- **Test-driven implementation with Vitest**: every phase starts with failing unit tests, then implementation until those tests (and the phase acceptance checks) are green. Setup uses the project testing skill (`vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vite-tsconfig-paths`)

### Out of Scope

- Multiple-choice question CRUD, a test bank UI, or any MCQ data model
- Social login (Google, GitHub, Microsoft, etc.)
- Tokens (JWT, API keys, refresh tokens)
- Session management, cookies, CSRF tokens, or server-side session stores
- Route protection / middleware that blocks anonymous visits to the MCQ stub
- Email verification, password reset, or “remember me”
- Role-based access (admin vs teacher)
- Profile editing UI (update/delete live on the service for later use; they are not exposed as HTTP endpoints in this phase)

### Cut

- **Server-side password KDF (bcrypt / Argon2)** — Would require a new dependency and is stronger than SHA-256, but this phase is basic hashed auth. SHA-256 via Web Crypto keeps the stack unchanged. Revisit if this app is used beyond a teaching sprint.
- **Hashing only on the server** — Considered because sending a client hash is still a secret if intercepted. The product intent is explicit: hash in the browser, POST the hash, store and compare the hash. HTTPS is assumed in production.
- **Cookies or JWT after login** — Deliberately cut so this phase stays a credential check plus navigation. Logout cannot invalidate a server session because none exists.
- **HTTP endpoints for update/delete user** — The service will implement them; shipping them now would expand auth surface without a product need.
- **`@cloudflare/vitest-pool-workers`** — Would run tests against a real Workers/D1 pool. The project testing skill requires asking before introducing it. This phase uses jsdom + mocked D1/`getCloudflareContext`. Real D1 behavior is checked in Phase 5 with `npm run preview`, not in the unit suite.

---

## Technical Requirements

### Database Schema

Cloudflare D1 (SQLite). Binding name: `DB`. Suggested database name: `ai-session-es`.

Create the database with Wrangler, add the `d1_databases` block to `wrangler.jsonc`, run `npm run cf-typegen`, then create and apply the migration **locally only**.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_users_username ON users (username);
CREATE UNIQUE INDEX idx_users_email ON users (email);
```

Column notes:

- `id` is a UUID-like 32-character hex string from SQLite `randomblob`.
- `username` and `email` are unique independently. The same string may be used for both on one row.
- `password_hash` stores the hex-encoded SHA-256 digest produced on the client. Plaintext passwords must never be written.
- `created_at` / `updated_at` use SQLite `datetime('now')` (ISO-like text).

### API Endpoints

Route handlers under `src/app/api/`. JSON request and response bodies. Register and login call the user service; they must not run SQL in the route file.

Password fields in request bodies are **already hashed** (SHA-256 hex). The API must not treat them as plaintext and must not hash them a second time in this phase (double-hashing would break login unless both paths always double-hash).

#### POST /api/auth/register

**Request Body:**

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada@school.edu",
  "email": "ada@school.edu",
  "passwordHash": "hex-encoded-sha256"
}
```

**Response:**

- Success (201): `{ "id": "...", "firstName": "...", "lastName": "...", "username": "...", "email": "..." }` — never return `passwordHash`
- Error (400): validation failure (missing fields, invalid email format, empty names, password hash not a 64-char hex string)
- Error (409): username or email already taken — message must not reveal which field collided if that would aid enumeration; a single “username or email already registered” is acceptable
- Error (500): unexpected server or D1 error

#### POST /api/auth/login

**Request Body:**

```json
{
  "username": "ada@school.edu",
  "passwordHash": "hex-encoded-sha256"
}
```

Login identifier is `username`. If a later tweak is needed to allow email as the login key, that is a follow-up; this phase looks up by `username` only.

**Response:**

- Success (200): same public user object as register (no password)
- Error (400): missing username or password hash
- Error (401): no matching user, or hash does not match — always the same message, e.g. “Invalid username or password”
- Error (500): unexpected server or D1 error

#### POST /api/auth/logout

**Request Body:** none (empty JSON object is allowed)

**Response:**

- Success (200): `{ "ok": true }`

This endpoint exists for a symmetric auth API and for the logout button. With no cookies, tokens, or sessions, the server has nothing to invalidate. The client must navigate to `/login` after success. Visiting `/mcqs` without logging in still works in this phase.

### User Interface Requirements

Use existing shadcn/ui components where they fit (Button, Input, Label, Card). Forms are client components so they can hash with Web Crypto before `fetch`. Do not import D1 or the user service into client components.

#### Register (`/register`)

- Page layout from the shadcn signup page: centered `SignupForm` in `src/app/register/page.tsx`
- Form is `src/components/signup-form.tsx`, based on the shadcn `SignupForm` block (`Card`, `Field`, `Input`, `Button`)
- Fields: first name, last name, username, email, password, confirm password
- Username and email may be identical; both fields remain required
- Client validation before submit: all fields non-empty, email looks like an email, password minimum length 8, passwords match
- No Google / social signup button (out of scope)
- On submit: SHA-256 hash the password in the browser, POST `/api/auth/register` with `passwordHash`, never send plaintext
- Success: navigate to `/mcqs`
- Failure: show the API error via `FieldError`; do not navigate
- “Sign in” links to `/login`

#### Login (`/login`)

- Page layout from the shadcn login page: centered `LoginForm` in `src/app/login/page.tsx`
- Form is `src/components/login-form.tsx`, based on the shadcn `LoginForm` block
- Fields: username, password (login is by username, which may be the email)
- No Google button and no forgot-password link (out of scope)
- On submit: SHA-256 hash the password, POST `/api/auth/login` with `passwordHash`
- Success: navigate to `/mcqs`
- Failure: show generic invalid-credentials copy via `FieldError`
- “Sign up” links to `/register`

#### Logout

- A logout control on the MCQ stub (and optionally a shared header if one is added)
- POST `/api/auth/logout`, then navigate to `/login`
- No confirmation dialog required

#### MCQ stub (`/mcqs`)

- Placeholder page only: heading that this is the question bank, short copy that MCQ features come next, and a logout control
- No forms, lists, or API calls for questions

#### Home (`/`)

- Server-side redirect to `/login`. New teachers use “Sign up” on that page to reach `/register`.
- Do not leave the default starter marketing copy as the only entry point.

Password hashing helper: a small shared client-safe function (e.g. `src/lib/hash-password.ts`) using `crypto.subtle.digest("SHA-256", ...)` and hex encoding. Same algorithm on register and login.

---

## Test-Driven Development

This feature is built **red → green** with **Vitest**. Tests are the implementation signal for each phase, together with that phase’s deliverables and the overall acceptance criteria. A phase is not complete while its new tests are red, skipped, or hollow (`expect(true).toBe(true)` and equivalent are forbidden).

### Harness (install once, in Phase 1)

Vitest is not in the starter. Install and configure it using `.cursor/skills/testing/SKILL.md`:

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event jsdom vite-tsconfig-paths
```

- `vitest.config.ts` at the repo root: `@vitejs/plugin-react`, `vite-tsconfig-paths` (required for `@/`), `environment: "jsdom"`, `globals: true`
- Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`
- Colocate tests: `foo.ts` → `foo.test.ts` (or `foo.test.tsx` for components)
- Mock module boundaries. Never hit a real network, real D1, or real Cloudflare in unit tests
- Mock `getCloudflareContext()` and supply a fake `env.DB`. Prefer mocking one `src/lib/` D1 access module rather than rebuilding the full prepared-statement chain in every file
- Mock `server-only` if a module imports it: `vi.mock("server-only", () => ({}))`
- `beforeEach(() => { vi.clearAllMocks(); })`
- Each test must pass in isolation
- Name tests so the failure message explains what broke
- Cover failure paths (validation, missing user, duplicate username/email, bad hash), not only the happy path
- React: `@testing-library/react` + `userEvent`; query by role and accessible name. Server Components are not rendered; test data/logic as functions and render only client components

This PRD **authorizes** those Vitest-related packages. Still **ask before installing `zod`**.

### Workflow every phase (agents must follow)

1. **Write tests first** for that phase’s behavior (list below). Tests may not compile or must fail when the subject does not exist yet — that is the red step.
2. **Run `npm test`** and record that the new tests fail for the right reason (missing module, failing assertion), not because the harness is broken.
3. **Implement** the minimum production code to satisfy those tests.
4. **Run `npm test` again**. The phase’s tests must be green. Do not proceed with red tests. Do not rewrite assertions to match buggy behavior.
5. Only then mark the phase complete (plus any non-unit checks listed on that phase, e.g. local migration apply).

Do not implement a phase’s production code before its tests exist, except the Vitest config/scripts in Phase 1, which must exist so the first tests can run.

---

## Implementation Phases

### Phase 1: Vitest harness, D1, and users migration - COMPLETED

**Objective**: Tests can run, D1 exists locally, and the `users` schema is locked by a failing-then-passing contract test plus a real local migration.

**Red (write tests first, after the harness can execute)**

1. Install Vitest and related packages listed above; add `vitest.config.ts` and `test` / `test:watch` scripts. Confirm `npm test` runs an empty/passing suite (harness only — not production behavior).
2. Add `src/lib/users-schema.test.ts` (name may vary) that reads the migration SQL (or a small exported schema contract the migration must match) and asserts:
   - a `users` table is created
   - columns: `id`, `first_name`, `last_name`, `username`, `email`, `password_hash`, `created_at`, `updated_at`
   - unique indexes on `username` and `email`
   - no plaintext password column name such as storing `password` without hash intent (the stored column is `password_hash`)
3. Run `npm test` — **expect red** (missing migration file and/or schema not matching).

**Green (implement)**

4. Create the D1 database with Wrangler (`npx wrangler d1 create ai-session-es`)
5. Add the `d1_databases` binding `DB` to `wrangler.jsonc`
6. Run `npm run cf-typegen` (generated file only; do not hand-edit)
7. Create a migration for the `users` table and unique indexes so the schema tests pass
8. Apply the migration locally (`npx wrangler d1 migrations apply ai-session-es --local`) — never `--remote`
9. Run `npm test` — **expect green** for this phase’s tests

**Deliverables**:
- Working Vitest harness (`npm test`)
- D1 binding in `wrangler.jsonc`
- Migration SQL under `migrations/`
- Typed `env.DB`
- Green schema contract tests

**Phase gate**: `npm test` green; local migration applied. Do not start Phase 2 on red tests.

### Phase 2: User service - COMPLETED

**Objective**: All user persistence goes through one server-only module, proven by unit tests against a mocked D1.

**Red**

1. Add `src/lib/services/user-service.test.ts` with `getCloudflareContext` mocked and a fake `env.DB`. Tests must assert observable service behavior, including:
   - `create` inserts bound fields (`?1` style) and returns a public user **without** `passwordHash` / `password_hash`
   - `create` with the same string for username and email is allowed
   - `create` maps unique-constraint failures to a typed already-exists error
   - `getById` / `getByUsername` / `getByEmail` return the user or `null` when missing
   - credential lookup (or equivalent) can retrieve the stored hash for comparison **without** exposing that hash on public user objects
   - `update` persists changed fields and refreshes `updated_at`
   - `delete` removes the row (subsequent get returns `null`)
2. Run `npm test` — **expect red** (module missing or methods unimplemented).

**Green**

3. Add `src/lib/services/user-service.ts` that obtains `env.DB` via `getCloudflareContext()`
4. Implement create, get-by-id, get-by-username, get-by-email, update, delete
5. Use prepared statements with numbered placeholders (`?1`, `?2`)
6. Never return `password_hash` from service methods that feed HTTP responses; keep a private lookup that includes the hash only for login comparison
7. Map D1 unique-constraint failures to a typed “already exists” error the routes can turn into 409
8. Run `npm test` — **expect green**

**Deliverables**:
- User service with CRUD
- No SQL in route handlers or components
- Green user-service unit tests (happy path and failure path)

**Phase gate**: `npm test` green. Do not start Phase 3 on red tests.

### Phase 3: Auth API routes - COMPLETED

**Objective**: Register, login, and logout are callable over HTTP, proven by unit tests that mock the user service (not D1).

**Red**

1. Add colocated tests, e.g. `src/app/api/auth/register/route.test.ts`, `login/route.test.ts`, `logout/route.test.ts`. Call the exported `POST` handlers with `Request` objects. Mock `@/lib/services/user-service`. Cases:
   - **Register 201**: valid body → `create` called with hashed password field, JSON public user, no password in response
   - **Register 400**: missing fields, invalid email, `passwordHash` not 64-char hex
   - **Register 409**: service already-exists error
   - **Register 500**: unexpected throw
   - **Login 200**: matching username + hash → public user, no password
   - **Login 400**: missing username or hash
   - **Login 401**: unknown user **and** wrong hash use the **same** error message
   - **Login 500**: unexpected throw
   - **Logout 200**: `{ "ok": true }` with no user-service writes
2. Run `npm test` — **expect red**.

**Green**

3. `POST /api/auth/register` — validate input, create user, return public user
4. `POST /api/auth/login` — lookup by username, compare `password_hash`, return public user or 401
5. `POST /api/auth/logout` — return `{ "ok": true }`
6. Validate bodies (Zod is the project convention; **propose adding `zod` before installing** — if the user declines, validate manually in the route)
7. Run `npm test` — **expect green**

**Deliverables**:
- Three route handlers
- Consistent JSON error shape, e.g. `{ "error": "message" }`
- Green route unit tests

**Phase gate**: `npm test` green. Do not start Phase 4 on red tests.

### Phase 4: UI pages and navigation - COMPLETED

**Objective**: A teacher can register or log in in the browser and reach the MCQ stub; logout returns them to login. Hashing and client components are proven with Vitest before relying on a manual Network-tab check.

**Red**

1. Add `src/lib/hash-password.test.ts`:
   - known plaintext → 64-char lowercase hex SHA-256
   - same input always same output
   - different inputs different hashes
   - never returns the plaintext
2. Add client component tests (`*.test.tsx`) with Testing Library + `userEvent`. Mock `fetch` and `next/navigation` (`useRouter` / `router.push`). Cover:
   - **Register form**: required fields present; client validation (empty fields, bad email, password shorter than 8 characters) does not POST; successful submit hashes password, POSTs `/api/auth/register` with `passwordHash` and **not** plaintext, then navigates to `/mcqs`; API error is shown and no navigation
   - **Login form**: submit hashes and POSTs `/api/auth/login`; success navigates to `/mcqs`; 401 shows generic invalid-credentials copy
   - **MCQ stub**: heading/copy for a future question bank; logout control POSTs `/api/auth/logout` then navigates to `/login`
3. Run `npm test` — **expect red**.

**Green**

4. Client hash helper
5. `/register` and `/login` pages (client forms)
6. `/mcqs` stub with logout
7. Home (`/`) originally linked to login/register; after Phase 4 review it became a server redirect to `/login` (`src/app/page.tsx:4`)
8. Wire success paths to `/mcqs`
9. Run `npm test` — **green: 35 passed** after adding `@testing-library/dom`, `src/test/setup.ts` cleanup, and `testTimeout: 15000`

**User verification (2026-09-01)**: Local browser — navigate to login, register, log in, log out.

**Deliverables**:
- Working forms and stub page
- Green hash + component tests
- `/` redirects to `/login`

**Phase gate**: `npm test` green. Browser happy path verified. Lint/build remain Phase 5.

### Phase 5: Verify - IN PROGRESS

**Objective**: The feature is done only when the **full** Vitest suite is green and lint, build, and a real register/login/logout path have been exercised.

**Done**
- Full unit suite last recorded green: **35 passed** (`npm test`)
- Browser: user verified local login, register, login, and logout (Phase 4)

**Still open**
- `npm run lint` and `npm run build` results not recorded in this PRD
- Network-tab confirmation of `passwordHash` (not plaintext) not recorded
- Formal `npm run preview` vs `npm run dev` note: D1-backed APIs need Workers; the user’s local pass used whichever server they had running

**Deliverables**:
- Full `npm test` green (recorded)
- Lint and build results reported (not yet)
- Browser-verified happy path (recorded by user)

---

## Technical Implementation Details

This is the **as-built** record. Code references use `filepath:line-number`.

### Git (as of last remote push)

Branch: `feature/register-login-logout`

| Commit | Phase |
|--------|--------|
| `542215b` | Phase 1 — Vitest + local D1 users schema |
| `e761ced` | Phase 2 — user service |
| `bfdb745` | Phase 3 — register/login/logout routes |

Phase 4 UI (forms, `/` redirect, tests, `@testing-library/dom`) lived in the working tree after those commits; commit/push when the user asks.

### Data and Cloudflare

- D1 binding `DB`, database name `ai-session-es`: `wrangler.jsonc:21-28`
- `database_id` is the local placeholder `00000000-0000-0000-0000-000000000000` (`wrangler.jsonc:27`). Remote `wrangler d1 create` was not run in the agent environment (no API token). The user owns production migrations.
- Schema: `migrations/0001_create_users.sql:3-15` (`users` + unique indexes on `username` and `email`)
- Applied locally only: `npx wrangler d1 migrations apply ai-session-es --local`
- Typed `env.DB`: `cloudflare-env.d.ts` after `npm run cf-typegen`

### User service (server)

Module: `src/lib/services/user-service.ts`

- D1 via `getCloudflareContext({ async: true })`: `src/lib/services/user-service.ts:57-59`
- Public user type (no hash): `src/lib/services/user-service.ts:10-18`
- `UserAlreadyExistsError`: `src/lib/services/user-service.ts:3-8`
- Unique-constraint detection: `src/lib/services/user-service.ts:74-80`
- `createUser` INSERT `?1`–`?5` + `RETURNING` public columns: `src/lib/services/user-service.ts:93-116`
- `getUserById` / `getUserByUsername` / `getUserByEmail`: `src/lib/services/user-service.ts:119-152`
- `getCredentialsByUsername` (hash only for login): `src/lib/services/user-service.ts:155-172`
- `updateUser` / `deleteUser` (no HTTP surface): `src/lib/services/user-service.ts:175-207`
- Tests mock `@opennextjs/cloudflare` and an in-memory fake D1: `src/lib/services/user-service.test.ts`

### HTTP helpers and auth routes

- JSON errors `{ error }`: `src/lib/http.ts:3-5`
- Body parse, 64-char hex check, XOR hash compare: `src/lib/http.ts:7-42`
- **Zod was not installed**; routes validate with these helpers

**Register** `src/app/api/auth/register/route.ts:13-50` — `POST` → `createUser`; 201 public user; 400 validation; 409 `UserAlreadyExistsError`; 500 otherwise. Does not hash again.

**Login** `src/app/api/auth/login/route.ts:13-41` — lookup by username; compare with `hashesMatch`; missing user uses dummy hash then same 401 `"Invalid username or password"` (`src/app/api/auth/login/route.ts:10-35`).

**Logout** `src/app/api/auth/logout/route.ts:1-3` — `{ ok: true }`; no D1 writes.

Route tests: `src/app/api/auth/register/route.test.ts`, `login/route.test.ts`, `logout/route.test.ts` (mock user service).

### Client hashing and UI

- SHA-256 hex: `src/lib/hash-password.ts:1-7` (FIPS vector `"abc"` in `src/lib/hash-password.test.ts`)
- Email check on the client: `src/lib/hash-password.ts:9-11`

**Register** — shadcn `SignupForm` adapted (no Google). Page: `src/app/register/page.tsx:1-10`. Form: `src/components/signup-form.tsx`. Fields: first/last name, username, email, password, confirm password. Hash then POST: `src/components/signup-form.tsx:61-77`. Success `router.push("/mcqs")`: `src/components/signup-form.tsx:78`. Errors via `FieldError`.

**Login** — shadcn `LoginForm` adapted (username, no Google, no forgot-password). Page: `src/app/login/page.tsx`. Hash then POST: `src/components/login-form.tsx:49-64`. 401 copy: `src/components/login-form.tsx:57-60`.

**MCQ stub** — `src/app/mcqs/page.tsx` renders `McqStub`. Heading and no-session copy: `src/components/mcq-stub.tsx:32-38`. Logout POST then `/login`: `src/components/mcq-stub.tsx:19-23`.

**Home** — `src/app/page.tsx:3-4` `redirect("/login")`. Sign-up is the link on the login form (`src/components/login-form.tsx`).

Client tests: `src/components/signup-form.test.tsx`, `login-form.test.tsx`, `mcq-stub.test.tsx`. They mock `fetch` and `next/navigation`.

### Test harness

- Config: `vitest.config.ts:5-13` (jsdom, `vite-tsconfig-paths`, `setupFiles`, `testTimeout: 15000`)
- Scripts: `package.json:14-15` (`test`, `test:watch`)
- DOM cleanup between tests: `src/test/setup.ts:1-6`
- Schema contract: `src/lib/users-schema.test.ts`
- Extra package: `@testing-library/dom` (peer of `@testing-library/react`)

Last recorded suite: **9 files, 35 tests, all green**.

### Implementation patterns (as shipped)

Client hash: `src/lib/hash-password.ts:1-7`.

Insert uses numbered placeholders and `all()` + `RETURNING`, not `.run()` alone: `src/lib/services/user-service.ts:95-109`.

Login 401 path: `src/app/api/auth/login/route.ts:30-35`.

Unique → typed error: `src/lib/services/user-service.ts:82-90`.

### Important notes (still true)

- Do not import the user service into `'use client'` modules.
- `npm run dev` is Node; D1 is reliable on `npm run preview`.
- No `zod`. No sessions. `/mcqs` is not gated.
- This session: do not create migrations or deploy; the user applies production schema.

---

## Acceptance Criteria

- [x] A local D1 database is configured with binding `DB` and a users migration applied locally
- [x] Vitest is configured; `npm test` and `npm test:watch` exist
- [x] A user can register with first name, last name, username, email, and password — **verified locally by the user (Phase 4)**
- [x] The stored password value is a hash, not the typed password — client sends `passwordHash`; service inserts `password_hash` (`src/lib/services/user-service.ts:97-107`)
- [x] Register and login HTTP bodies include `passwordHash`, not plaintext password — unit tests + form `fetch` bodies
- [x] Username and email may be the same string and still succeed — service + register form allow it; user registered locally
- [x] Duplicate username or email is rejected (409) and shown in the UI — API + `SignupForm` 409 test
- [x] A registered user can log in with username and password and reach `/mcqs` — **verified locally by the user**
- [x] Wrong password or unknown username returns 401 with a generic message and stays on `/login` — `src/app/api/auth/login/route.ts:10` and login form tests
- [x] Successful register navigates to `/mcqs` — `src/components/signup-form.tsx:78`; user verified
- [x] Logout POST succeeds and the UI returns to `/login` — `src/components/mcq-stub.tsx:22-23`; **user verified**
- [x] `/mcqs` is a stub only (no MCQ CRUD)
- [x] User service supports create, update, and delete even if update/delete are unused by the UI
- [x] No social login, tokens, cookies, or session store are introduced
- [x] Phases 1–4 were red-then-green; full unit suite last green at 35 tests (Phase 5 lint/build still open)
- [x] Tests cover failure paths (validation, 401, 409, missing user)
- [ ] `npm run lint` and `npm run build` succeed after implementation — **not recorded yet**

---

## Success Metrics

| Metric | Target | How Measured | Status |
|--------|--------|--------------|--------|
| Register happy path | Completes and lands on `/mcqs` | Manual browser | **Met** (user, 2026-09-01) |
| Login happy path | Completes and lands on `/mcqs` | Manual browser | **Met** (user, 2026-09-01) |
| Password secrecy in transit | No plaintext in POST JSON | Unit tests + Network tab | Unit tests met; Network tab not recorded |
| Duplicate account | Second register fails visibly | Manual / unit 409 | Unit tests met |
| Logout | User returns to `/login` | Manual browser | **Met** (user, 2026-09-01) |
| Unit suite | All Vitest tests pass | `npm test` | **35 passed** |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — user persistence
- Wrangler — local migrations
- Web Crypto (`crypto.subtle`) — SHA-256 in the browser (`src/lib/hash-password.ts:3`)

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — `src/lib/services/user-service.ts:1` and `:58`
- Next.js App Router — `src/app/api/` and pages
- shadcn/ui Base UI (`button`, `card`, `field`, `input`) — forms

### Authorized npm dependencies (installed)

`vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/dom`, `jsdom`, `vite-tsconfig-paths`

### Proposed (not installed)

- `zod` — still not authorized

### Environment / bindings

- `DB` — `wrangler.jsonc:21-28`
- No new secrets

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `npm run dev` is used to “finish” auth and D1 calls fail or silently no-op.
- **Mitigation**: Apply migrations with `--local` and verify with `npm run preview`.

- **Risk**: SHA-256 without a salt/KDF is not a password-hashing algorithm; a stolen `password_hash` column is enough to log in because the client sends that same hash.
- **Mitigation**: Accept for this teaching phase. Do not log hashes.

- **Risk**: Unique constraint races if the route checks existence then inserts.
- **Mitigation**: Insert and map D1 unique failures (`src/lib/services/user-service.ts:82-90`).

- **Risk**: Client hashing implemented differently on register vs login.
- **Mitigation**: Shared `hashPassword` (`src/lib/hash-password.ts:1`).

- **Risk**: Unit tests leak DOM across cases (duplicate Login buttons).
- **Mitigation**: `src/test/setup.ts:4-6` `cleanup()`; `testTimeout: 15000` in `vitest.config.ts:12`.

- **Risk**: Unit tests talk to real D1.
- **Mitigation**: Mock `getCloudflareContext` / `DB` in `user-service.test.ts`.

### User Experience Risks

- **Risk**: Teachers think `/mcqs` is private.
- **Mitigation**: Stub copy at `src/components/mcq-stub.tsx:36-38`.

- **Risk**: Login by email fails if username ≠ email.
- **Mitigation**: Username field + help text on `LoginForm`.

---

## Troubleshooting Guide

### `wrangler d1 create` needs a Cloudflare API token

**Problem**: Create fails without `CLOUDFLARE_API_TOKEN`.
**Cause**: No Cloudflare credentials in the agent environment.
**Solution**: Placeholder `database_id`; `--local` migrations. User applies production schema.
**Code Reference**: `wrangler.jsonc:25-27`

### D1 binding missing at runtime

**Problem**: `env.DB` is undefined.
**Cause**: Missing binding or `next dev` without Workers.
**Solution**: `wrangler.jsonc:21-28`; `npm run cf-typegen`; prefer `npm run preview`.

### Unique constraint on register

**Problem**: Register returns 500 instead of 409.
**Cause**: Constraint error not mapped.
**Solution**: `src/lib/services/user-service.ts:74-90` and `src/app/api/auth/register/route.ts:44-46`.

### Vitest cannot resolve `@/`

**Problem**: `@/lib/...` imports fail in tests.
**Cause**: Missing `vite-tsconfig-paths`.
**Solution**: `vitest.config.ts:3` and `:6`.

### `getCloudflareContext` throws in tests

**Problem**: User service tests fail before assertions.
**Cause**: No Cloudflare context under jsdom.
**Solution**: `vi.mock("@opennextjs/cloudflare")` in `src/lib/services/user-service.test.ts`.

### `Cannot find module '@testing-library/dom'`

**Problem**: Form tests fail to load.
**Cause**: Peer of `@testing-library/react` not installed.
**Solution**: `npm install -D @testing-library/dom`.

### Duplicate Login / Create Account buttons in tests

**Problem**: `getByRole` finds two buttons; tests time out.
**Cause**: jsdom not cleaned between cases.
**Solution**: `src/test/setup.ts:4-6`.

### Login always 401 after a successful register

**Problem**: Hash mismatch.
**Cause**: Double-hashing or encoding drift.
**Solution**: Client hashes once (`src/lib/hash-password.ts:1`); server stores and compares that hex (`src/app/api/auth/login/route.ts:31-32`).

### `/` still shows the Next.js starter

**Problem**: Old home page.
**Cause**: Stale dev server, or pre-redirect `page.tsx`.
**Solution**: `src/app/page.tsx:4` redirects to `/login`; restart the server.

### Migration applied to remote by mistake

**Problem**: Production schema changed.
**Cause**: `migrations apply` `--remote`.
**Solution**: This session: user owns remote schema. Do not apply remote from the agent.

---

## Notes for AI Agents

1. Start by reading Overview and Hypothesis
2. Honor Scope (In/Out/Cut) — no MCQ features, tokens, cookies, or social login
3. Keep phase markers and this as-built section current
4. Cite code as `filepath:line-number`
5. Ask before new npm dependencies (`zod` still not authorized)
6. **This session:** do not create migrations and do not deploy
7. Prefer `npm run preview` for D1
8. Hash in the browser; store/compare `password_hash` only
9. Stay on `feature/register-login-logout`; commit and push only when the user asks

---

## Current Status

**Last Updated**: 2026-09-01
**Current Phase**: Phase 4 complete (user-verified). Phase 5 in progress (lint/build not recorded).
**Branch**: `feature/register-login-logout`

**Phase 1 (COMPLETED)** — `542215b`
- Red: 4 tests, `migrations directory is missing`
- Green: schema tests; local apply of `migrations/0001_create_users.sql`
- Remote D1 create skipped; placeholder `database_id`

**Phase 2 (COMPLETED)** — `e761ced`
- Red: missing `./user-service`
- Green: 13 tests (schema + service)

**Phase 3 (COMPLETED)** — `bfdb745`
- Red: missing `./route`
- Green: 24 tests; manual validation (no Zod)

**Phase 4 (COMPLETED, user-verified)**
- Red: missing hash helper and form components
- Green: **35 tests**
- `/` → `/login`; shadcn signup/login; MCQ stub logout
- **User (2026-09-01):** local login page, register, log in, log out all worked

**Phase 5 (IN PROGRESS)**
- Unit suite green (35)
- Browser happy path: user-verified
- Open: `npm run lint`, `npm run build`, Network-tab note

**Next Steps**: Commit/push Phase 4 when asked. Then record lint/build (Phase 5) if desired. No migrations or deploys from the agent this session.
