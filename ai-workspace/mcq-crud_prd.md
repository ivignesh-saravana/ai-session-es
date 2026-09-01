Date created: 2026-09-01
Date last modified: 2026-09-01

# Multiple-Choice Questions (CRUD) - Technical PRD

## Overview/Problem

Teachers can register, log in, and reach `/mcqs`, but that page is still a stub. There is no way to store a question, its answer choices, or a record of someone picking an answer.

This feature turns `/mcqs` into a question-bank list and adds create, edit, delete, and preview for multiple-choice questions, with a service layer and D1 tables for questions, choices, and attempts.

**As of 2026-09-01**, Phases 1–2 are complete: local D1 has the three MCQ tables, and `src/lib/services/mcq-service.ts` persists questions and choices (including a preview projection without `isCorrect`). There is still no MCQ HTTP API or question-bank UI. Implementation continues one phase at a time.

---

## Hypothesis

We believe that a shadcn table of questions, a shared create/edit page, and a D1-backed MCQ service (questions, choices, and attempts) will let teachers manage a shared multiple-choice bank without leaving the existing login/logout flow.

---

## Scope

### In Scope

- Replace the `/mcqs` stub with a question-bank **table** (shadcn `Table`) listing all MCQs
- A **Create** button on that page that navigates to a create/edit form page
- Each row: **name**, **description**, and an **actions** column
- Actions via a **three-dot vertical ellipsis** that opens a dropdown: **Edit**, **Preview**, **Delete**
- A create/edit page with **Save** and **Cancel** (Cancel returns to `/mcqs` without saving)
- Form starts with **two** choice fields; the teacher may add choices up to **six** and may remove extras down to **two**
- Exactly **one** choice marked as the correct answer
- Three D1 tables: `mcqs`, `mcq_choices`, `mcq_attempts` (new migration; local apply only)
- An **MCQ service** in `src/lib/services/` — routes talk to this service, not to D1
- HTTP APIs for MCQ list/create/read/update/delete and for recording an **attempt** (selected choice + whether it was correct)
- **Preview**: view the question as a respondent, pick a choice, submit; persist an attempt and show correct vs incorrect
- Keep existing register/login/logout and the user service unchanged
- **Test-driven implementation with Vitest** (already installed from the auth sprint): red → green each phase. Same harness and rules as `ai-workspace/register-login-logout_prd.md`

### Out of Scope

- Sessions, cookies, JWT, or route protection (same as the auth sprint: `/mcqs` remains reachable without login)
- Tying attempts to a logged-in user (`user_id` is not stored in this phase)
- Multi-select questions (more than one correct choice)
- Question types other than multiple choice (true/false, free text, images)
- Sharing, folders, tags, search, pagination, or sorting beyond a simple list
- Scoring dashboards, attempt history UI, or analytics
- TEKS / curriculum alignment or AI-generated questions
- Changing password hashing, user CRUD HTTP APIs, or the users table

### Cut

- **`user_id` on attempts or MCQs** — Auth has no session, so a client-supplied user id would not be trustworthy. Revisit when sessions exist.
- **Pagination / search** — The bank is small in this teaching sprint; a full table load is enough.
- **`zod`** — Still not authorized. Validate in routes with the same manual helpers pattern as auth (`src/lib/http.ts`). Ask before installing Zod.
- **`@cloudflare/vitest-pool-workers`** — Same cut as auth. Unit tests mock D1 / `getCloudflareContext`. Real D1 is checked with `npm run preview`, not in Vitest.
- **Deleting a question from the table without confirmation** — A confirm `Dialog` (already installed) is in scope so delete is not a one-click accident. Instant delete was considered and rejected.
- **Draft vs published status** — A question is saved complete (name + 2–6 choices + one correct). No draft workflow.

---

## Technical Requirements

### Database Schema

Cloudflare D1 (SQLite). Binding name: `DB`. Same database as users (`quiz-maker-db` / `wrangler.jsonc` `d1_databases`).

Add a **new** Wrangler migration (next number after `migrations/0001_create_users.sql`). Apply **locally only** (`npx wrangler d1 migrations apply <db-name> --local`). Never `--remote`.

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  label TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices (mcq_id);

