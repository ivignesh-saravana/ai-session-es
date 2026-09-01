Date created: 2026-09-01
Date last modified: 2026-09-01 (TDD / Vitest plan added)

# Register, Login, and Logout - Technical PRD

## Overview/Problem

Teachers need a shared quiz-maker so several of them can contribute to one multiple-choice question bank. Nothing exists in this starter yet: there is no user model, no database, and no way for a teacher to create an account or sign in. Without a first identity slice, later MCQ work has no owner to attach questions to and no path for more than one teacher to use the app.

This phase solves only that identity slice. Multiple teachers can register, log in, and log out. Successful register or login lands them on a stub MCQ page that will be built in a later sprint.

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
- Register and login pages with forms, validation, and error display
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

- Fields: first name, last name, username, email, password (password input type, never echoed)
- Username and email may be identical; both fields remain required
- Client validation before submit: all fields non-empty, email looks like an email, password minimum length 8
- On submit: SHA-256 hash the password in the browser, POST `/api/auth/register` with `passwordHash`, never send plaintext
- Success: navigate to `/mcqs`
- Failure: show the API error message on the page; do not navigate

#### Login (`/login`)

- Fields: username, password
- On submit: SHA-256 hash the password, POST `/api/auth/login` with `passwordHash`
- Success: navigate to `/mcqs`
- Failure: show a generic invalid-credentials message

#### Logout

- A logout control on the MCQ stub (and optionally a shared header if one is added)
- POST `/api/auth/logout`, then navigate to `/login`
- No confirmation dialog required

#### MCQ stub (`/mcqs`)

- Placeholder page only: heading that this is the question bank, short copy that MCQ features come next, and a logout control
- No forms, lists, or API calls for questions

#### Home (`/`)

- Redirect or link into `/login` and `/register` so a new visitor can start. Do not leave the default starter marketing copy as the only entry point.

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

### Phase 2: User service - PLANNED

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

### Phase 3: Auth API routes - PLANNED

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

### Phase 4: UI pages and navigation - PLANNED

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
7. Home page entry to login/register
8. Wire success paths to `/mcqs`
9. Run `npm test` — **expect green**

**Deliverables**:
- Working forms and stub page
- Green hash + component tests
- No plaintext password in unit-tested `fetch` bodies (browser Network tab still required in Phase 5)

**Phase gate**: `npm test` green. Do not call the feature done until Phase 5.

### Phase 5: Verify - PLANNED

**Objective**: The feature is done only when the **full** Vitest suite is green and lint, build, and a real register/login/logout path have been exercised.

**Tests (must stay green; no new red allowed to ship)**

1. Run `npm test` — entire suite green. If anything is red, fix production code or a broken test; do not skip or delete coverage to pass the gate.
2. If Phase 5 finds a gap (e.g. duplicate-email not tested), add the test first (red), then fix (green), then re-run the full suite.

**Other verification**

3. `npm run lint`
4. `npm run build`
5. Exercise register, duplicate-user error, login success, login failure, logout navigation in the browser (`npm run preview` preferred for D1; `npm run dev` will not use Workers/D1 the same way)
6. Confirm in the browser Network tab that register/login POST JSON has `passwordHash` and not plaintext password
7. Record actual command results in Current Status

**Deliverables**:
- Full `npm test` green
- Lint and build results reported, not assumed
- Browser-verified happy path and main error path

---

## Technical Implementation Details

### Key Files

- `wrangler.jsonc` — D1 binding `DB`
- `migrations/0001_create_users.sql` — users table and unique indexes on username and email
- `src/lib/services/user-service.ts` — D1-backed CRUD and credential lookup
- `src/lib/hash-password.ts` — SHA-256 hex for the browser
- `src/app/api/auth/register/route.ts` — register
- `src/app/api/auth/login/route.ts` — login
- `src/app/api/auth/logout/route.ts` — logout stub
- `src/app/register/page.tsx` — register UI
- `src/app/login/page.tsx` — login UI
- `src/app/mcqs/page.tsx` — MCQ stub
- `src/app/page.tsx` — entry to auth
- `vitest.config.ts` — Vitest + jsdom + `@/` path alias
- `src/lib/users-schema.test.ts` — migration/schema contract (Phase 1)
- `src/lib/services/user-service.test.ts` — mocked D1 CRUD and collisions (Phase 2)
- `src/app/api/auth/*/route.test.ts` — register/login/logout handlers (Phase 3)
- `src/lib/hash-password.test.ts` — SHA-256 hex helper (Phase 4)
- colocated `*.test.tsx` for register, login, and MCQ stub client UI (Phase 4)

Exact filenames may shift slightly during implementation; keep this list current when code lands.

### Implementation Patterns

```typescript
// Client: hash before POST. Never send plaintext.
async function hashPassword(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

```typescript
// Server: parameterized D1. Numbered placeholders only.
await db
  .prepare(
    "INSERT INTO users (first_name, last_name, username, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)"
  )
  .bind(firstName, lastName, username, email, passwordHash)
  .run();
```

```typescript
// Login compare: constant-time string compare on hashes if practical;
// at minimum do not early-return different messages for "missing user" vs "bad password".
```

### Important Notes

- D1 is server-only. User service must not be imported from `'use client'` modules.
- `npm run dev` is Node and will not prove Workers/D1 behavior. Auth that talks to D1 should be checked with `npm run preview` after a local migration apply.
- Cloud agents cannot create a remote D1 database or authenticate to Cloudflare. Local `wrangler d1 create` and `--local` migrate must be run where Cloudflare credentials exist.
- Ask before adding npm dependencies (`zod`, hashing libraries, etc.).
- Do not apply migrations with `--remote`.
- Do not deploy unless asked.
- Unique indexes on `username` and `email` are the source of truth for collisions; do not rely only on a pre-check (race).
- Logout does not make `/mcqs` private. Document that limitation in the UI copy if it would otherwise look like a secured app.
- TDD: tests first, `npm test` red, implement, `npm test` green, then next phase. Mock D1 and `getCloudflareContext`; do not introduce `@cloudflare/vitest-pool-workers` without asking.

---

## Acceptance Criteria

- [x] A local D1 database is configured with binding `DB` and a users migration applied locally
- [x] Vitest is configured; `npm test` and `npm test:watch` exist
- [ ] A user can register with first name, last name, username, email, and password
- [ ] The stored password value is a hash, not the typed password
- [ ] Register and login HTTP bodies include `passwordHash`, not plaintext password
- [ ] Username and email may be the same string and still succeed
- [ ] Duplicate username or email is rejected (409) and shown in the UI
- [ ] A registered user can log in with username and password and reach `/mcqs`
- [ ] Wrong password or unknown username returns 401 with a generic message and stays on `/login`
- [ ] Successful register navigates to `/mcqs`
- [ ] Logout POST succeeds and the UI returns to `/login`
- [ ] `/mcqs` is a stub only (no MCQ CRUD)
- [ ] User service supports create, update, and delete even if update/delete are unused by the UI
- [ ] No social login, tokens, cookies, or session store are introduced
- [ ] Each implementation phase was developed red-then-green; the full unit suite is green at the end of Phase 5
- [ ] Tests cover failure paths (validation, 401, 409, missing user), not only happy paths, and never assert tautologies
- [ ] `npm run lint` and `npm run build` succeed after implementation

---

## Success Metrics

This is an internal teaching sprint, not a production launch. Metrics are about whether teachers can get in.

| Metric | Target | How Measured |
|--------|--------|--------------|
| Register happy path | Completes and lands on `/mcqs` | Manual browser pass |
| Login happy path | Completes and lands on `/mcqs` | Manual browser pass |
| Password secrecy in transit (this phase) | No plaintext password in POST JSON | Browser Network tab on register and login |
| Duplicate account | Second register with same username or email fails visibly | Manual browser pass |
| Logout | User returns to `/login` | Manual browser pass |
| Unit suite | All Vitest tests pass | `npm test` |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — user persistence
- Wrangler — create DB, migrations, local apply
- Web Crypto (`crypto.subtle`) — SHA-256 in the browser (and available on Workers if ever needed)

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — access `env.DB`
- Next.js App Router — pages and `src/app/api/` route handlers
- shadcn/ui — form controls

### Authorized npm dependencies (this PRD)

Install when Phase 1 starts (devDependencies): `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vite-tsconfig-paths`.

### Proposed npm dependency (ask before install)

- `zod` — request body validation, per project Next.js conventions. Not installed today. Not authorized by this TDD update.

### Environment / bindings

- `DB` — D1 binding in `wrangler.jsonc`
- No new secrets required for this hashing scheme
- `.dev.vars.example` only needs an update if a new env var is introduced (none planned)

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `npm run dev` is used to “finish” auth and D1 calls fail or silently no-op.
- **Mitigation**: Apply migrations with `--local` and verify with `npm run preview`.

- **Risk**: SHA-256 without a salt/KDF is not a password-hashing algorithm; a stolen `password_hash` column is enough to log in because the client sends that same hash.
- **Mitigation**: Accept for this teaching phase. Do not log hashes. Add a real KDF and server-side sessions in a later hardening sprint if the app leaves the classroom.

- **Risk**: Unique constraint races if the route checks existence then inserts.
- **Mitigation**: Insert and handle D1 constraint errors; indexes enforce uniqueness.

- **Risk**: Client hashing implemented differently on register vs login (encoding, hex vs base64).
- **Mitigation**: One shared `hashPassword` helper used by both forms.

- **Risk**: Adding bcrypt or a session library without asking.
- **Mitigation**: Stay on Web Crypto and no session; propose any new package first.

- **Risk**: Tests are written after the code, or made green by weakening assertions.
- **Mitigation**: Each phase lists required red tests. Agents must run `npm test` before implementing that phase’s production code (after the harness exists) and must not skip, delete, or tautology-pass tests.

- **Risk**: Unit tests talk to real D1 and fail off-machine or in Cloud agents.
- **Mitigation**: Mock `getCloudflareContext` / `DB`. Use `npm run preview` only in Phase 5 for real D1.

### User Experience Risks

- **Risk**: Teachers think they are “logged in” and that `/mcqs` is private.
- **Mitigation**: Stub copy can say the question bank is next and that this phase only checks credentials. No fake lock icon.

- **Risk**: Logout appears broken because returning to `/mcqs` still shows the stub.
- **Mitigation**: Logout always navigates to `/login`. Do not imply the stub is gated.

- **Risk**: Login by email fails because the account used different username vs email.
- **Mitigation**: Login field is labeled Username. Help text: use the username chosen at register (which may be the email).

---

## Troubleshooting Guide

Populate during implementation. Starters:

### `wrangler d1 create` needs a Cloudflare API token

**Problem**: `npx wrangler d1 create ai-session-es` fails in a non-interactive shell with `CLOUDFLARE_API_TOKEN` required.
**Cause**: No Cloudflare credentials in this environment.
**Solution**: Keep a placeholder `database_id` in `wrangler.jsonc` and apply migrations with `--local`. When credentials are available, run `npx wrangler d1 create ai-session-es` and replace `database_id` with the real id. Do not apply `--remote` unless the user asks.
**Code Reference**: `wrangler.jsonc`

### D1 binding missing at runtime

**Problem**: `env.DB` is undefined or queries throw.
**Cause**: Binding not in `wrangler.jsonc`, types not regenerated, or running on Node `next dev` without the Workers binding.
**Solution**: Confirm `d1_databases` with binding `DB`, run `npm run cf-typegen`, use `npm run preview` for D1.
**Code Reference**: `wrangler.jsonc`

### Unique constraint on register

**Problem**: Register returns 500 instead of 409.
**Cause**: Constraint error not mapped in the user service.
**Solution**: Detect D1 unique failures and throw a typed error the route maps to 409.

### Vitest cannot resolve `@/`

**Problem**: Tests fail on `@/lib/...` imports.
**Cause**: `vite-tsconfig-paths` missing from `vitest.config.ts`.
**Solution**: Add the plugin as in `.cursor/skills/testing/SKILL.md`.

### `getCloudflareContext` throws in tests

**Problem**: User service tests fail before assertions run.
**Cause**: Cloudflare context is not available under jsdom.
**Solution**: `vi.mock("@opennextjs/cloudflare", ...)` and pass a fake `env.DB`.

### Login always 401 after a successful register

**Problem**: Hash mismatch.
**Cause**: Double-hashing on the server, different encodings, or storing plaintext by mistake.
**Solution**: Client hashes once; server stores and compares that exact hex string.

### Migration applied to remote by mistake

**Problem**: Production/remote schema changed.
**Cause**: `migrations apply` without `--local` or with `--remote`.
**Solution**: Do not do this in this repo’s working agreement. If it happens, stop and tell the user; do not try to “fix” remote schema unprompted.

---

## Notes for AI Agents

When working with this PRD:

1. Start by reading the Problem and Hypothesis to understand intent
2. Use Scope (In/Out/Cut) to determine boundaries — do not build out-of-scope items, including MCQ features, tokens, cookies, or social login
3. Update phase status markers as work progresses
4. Add implementation details under "Technical Implementation Details" as code is written
5. Mark acceptance criteria as complete when features work
6. Add troubleshooting entries when bugs are found and fixed
7. Keep all sections current — remove outdated information
8. Use code references format: `filepath:line-number` when citing code
9. Ask before adding any npm dependency
10. Never apply D1 migrations remotely and never deploy unless the user asks
11. Prefer `npm run preview` for anything that uses D1
12. Hash passwords in the browser before POST; persist and compare `password_hash` only
13. Follow TDD per phase: write the listed tests, run `npm test` (red), implement, run `npm test` (green). Do not start the next phase on red tests
14. Follow `.cursor/skills/testing/SKILL.md` for harness, mocking, and what makes a test worth writing
15. Vitest packages in this PRD are approved; still ask before `zod` or `@cloudflare/vitest-pool-workers`

---

## Current Status

**Last Updated**: 2026-09-01
**Current Phase**: Phase 1 - Vitest harness, D1, and users migration
**Status**: COMPLETED — waiting for review before Phase 2
**Phase 1 results**:
- `npm test` red first: 4 failed (`migrations directory is missing`)
- Local migration applied: `0001_create_users.sql` on D1 `ai-session-es` (`--local` only)
- `npm test` green after: 4 passed
- Remote `wrangler d1 create` was not run (no `CLOUDFLARE_API_TOKEN`). `database_id` in `wrangler.jsonc` is a local placeholder
**Next Steps**: After review, Phase 2 user-service tests (red) then service implementation. Confirm before installing `zod`.