CREATE UNIQUE INDEX idx_mcq_choices_one_correct
  ON mcq_choices (mcq_id) WHERE is_correct = 1;

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  selected_choice_id TEXT NOT NULL,
  choice_label TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
```

Column notes:

- `id` values match users: 32-character hex from `randomblob`.
- `mcqs.name` is required; `description` may be an empty string.
- `mcq_choices.label` is the choice text shown to the teacher and to the preview respondent.
- `mcq_choices.is_correct` is `0` or `1`. The partial unique index enforces **at most one** correct choice per question. The service also requires **exactly one** on create/update.
- `mcq_choices.position` is `0` .. `5` (display order). The service rejects fewer than 2 or more than 6 choices.
- `mcq_attempts.selected_choice_id` is the id of the choice that was picked **at submit time**. It is **not** a foreign key so teachers can still edit/replace choices after people have practiced. `choice_label` and `is_correct` are snapshots so history stays readable if the question changes.
- Deleting an MCQ cascades to its choices and attempts.

### API Endpoints

Route handlers under `src/app/api/`. JSON bodies. All handlers call the MCQ service; they must not run SQL.

JSON errors keep the auth shape: `{ "error": "message" }` via `jsonError` in `src/lib/http.ts`.

Public MCQ objects use camelCase. Choice objects for **authors** include `isCorrect`. Preview payloads **omit** `isCorrect` on choices so the UI cannot reveal the answer before submit.

#### GET /api/mcqs

**Request Body:** none

**Response:**

- Success (200): `{ "mcqs": [ { "id", "name", "description", "createdAt", "updatedAt" } ] }` — **no** choices
- Error (500): unexpected server or D1 error

#### POST /api/mcqs

**Request Body:**

```json
{
  "name": "Photosynthesis",
  "description": "Grade 5 science",
  "choices": [
    { "label": "Plants make food from sunlight", "isCorrect": true },
    { "label": "Plants eat soil", "isCorrect": false }
  ]
}
```

**Response:**

- Success (201): full MCQ including choices with ids, `isCorrect`, and `position` (server assigns positions from array order)
- Error (400): missing/blank name; fewer than 2 or more than 6 choices; any blank choice label; not exactly one `isCorrect: true`
- Error (500): unexpected server or D1 error

#### GET /api/mcqs/:id

**Response:**

- Success (200): full MCQ with choices (author view, includes `isCorrect`)
- Error (404): `{ "error": "Question not found" }`
- Error (500): unexpected server or D1 error

#### PUT /api/mcqs/:id

**Request Body:** same shape as POST (full replacement of name, description, and choices)

**Response:**

- Success (200): updated full MCQ with choices
- Error (400): same validation as POST
- Error (404): question not found
- Error (500): unexpected server or D1 error

Choice replacement rule (service): delete existing choice rows for that `mcq_id` and insert the new set (2–6). Attempts keep historical `selected_choice_id` / `choice_label` / `is_correct` and are not rewritten.

#### DELETE /api/mcqs/:id

**Request Body:** none

**Response:**

- Success (200): `{ "ok": true }`
- Error (404): question not found
- Error (500): unexpected server or D1 error

#### GET /api/mcqs/:id/preview

Author GET includes the answer key. Preview uses this route so the client does not receive `isCorrect`.

**Response:**

- Success (200): `{ "id", "name", "description", "choices": [ { "id", "label", "position" } ] }`
- Error (404): question not found
- Error (500): unexpected server or D1 error

#### POST /api/mcqs/:id/attempts

**Request Body:**

```json
{
  "choiceId": "hex-id-of-selected-choice"
}
```

**Response:**

- Success (201): `{ "id", "mcqId", "selectedChoiceId", "choiceLabel", "isCorrect", "createdAt" }`
- Error (400): missing `choiceId`, or choice does not belong to this question
- Error (404): question not found
- Error (500): unexpected server or D1 error

`isCorrect` on the attempt is computed on the server from the stored choice row at submit time, not from the client.

### User Interface Requirements

Use shadcn/ui already in the repo: `Button`, `Card`, `Dialog`, `Field`, `Input`, `Label`, `Separator`, `Table`.

**Add** (source files via shadcn, not a new npm library):

```bash
npx shadcn@latest add @shadcn/dropdown-menu
npx shadcn@latest add @shadcn/textarea
```

Always use the `@shadcn/` namespace. If `dropdown-menu` produces no files for Base UI, use the documented equivalent (likely `menu`) before assuming the CLI failed. Do not hand-edit files under `src/components/ui/`.

Do not import D1 or the MCQ service into `'use client'` components. The UI talks to `/api/...` with `fetch`.

Keep **Log out** on the question-bank page (existing behavior: POST `/api/auth/logout`, then `/login`).

#### Question bank (`/mcqs`)

- Replace `McqStub` with a full-width layout (not the centered stub card)
- Heading for the question bank
- **Create question** button → `/mcqs/new`
- shadcn `Table` columns: **Name**, **Description**, **Actions**
- Empty state: short copy that there are no questions yet; Create remains available
- Description may be truncated in the table if long
- Actions column: `Button` with Lucide `EllipsisVertical` (three vertical dots). Click opens a dropdown:
  - **Edit** → `/mcqs/[id]/edit`
  - **Preview** → `/mcqs/[id]/preview`
  - **Delete** → confirm `Dialog`, then `DELETE /api/mcqs/:id`, then refresh the list
- Load list with `GET /api/mcqs` on mount
- Fetch/list errors shown as visible text, not a silent blank table

#### Create / edit (`/mcqs/new` and `/mcqs/[id]/edit`)

- One shared client form component; two thin pages
- Fields:
  - Name (required, non-empty)
  - Description (optional; `Textarea`)
  - Choices: each row is a text field + a control to mark **this** choice as correct (radio-style: exactly one selected)
- Initially **two** choice rows on create. **Add choice** until six. **Remove** on a row only when there are more than two
- **Save**: POST `/api/mcqs` (create) or PUT `/api/mcqs/:id` (edit). On success, navigate to `/mcqs`
- **Cancel**: navigate to `/mcqs` without saving (no confirm required)
- Edit page: `GET /api/mcqs/:id` to populate; 404 copy if missing
- Client validation before POST/PUT: same rules as the API (name, 2–6 non-empty labels, one correct)
- API 400: show `FieldError` / page error; stay on the form

#### Preview (`/mcqs/[id]/preview`)

- Load `GET /api/mcqs/:id/preview` (no answer key)
- Show name, description, and choices as selectable options (not the author editor)
- Submit: `POST /api/mcqs/:id/attempts` with `{ "choiceId" }`
- After success: show whether the attempt was correct or incorrect (use `isCorrect` from the attempt response)
- **Back** (or Cancel-style) control to `/mcqs`
- Do not allow changing the selection after a successful submit in the same visit (show the result instead)

#### Home / auth pages

- Unchanged: `/` redirects to `/login`; register/login still land on `/mcqs`

---

## Test-Driven Development

This feature is built **red → green** with **Vitest**. The harness from the auth sprint already exists (`vitest.config.ts`, `npm test`, `npm test:watch`, `src/test/setup.ts`). Do **not** reinstall Vitest unless something is broken.

A phase is not complete while its new tests are red, skipped, or hollow (`expect(true).toBe(true)` and equivalent are forbidden).

### Existing harness (reuse)

- `vitest.config.ts`: `@vitejs/plugin-react`, `vite-tsconfig-paths`, `environment: "jsdom"`, `globals: true`
- Colocate tests: `foo.ts` → `foo.test.ts` / `foo.test.tsx`
- Mock module boundaries. Never hit a real network, real D1, or real Cloudflare in unit tests
- Mock `getCloudflareContext()` and supply a fake `env.DB` (same pattern as `src/lib/services/user-service.test.ts`)
- Mock `server-only` if a module imports it
- `beforeEach(() => { vi.clearAllMocks(); })`
- Cover failure paths (validation, 404, wrong choice id), not only the happy path
- React: `@testing-library/react` + `userEvent`; query by role and accessible name. Do not render Server Components; test client components and service/route functions

This PRD **authorizes** adding shadcn `dropdown-menu` (or Base UI equivalent) and `textarea`. Still **ask before installing `zod` or any other npm package**.

### Workflow every phase (agents must follow)

1. **Write tests first** for that phase’s behavior. Tests may not compile or must fail when the subject does not exist yet — that is the red step.
2. **Run `npm test`** and record that the new tests fail for the right reason (missing module, failing assertion), not because the harness is broken.
3. **Implement** the minimum production code to satisfy those tests.
4. **Run `npm test` again**. The phase’s tests must be green. Do not proceed with red tests. Do not rewrite assertions to match buggy behavior.
5. Only then mark the phase complete (plus any non-unit checks listed on that phase, e.g. local migration apply).

Do not implement a phase’s production code before its tests exist.

---

## Implementation Phases

Implement **one phase at a time**. Do not start the next phase until the current phase gate is met. Do not implement UI in the schema phase, and do not add attempt UI before the attempt API exists.

### Phase 1: MCQ schema migration - COMPLETED

**Objective**: The three tables are locked by a failing-then-passing contract test plus a real **local** migration.

**Red (write tests first)**

1. Added `src/lib/mcq-schema.test.ts` that concatenates `migrations/*.sql` and asserts:
   - `mcqs` with `id`, `name`, `description`, `created_at`, `updated_at`
   - `mcq_choices` with `id`, `mcq_id`, `label`, `is_correct`, `position`, timestamps, and FK to `mcqs` ON DELETE CASCADE
   - `mcq_attempts` with `id`, `mcq_id`, `selected_choice_id`, `choice_label`, `is_correct`, `created_at`, and FK to `mcqs` ON DELETE CASCADE
   - no `REFERENCES mcq_choices` on attempts
   - index on `mcq_choices(mcq_id)` and partial unique index for one correct choice
   - index on `mcq_attempts(mcq_id)`
2. `npm test` — **red**: 6 failed, 35 passed (41 total). Failures were missing `CREATE TABLE mcqs` (only `0001_create_users.sql` existed). Not a harness failure.

**Green (implement)**

3. `npx wrangler d1 migrations create quiz-maker-db create_mcq_tables` → `migrations/0002_create_mcq_tables.sql`
4. Wrote the SQL from this PRD’s schema section
5. Applied **locally only**: `npx wrangler d1 migrations apply quiz-maker-db --local` (never `--remote`). This local D1 under `.wrangler/state/v3/d1` also applied `0001_create_users.sql` in the same run because it had not been applied on that database path yet.
6. `npm test` — **green: 10 files, 41 tests passed**

**Deliverables**:

- `migrations/0002_create_mcq_tables.sql`
- Green schema contract tests (`src/lib/mcq-schema.test.ts`)
- Local migration applied on `quiz-maker-db`

**Phase gate**: Met. Do not start Phase 2 until asked.

### Phase 2: MCQ service - COMPLETED

**Objective**: All question and choice persistence goes through one server-only module, proven against a mocked D1.

**Red**

1. Added `src/lib/services/mcq-service.test.ts` with `getCloudflareContext` mocked and a fake `env.DB`. Cases:
   - `listMcqs` returns author list items without choices
   - `getMcqById` returns the question and ordered choices, or `null`
   - `createMcq` inserts with numbered placeholders (`?1` style), assigns `position` from array order, returns camelCase including `isCorrect`
   - `createMcq` rejects fewer than 2 or more than 6 choices, blank name, blank labels, and not exactly one correct choice (`McqValidationError`)
   - `updateMcq` updates name/description/`updated_at` and replaces choices
   - `deleteMcq` removes the question (subsequent get returns `null`); fake D1 also removes choices (CASCADE stand-in)
   - `getMcqForPreview` returns choices **without** `isCorrect`
2. `npm test` — **red**: suite failed to load because `./mcq-service` did not exist (`Failed to resolve import "./mcq-service"`). Existing 41 tests still passed.

**Green**

3. Added `src/lib/services/mcq-service.ts` using `getCloudflareContext({ async: true })`
4. Implemented `listMcqs`, `getMcqById`, `createMcq`, `updateMcq`, `deleteMcq`, and `getMcqForPreview`
5. Prepared statements with numbered placeholders only
6. Validation → `McqValidationError`; missing row on update → `McqNotFoundError`; `getMcqById` / `getMcqForPreview` return `null`
7. Fake D1 also supports `prepare().all()` with no `bind` (list query). `npm test` — **green: 11 files, 49 tests passed**

**Deliverables**:

- MCQ service for questions + choices (attempts remain Phase 5)
- No SQL in route handlers or components (no MCQ routes yet)
- Green service unit tests (happy path and validation failures)

**Phase gate**: Met. Do not start Phase 3 until asked.

### Phase 3: MCQ HTTP routes - PLANNED

**Objective**: List, create, read, update, and delete are callable over HTTP. Tests mock the MCQ service, not D1.

**Red**

1. Colocated tests for `GET`/`POST /api/mcqs` and `GET`/`PUT`/`DELETE /api/mcqs/[id]`. Call exported handlers with `Request` objects. Mock `@/lib/services/mcq-service`. Cases:
   - List 200
   - Create 201; create 400 (validation)
   - Get 200; get 404
   - Put 200; put 400; put 404
   - Delete 200; delete 404
   - 500 on unexpected throw
2. Run `npm test` — **expect red**.

**Green**

3. Implement the five handlers; validate bodies without Zod unless Zod is authorized later
4. Consistent `{ "error": "message" }`
5. Run `npm test` — **expect green**

**Deliverables**:

- MCQ route handlers
- Green route unit tests

**Phase gate**: `npm test` green. Do not start Phase 4 on red tests.

### Phase 4: Question bank table and create/edit UI - PLANNED

**Objective**: A teacher can list questions, create, edit, and delete them in the browser. Preview and attempts are **not** in this phase (dropdown may show Preview disabled, or the item can navigate to a short “coming next” state — prefer **omitting Preview until Phase 5** so the menu only has Edit and Delete until then).

**Red**

1. Client component tests (`*.test.tsx`) with Testing Library + `userEvent`. Mock `fetch` and `next/navigation`. Cover:
   - **List**: table headers; empty state; rows from `GET /api/mcqs`; Create navigates to `/mcqs/new`; Edit navigates to `/mcqs/[id]/edit`; Delete opens confirm dialog, calls `DELETE`, then list refreshes
   - **Logout** still POSTs `/api/auth/logout` and goes to `/login`
   - **Create form**: two choice fields by default; Add/Remove choice rules (2–6); Save POSTs `/api/mcqs` with name, description, choices; success navigates to `/mcqs`; Cancel navigates without POST; client validation does not POST
   - **Edit form**: loads `GET /api/mcqs/:id`; Save PUTs; Cancel goes to `/mcqs`
2. Run `npm test` — **expect red**.

**Green**

3. Add shadcn dropdown (or equivalent) and textarea
4. Replace the stub list with the table page; shared editor form; `/mcqs/new` and `/mcqs/[id]/edit`
5. Run `npm test` — **expect green**

**Deliverables**:

- Working list + create/edit/delete UI
- Green component tests
- `McqStub` removed or reduced so `/mcqs` is no longer a placeholder-only page

**Phase gate**: `npm test` green. Browser happy path for list/create/edit/delete (Phase 6 records a fuller pass). Do not start Phase 5 on red tests.

### Phase 5: Attempts service, attempt API, and preview UI - PLANNED

**Objective**: Preview a question, submit a choice, persist an attempt, and show correct vs incorrect.

**Red**

1. Extend `mcq-service.test.ts` (or `mcq-attempt` tests):
   - `createAttempt` inserts snapshot fields; `isCorrect` comes from the choice row
   - unknown `mcqId` or `choiceId` not belonging to that question → typed error
2. Route tests for `GET /api/mcqs/[id]/preview` and `POST /api/mcqs/[id]/attempts`
3. Preview page component tests: loads preview payload (no `isCorrect` on choices); submit POSTs `choiceId`; shows correct/incorrect from the attempt response; Back goes to `/mcqs`
4. Run `npm test` — **expect red**.

**Green**

5. Service `createAttempt`; preview GET and attempts POST; preview page; enable **Preview** in the row dropdown
6. Run `npm test` — **expect green**

**Deliverables**:

- Attempts written through the service
- Preview UI
- Green tests for service, routes, and preview UI

**Phase gate**: `npm test` green.

### Phase 6: Verify - PLANNED

**Objective**: The feature is done only when the **full** Vitest suite is green and lint, build, and a real browser path have been exercised.

**Tasks**:

1. `npm test` — record pass count
2. `npm run lint` and `npm run build` — record results (do not claim done on inspection)
3. Browser (prefer `npm run preview` for D1): list empty state → create (2 choices, then add a third) → see row → edit → preview correct and incorrect → delete with confirm → logout
4. Update this PRD: phase markers, as-built file references, acceptance checkboxes

**Deliverables**:

- Recorded test/lint/build results
- Browser-verified happy path and the main error/empty states

---

## Technical Implementation Details

This is the **as-built** record for completed phases, plus the intended layout for later phases.

### Phase 1 as-built (2026-09-01)

- Schema: `migrations/0002_create_mcq_tables.sql:3-37` (`mcqs`, `mcq_choices`, `mcq_attempts`, indexes)
- Cascade FKs: `migrations/0002_create_mcq_tables.sql:19` (choices → mcqs), `migrations/0002_create_mcq_tables.sql:34` (attempts → mcqs)
- Partial unique index (one correct choice): `migrations/0002_create_mcq_tables.sql:24-25`
- Attempts do **not** FK to `mcq_choices` (`selected_choice_id` is a snapshot id): `migrations/0002_create_mcq_tables.sql:30`
- Contract tests: `src/lib/mcq-schema.test.ts`
- Local apply: `npx wrangler d1 migrations apply quiz-maker-db --local` against `.wrangler/state/v3/d1` (database id `1f55c545-4bae-4d16-8ad2-1ea6c1044345`)
- Last recorded suite after Phase 1: **10 files, 41 tests, all green**

### Phase 2 as-built (2026-09-01)

Module: `src/lib/services/mcq-service.ts`

- D1 via `getCloudflareContext({ async: true })`: `src/lib/services/mcq-service.ts:82-85`
- `McqValidationError`: `src/lib/services/mcq-service.ts:3-8`
- `McqNotFoundError` (update of missing id): `src/lib/services/mcq-service.ts:10-15`
- Input rules (name, 2–6 labels, exactly one correct): `src/lib/services/mcq-service.ts:106-141`
- `createMcq` INSERT `mcqs` `?1`–`?2` then choices `?1`–`?4`: `src/lib/services/mcq-service.ts:180-199`
- `listMcqs` (no choices): `src/lib/services/mcq-service.ts:201-209`
- `getMcqById`: `src/lib/services/mcq-service.ts:211-223`
- `getMcqForPreview` strips `isCorrect`: `src/lib/services/mcq-service.ts:225-242`
- `updateMcq` replace-all choices: `src/lib/services/mcq-service.ts:244-269`
- `deleteMcq` deletes the `mcqs` row (D1 CASCADE removes choices/attempts): `src/lib/services/mcq-service.ts:271-274`
- Tests mock `@opennextjs/cloudflare` and an in-memory fake D1: `src/lib/services/mcq-service.test.ts`
- Last recorded suite after Phase 2: **11 files, 49 tests, all green**

`createAttempt` is **not** in this module yet (Phase 5).

### Key files (planned — Phases 3–5)
- `src/app/api/mcqs/route.ts` — GET list, POST create
- `src/app/api/mcqs/[id]/route.ts` — GET, PUT, DELETE
- `src/app/api/mcqs/[id]/preview/route.ts` — GET preview (no answer key)
- `src/app/api/mcqs/[id]/attempts/route.ts` — POST attempt
- `src/app/mcqs/page.tsx` — question bank
- `src/app/mcqs/new/page.tsx` — create
- `src/app/mcqs/[id]/edit/page.tsx` — edit
- `src/app/mcqs/[id]/preview/page.tsx` — preview
- `src/components/mcq-list.tsx` (name may vary) — table + actions menu
- `src/components/mcq-form.tsx` — shared create/edit form
- `src/components/mcq-preview.tsx` — preview + submit

### Implementation patterns (follow existing auth code)

```typescript
async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

// Numbered placeholders only; SQLite supplies id via DEFAULT
await db
  .prepare("INSERT INTO mcqs (name, description) VALUES (?1, ?2)")
  .bind(name, description)
  .all();
```

- Prefer `all()` + `results[0]` over `first()` (D1 convention in `.cursor/rules/d1.mdc`)
- Map DB rows (`snake_case`) to camelCase in the service, same as `toPublicUser`
- Client components: `fetch` + `useRouter`; mock both in tests

### Important notes

- Do not import the MCQ service into `'use client'` modules
- `npm run dev` is Node; D1 is reliable on `npm run preview`
- No `zod`. No sessions. `/mcqs` is not gated
- Do not apply migrations remotely; do not `npm run deploy` unless asked
- Do not hand-edit `cloudflare-env.d.ts`

---

## Acceptance Criteria

- [x] Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts` via a migration applied locally — `migrations/0002_create_mcq_tables.sql`; applied `--local` 2026-09-01
- [ ] Teachers can see all questions in a shadcn table on `/mcqs` (name, description, actions)
- [ ] Empty bank shows an empty state; Create is still available
- [ ] Create navigates to a form with two choices; teachers can add up to six and cannot go below two
- [ ] Save on create persists the question and choices and returns to `/mcqs`
- [ ] Edit loads the question, Save updates it, Cancel does not save
- [ ] Exactly one correct choice is required; API and UI reject other counts
- [ ] Row actions use a vertical ellipsis dropdown with Edit, Preview, and Delete (Preview after Phase 5)
- [ ] Delete asks for confirmation, then removes the question (and cascaded choices/attempts)
- [ ] Preview does not include `isCorrect` on choices in the GET payload
- [ ] Submitting a preview choice stores an attempt with selected choice, label snapshot, and server-computed `isCorrect`
- [ ] Routes do not contain SQL; the MCQ service is the only D1 access for these tables
- [ ] Existing register/login/logout still works; logout remains on the bank page
- [ ] Each implementation phase was red-then-green; no hollow tests
- [ ] Tests cover failure paths (validation, 404, choice not on question)
- [ ] `npm test`, `npm run lint`, and `npm run build` succeed after the last phase (record actual results)

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Create happy path | New row appears on `/mcqs` after Save | Manual browser + unit tests |
| Edit happy path | Table shows updated name/description | Manual browser + unit tests |
| Delete | Row gone after confirm | Manual browser + unit tests |
| Choice limits | 2 default, max 6, cannot save 1 or 7 | Unit + form tests |
| Preview honesty | Preview GET has no `isCorrect` on choices | Route/service tests |
| Attempt accuracy | `isCorrect` matches the stored correct choice | Service tests |
| Unit suite | All Vitest tests pass | `npm test` — **49 passed** after Phase 2 |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — persistence (existing `DB` binding)
- Wrangler — local migrations

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — same as `user-service.ts`
- Next.js App Router — `src/app/api/` and pages
- Existing user auth UI and `/api/auth/logout` — unchanged
- shadcn/ui Base UI: existing `table`, `button`, `dialog`, `field`, `input`, `card`; add `dropdown-menu` (or equivalent) and `textarea`

### Authorized additions (not npm libraries)

- shadcn `dropdown-menu` (or Base UI equivalent) and `textarea` via `npx shadcn@latest add @shadcn/...`

### Proposed (not installed)

- `zod` — still not authorized

### Environment / bindings

- `DB` — existing; no new secrets

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `npm run dev` is used to “finish” MCQ work and D1 calls fail.
- **Mitigation**: Apply migrations with `--local` and verify with `npm run preview`.

- **Risk**: Updating choices deletes rows that attempts pointed at, breaking FKs.
- **Mitigation**: Attempts do **not** FK to `mcq_choices`. Snapshots on the attempt row preserve history.

- **Risk**: Preview GET returns `isCorrect`, so the UI can cheat.
- **Mitigation**: Dedicated preview endpoint/projection without `isCorrect`. Tests assert the shape.

- **Risk**: Partial unique index on one correct choice plus a replace-all update races or fails mid-update.
- **Mitigation**: Perform choice replace in a D1 `batch` (delete then inserts) so the unique index is not left violated between statements if the runtime supports it; tests cover the replace path.

- **Risk**: Unit tests talk to real D1.
- **Mitigation**: Mock `getCloudflareContext` / `DB` like `user-service.test.ts`.

### User Experience Risks

- **Risk**: Teachers think `/mcqs` is private.
- **Mitigation**: Unchanged from auth: no session. Do not imply lock-down in copy.

- **Risk**: Accidental delete.
- **Mitigation**: Confirm `Dialog` before `DELETE`.

- **Risk**: Add-choice with no limit produces unusable forms.
- **Mitigation**: Cap at six; disable Add at six; disable Remove at two.

---

## Troubleshooting Guide

Populate as issues are found during implementation. Known from the auth sprint and still relevant:

### D1 binding missing at runtime

**Problem**: `env.DB` is undefined.
**Cause**: Missing binding or `next dev` without Workers.
**Solution**: Prefer `npm run preview`. Binding in `wrangler.jsonc`.

### `getCloudflareContext` throws in tests

**Problem**: Service tests fail before assertions.
**Cause**: No Cloudflare context under jsdom.
**Solution**: `vi.mock("@opennextjs/cloudflare")` as in `src/lib/services/user-service.test.ts`.

### shadcn add produces no files

**Problem**: `dropdown-menu` or `textarea` not added.
**Cause**: Bare name without `@shadcn/`, or component name differs on Base UI.
**Solution**: Use `npx shadcn@latest add @shadcn/<name>`; if empty, check Base UI equivalent (`menu`, etc.).

### Migration applied to remote by mistake

**Problem**: Production schema changed.
**Cause**: `migrations apply` `--remote`.
**Solution**: Agents never apply remote. User owns production schema.

### Local D1 applied 0001 and 0002 together

**Problem**: `migrations apply --local` listed both `0001_create_users.sql` and `0002_create_mcq_tables.sql`.
**Cause**: The local SQLite under `.wrangler/state/v3/d1` for `quiz-maker-db` had not recorded `0001` yet (auth-sprint local apply used a different database name/path).
**Solution**: Let Wrangler apply both locally. Do not apply `--remote`. Users table SQL is unchanged.

### Fake D1 `prepare().all` is not a function

**Problem**: `listMcqs` tests fail with `db.prepare(...).all is not a function`.
**Cause**: The fake only implemented `prepare().bind().all()`, but list uses `prepare().all()` with no parameters (valid D1).
**Solution**: Fake `prepare()` also exposes `all`/`run` without `bind`. See `src/lib/services/mcq-service.test.ts`.

---

## Notes for AI Agents

1. Start by reading Overview and Hypothesis
2. Honor Scope (In/Out/Cut) — no sessions, no `user_id` on attempts, no Zod unless the user says yes
3. **One phase at a time.** Phases 1–2 are done. Do not start Phase 3 (HTTP routes) unless the user asks. Update phase status markers as work progresses
4. Add as-built details under Technical Implementation Details with `filepath:line-number`
5. Mark acceptance criteria when they actually work
6. Ask before new npm dependencies
7. Do not deploy; do not apply remote migrations
8. Reuse the existing Vitest harness; do not reinstall it
9. Keep register/login/logout working; extend `/mcqs` rather than inventing a parallel app
10. `AGENTS.md` still describes the unmodified starter in places; update it when implementation of this feature begins so later chats know the question bank is in progress

---

## Current Status

**Last Updated**: 2026-09-01
**Current Phase**: Phase 2 complete. Phase 3 (MCQ HTTP routes) not started.
**Status**: Phase 2 COMPLETED

**Phase 1 (COMPLETED)**
- Red: 6 MCQ schema tests failed; 35 existing tests passed. Reason: no `CREATE TABLE mcqs` in migrations.
- Green: `migrations/0002_create_mcq_tables.sql`; local apply on `quiz-maker-db`; **41 tests passed**
- Remote schema: not applied (user-owned)

**Phase 2 (COMPLETED)**
- Red: missing `./mcq-service` (Vite failed to resolve the import)
- Green: `src/lib/services/mcq-service.ts` + `mcq-service.test.ts`; **49 tests passed**
- No HTTP routes or UI in this phase

**Next Steps**: When asked, start **Phase 3** only (MCQ HTTP route tests, then handlers that call the service). Do not implement UI until Phase 4 is requested.
