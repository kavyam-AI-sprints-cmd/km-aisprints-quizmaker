Date created: 2026-08-31
Date last modified: 2026-08-31 (schema correction: `question` and `created_by_user_id`)

# MCQ CRUD - Technical PRD

## Overview/Problem

Quiz Maker is a greenfield application for multiple teachers to collaborate on a shared test bank of multiple-choice questions. Identity is already in place: teachers can register, log in, and land on an MCQ stub at `/mcqs` that only shows placeholder copy and a logout control. Without question CRUD, that stub is a dead end — teachers still have no way to create, edit, preview, or delete multiple-choice questions, manage their choices, or record an attempt against a question. This sprint replaces the stub with a complete MCQ management flow on the same identity foundation (no sessions, no auth gate).

---

## Hypothesis

We believe that a D1-backed MCQ service with HTTP CRUD, a shadcn table plus ellipsis actions, a shared create/edit form (two to six choices), and a preview that records attempts will let teachers manage a shared question bank without adding sessions, AI generation, or extra npm dependencies.

---

## Scope

### In Scope

- Three D1 tables via a Wrangler migration: `mcqs`, `mcq_choices`, `mcq_attempts`
- An MCQ service in `src/lib/services/` as the only module that talks to D1 for these tables
- HTTP endpoints for list, create, get, update, delete, and recording an attempt
- `/mcqs` list page: table of all MCQs (name, question, actions), Create MCQ button, Log out
- `mcqs.created_by_user_id` records which `users.id` created the row (set on insert; not changed on update)
- Actions column uses a three-vertical-ellipsis dropdown: Edit, Preview, Delete
- Shared create/edit page (same form for both flows) with Save and Cancel
- Choices UI starts with two choices; teacher can add up to six and remove down to two
- Exactly one choice is marked correct
- Preview page where the teacher selects a choice and records an attempt (selected choice + whether it was correct)
- Delete confirmation before the MCQ is removed
- Vitest unit tests, written first in each phase (red) and passing before the phase is marked complete (green)
- Continue using existing shadcn/ui pieces and add only the shadcn components this UI needs (dropdown menu, textarea, radio group)

### Out of Scope

- Sessions, cookies, tokens, or route guards that block `/mcqs` for anonymous visitors (unchanged from identity sprint)
- `user_id` on `mcq_attempts` (attempts stay anonymous until sessions land)
- Changing `created_by_user_id` on update (the creator is immutable)
- AI-generated questions or any AI SDK
- Multiple correct answers, true/false-only types, or question types other than single-correct MCQ
- Search, filter, sort controls, pagination, tags, folders, or sharing links
- Attempt history UI (attempts are persisted; listing them is a later sprint)
- Profile, password reset, or any change to register / login / logout contracts

### Cut

- **Zod** - Validation is required, but Zod is still not installed. Use hand-written validators in `src/lib/` matching `auth-validation.ts`. Ask before adding it.
- **Server Actions instead of HTTP endpoints** - The identity sprint set the contract as App Router `route.ts` handlers so a later client (or test) can call the same HTTP API. Keep that for MCQs.
- **`@cloudflare/vitest-pool-workers`** - Unit tests mock D1 / `getDb()`. Do not change the suite runtime.
- **`user_id` on `mcq_attempts`** - Attempts record the MCQ and selected choice only. Revisit when sessions land.
- **Server-side session cookie to populate `created_by_user_id`** - Identity sprint still has no cookies. The client remembers `user.id` from the last successful register/login (sessionStorage, cleared on logout) and sends it as `createdByUserId` on create. That is not a session and does not gate routes.
- **Replacing all choices on every update** - Would cascade-delete historical attempts. Updates preserve choice ids when the client sends them.
- **react-hook-form** - Not installed; forms stay as client components with local state, matching login/register.

---

## Technical Requirements

### Database Schema

Cloudflare D1 (SQLite). Database name: `km-quizmaker-db`. Binding name: `DB` (already created and bound in the identity sprint).

Do **not** create a new D1 database. Add a second migration and apply it **locally only**:

1. `npx wrangler d1 migrations create km-quizmaker-db create-mcqs`
2. Write the three `CREATE TABLE` statements into the generated SQL file
3. Apply **locally only**: `npx wrangler d1 migrations apply km-quizmaker-db --local`
4. Never apply with `--remote`

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX idx_mcqs_created_by_user_id ON mcqs (created_by_user_id);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  position INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices (mcq_id);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE,
  FOREIGN KEY (choice_id) REFERENCES mcq_choices(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
CREATE INDEX idx_mcq_attempts_choice_id ON mcq_attempts (choice_id);
```

Column notes:

| Table | Column | Type | Rules |
|--------|--------|------|--------|
| `mcqs` | `id` | TEXT PK | Random 32-char hex, same as `users.id` |
| `mcqs` | `name` | TEXT | Required, trimmed, 1–200 chars. Short title shown in the list table |
| `mcqs` | `question` | TEXT | Required, trimmed, 1–1000 chars. The question stem shown on preview. There is no `description` column |
| `mcqs` | `created_by_user_id` | TEXT FK | Required. `users.id` of the teacher who created the row. Set on insert only |
| `mcqs` | `created_at` / `updated_at` | DATETIME | Set on insert; `updated_at` refreshed on every MCQ update |
| `mcq_choices` | `id` | TEXT PK | Random 32-char hex |
| `mcq_choices` | `mcq_id` | TEXT FK | Parent MCQ. Indexed |
| `mcq_choices` | `text` | TEXT | Required, trimmed, 1–500 chars |
| `mcq_choices` | `is_correct` | INTEGER | `0` or `1`. Exactly one choice per MCQ must be `1` |
| `mcq_choices` | `position` | INTEGER | 0-based display order matching the form |
| `mcq_attempts` | `id` | TEXT PK | Random 32-char hex |
| `mcq_attempts` | `mcq_id` | TEXT FK | Question being attempted |
| `mcq_attempts` | `choice_id` | TEXT FK | Choice the teacher selected |
| `mcq_attempts` | `is_correct` | INTEGER | Snapshot at attempt time (`1` if that choice's `is_correct` was `1`). Do not recompute later if the MCQ is edited |

Naming follows `users`: snake_case table and column names; TypeScript uses camelCase (`createdAt`, `createdByUserId`, `isCorrect`, `mcqId`).

There is no `description` column. An earlier draft of this PRD used `description`; it was renamed to `question` before this sprint shipped.

Service deletes attempts, then choices, then the MCQ so cleanup works even if D1 is not enforcing foreign keys. The `ON DELETE CASCADE` clauses are still declared.

### API Endpoints

All MCQ routes are Next.js App Router handlers under `src/app/api/mcqs/`. JSON in, JSON out. No cookies. Handlers call the MCQ service; they do not import `getDb()` or `env.DB`. Each handler exports `dynamic = "force-dynamic"` and `runtime = "nodejs"` (same as auth).

CamelCase JSON. Never leak snake_case D1 column names.

#### GET /api/mcqs

Lists every MCQ (no choices). Newest first (`created_at DESC`).

**Response:**

- Success (200):

```json
{
  "mcqs": [
    {
      "id": "a1b2c3...",
      "name": "Arithmetic",
      "question": "What is 2 + 2?",
      "createdByUserId": "user-hex-id",
      "createdAt": "2026-08-31T12:00:00.000Z",
      "updatedAt": "2026-08-31T12:00:00.000Z"
    }
  ]
}
```

Empty list is `{ "mcqs": [] }`.

- Error (500): `{ "error": "Unable to list MCQs" }` plus `console.error`

#### POST /api/mcqs

Creates an MCQ and its choices.

**Request Body:**

```json
{
  "name": "Arithmetic",
  "question": "What is 2 + 2?",
  "createdByUserId": "user-hex-id",
  "choices": [
    { "text": "3", "isCorrect": false },
    { "text": "4", "isCorrect": true }
  ]
}
```

`createdByUserId` is required on create (the `users.id` of the teacher). `choices` must have 2–6 items. Exactly one `isCorrect: true`.

**Response:**

- Success (201): `{ "mcq": McqWithChoices }` (see GET by id)
- Error (400): validation failure (`{ "error": "..." }`)
- Error (500): `{ "error": "Unable to create MCQ" }` plus `console.error`

#### GET /api/mcqs/:id

Returns one MCQ with choices ordered by `position`. Used by both edit and preview.

**Response:**

- Success (200):

```json
{
  "mcq": {
    "id": "a1b2c3...",
    "name": "Arithmetic",
    "question": "What is 2 + 2?",
    "createdByUserId": "user-hex-id",
    "createdAt": "...",
    "updatedAt": "...",
    "choices": [
      { "id": "...", "mcqId": "...", "text": "3", "isCorrect": false, "position": 0 },
      { "id": "...", "mcqId": "...", "text": "4", "isCorrect": true, "position": 1 }
    ]
  }
}
```

- Error (404): `{ "error": "MCQ not found" }`
- Error (500): `{ "error": "Unable to load MCQ" }` plus `console.error`

#### PUT /api/mcqs/:id

Replaces name, question, and the choice set. Does **not** change `createdByUserId`.

**Request Body:** same shape as POST except `createdByUserId` is omitted (ignored if sent). Each choice may include `id` to keep that row (and its attempt history). Choices without `id` are inserted. Existing choices omitted from the array are deleted.

**Response:**

- Success (200): `{ "mcq": McqWithChoices }`
- Error (400): validation failure
- Error (404): `{ "error": "MCQ not found" }`
- Error (500): `{ "error": "Unable to update MCQ" }` plus `console.error`

#### DELETE /api/mcqs/:id

Deletes the MCQ, its choices, and its attempts.

**Response:**

- Success (200): `{ "ok": true }`
- Error (404): `{ "error": "MCQ not found" }`
- Error (500): `{ "error": "Unable to delete MCQ" }` plus `console.error`

#### POST /api/mcqs/:id/attempts

Records one attempt. The service loads the choice, verifies it belongs to this MCQ, and stores `is_correct` from that choice at write time.

**Request Body:**

```json
{
  "choiceId": "choice-hex-id"
}
```

**Response:**

- Success (201):

```json
{
  "attempt": {
    "id": "...",
    "mcqId": "...",
    "choiceId": "...",
    "isCorrect": true,
    "createdAt": "..."
  }
}
```

- Error (400): missing/invalid `choiceId`, or choice does not belong to this MCQ (`{ "error": "..." }`)
- Error (404): MCQ or choice missing (`{ "error": "MCQ not found" }` or `{ "error": "Choice not found" }`)
- Error (500): `{ "error": "Unable to record attempt" }` plus `console.error`

### User Interface Requirements

Use shadcn/ui from `@/components/ui`. Do not add `react-hook-form`. Pages stay thin; behavior lives in `src/components/mcqs/`. Client components are required because they `fetch` and hold form/list state. Query by accessible name in tests.

Add shadcn components that are not already in the repo: `dropdown-menu`, `textarea`, `radio-group` (`npx shadcn@latest add @shadcn/<name>`). Do not hand-edit generated files in `src/components/ui/` beyond using them. `table`, `button`, `card`, `field`, `input`, `label`, `dialog` are already installed.

Keep Log out on the list page (POST `/api/auth/logout` then navigate to `/login`), same contract as the stub.

#### MCQ list (/mcqs)

- Replaces `McqStub`. Heading **Question bank**
- **Create MCQ** button navigates to `/mcqs/new`
- **Log out** button unchanged in behavior
- Table columns: **Name**, **Question**, **Actions**
- Empty state when `mcqs` is `[]`: copy that there are no questions yet, still show Create
- Each row's Actions cell is a ghost icon button with a three-vertical-ellipsis (Lucide `EllipsisVertical`). Accessible name: `Actions for {name}`
- Dropdown items: **Edit** → `/mcqs/{id}/edit`; **Preview** → `/mcqs/{id}/preview`; **Delete** opens a confirm dialog, then `DELETE /api/mcqs/{id}`, then refresh the list
- Load data with `GET /api/mcqs` on mount. Show a form-level error if the request fails

#### Create / Edit (same form)

- `/mcqs/new` — create
- `/mcqs/[id]/edit` — edit (same `McqForm` client component)
- Fields:
  - **Name** (required text; short title)
  - **Question** (required textarea; the stem)
  - **Choices** fieldset: two text fields on create; each row has choice text plus a radio in a group **Correct answer** so exactly one is selected
  - **Add choice** — disabled at 6
  - **Remove** on a choice row — disabled when only two remain
- **Save** POSTs `/api/mcqs` including `createdByUserId` from the last successful login/register (create, expect 201) or PUTs `/api/mcqs/{id}` without changing creator (edit, expect 200), then navigates to `/mcqs`
- **Cancel** navigates to `/mcqs` without saving (no fetch)
- Client validation before fetch: name required; question required; 2–6 choices; every choice has text; exactly one correct
- If there is no remembered user id on create, show an error and do not POST (direct visit to `/mcqs/new` without logging in)
- Edit loads `GET /api/mcqs/{id}` and prefills, including choice ids so Save can send them back
- Disable Save while in flight. Show API / validation errors with `FieldError`

#### Preview (/mcqs/[id]/preview)

- Loads `GET /api/mcqs/{id}`
- Shows name (heading), question (stem), and choices as a radio group **without** revealing which is correct
- **Check answer** (or equivalent) POSTs `/api/mcqs/{id}/attempts` with the selected `choiceId`
- After 201, show whether the selected choice was correct or incorrect using `attempt.isCorrect`
- Do not submit if no choice is selected
- **Back** navigates to `/mcqs` without recording an attempt

#### Shared UI behavior

- Disable in-flight buttons
- Never log secrets (there are none on this feature)
- Do not store MCQs in cookies or localStorage. Remember only `user.id` from the last successful register/login in **sessionStorage** so create can send `createdByUserId`. Logout clears it. This is not a session cookie and does not gate routes.
- No auth gate: visiting `/mcqs` directly is still allowed

---

## Testing Strategy

This feature is built **test-first** with **Vitest**. Follow `.cursor/skills/testing/SKILL.md`. The harness from the identity sprint is already installed; do not reinstall it.

### Red → green per phase

Do not write production code for a phase until that phase's tests exist and have been run once as **red**. Then implement until those tests are **green**. A phase is complete only when:

1. That phase's Vitest files pass in isolation (`npm run test -- path/to/file.test.ts`)
2. The full suite still passes (`npm run test`)
3. The phase's acceptance criteria below are true

Never write a test whose assertion cannot fail. Assert observable results. Cover failure paths. Name tests so a failure message explains what broke.

Colocate tests with the subject. Reset mocks in `beforeEach` with `vi.clearAllMocks()`. Each test must pass alone. Never hit a real network, real D1, or real model provider.

`getCloudflareContext()` does not work under jsdom. Mock `@/lib/db` (`getDb`) and supply a fake D1, matching `user-service.test.ts`. Route tests mock `@/lib/services/mcq-service` and import `GET`/`POST`/`PUT`/`DELETE` from `./route` (not `@/app/api/...`). Component tests hoist `fetchMock` / `mockPush`, mock `next/navigation`, and use `userEvent.setup({ delay: null })`. Query by role and accessible name. Do not assert on CSS class names or test IDs.

Server Components cannot be rendered by Testing Library. Extract client components under `src/components/mcqs/`.

### What tests do not replace

Vitest does not prove local D1 migrations. After Phase 1, still apply with `--local`. Product-owner verification of list / create / edit / preview / delete should be done in the browser on `npm run dev` against local D1.

---

## Implementation Phases

### Phase 1: D1 MCQ tables - COMPLETED

**Objective**: Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts`.

**Tasks**:

1. **Write failing tests** listed in this phase's Testing Plan; run them and confirm red
2. Create the `create-mcqs` migration with the schema above
3. Apply the migration locally only
4. Re-run the phase tests and confirm green

**Deliverables**:

- `src/lib/d1-mcqs-setup.test.ts` (green — 10 contract tests)
- `migrations/0002_create-mcqs.sql` (Phase 1 contract: `mcqs`, `mcq_choices`, `mcq_attempts`)
- `migrations/0003_replace-mcqs-question-and-created-by.sql` (local rebuild after the first-draft 0002 used `description`; same final schema as 0002)

#### Testing Plan — Phase 1

Unit tests cannot apply Wrangler migrations. They lock the **committed contract**: the three tables' DDL. Manual Wrangler apply still runs after the tests go green.

**Write first (red):** `src/lib/d1-mcqs-setup.test.ts`

Phase 1 tests concatenate every `migrations/*.sql` file. `extractCreateTableBody` uses the **last** `CREATE TABLE` for each name so a rebuild migration (0003) is the contract that must match this schema.

| Test name (intent) | Asserts |
|---|---|
| `migration creates an mcqs table` | SQL includes `CREATE TABLE` `mcqs` |
| `mcqs has required columns` | `id`, `name`, `question`, `created_by_user_id`, `created_at`, `updated_at` (no `description`) |
| `mcqs id is a text primary key` | `id` is `TEXT` and `PRIMARY KEY` (not integer autoincrement) |
| `mcqs created_by_user_id references users` | `FOREIGN KEY` on `created_by_user_id` referencing `users` |
| `migration creates an mcq_choices table` | `CREATE TABLE` `mcq_choices` |
| `mcq_choices has required columns` | `id`, `mcq_id`, `text`, `is_correct`, `position` |
| `mcq_choices references mcqs` | `FOREIGN KEY` on `mcq_id` referencing `mcqs` |
| `migration creates an mcq_attempts table` | `CREATE TABLE` `mcq_attempts` |
| `mcq_attempts has required columns` | `id`, `mcq_id`, `choice_id`, `is_correct` |
| `mcq_attempts references mcqs and mcq_choices` | FKs on `mcq_id` → `mcqs` and `choice_id` → `mcq_choices` |

**Red:** no MCQ SQL → `CREATE TABLE` assertions fail. Confirmed 2026-08-31: 9 failed against `0001_create-users.sql` only (no `mcqs` / `mcq_choices` / `mcq_attempts`). After the schema correction (`question` + `created_by_user_id`), the contract gained a tenth test (`mcqs created_by_user_id references users`).

**Green:** `0002_create-mcqs.sql` matches this PRD. Confirmed 2026-08-31: `npm run test -- src/lib/d1-mcqs-setup.test.ts` — **10 passed**.

**Local apply (not proven by Vitest):**

1. `npx wrangler d1 migrations create km-quizmaker-db create-mcqs` → `migrations/0002_create-mcqs.sql`
2. `npx wrangler d1 migrations apply km-quizmaker-db --local` — 0002 applied (`--remote` was not used)
3. Schema correction: 0002 file updated to `question` + `created_by_user_id`; `0003_replace-mcqs-question-and-created-by.sql` rebuilds local tables to that contract
4. Re-check 2026-08-31: `npx wrangler d1 migrations list km-quizmaker-db --local` and `apply --local` → **No migrations to apply**
5. `PRAGMA table_info(mcqs)` on local D1: `id`, `name`, `question`, `created_by_user_id`, `created_at`, `updated_at` (no `description`)

**Phase 1 is not done on green tests alone.** Local apply succeeded. Remote migrations were not applied.

### Phase 2: MCQ service - PLANNED

**Objective**: All MCQ / choice / attempt persistence goes through one service; route handlers do not call `env.DB` directly.

**Tasks**:

1. **Write failing tests** listed in this phase's Testing Plan; run them and confirm red
2. Add `src/lib/services/mcq-service.ts` with list, get, create, update, delete, and createAttempt
3. Use prepared statements and numbered placeholders (`?1`, `?2`)
4. Generate 32-char hex ids with `crypto.getRandomValues` (same helper pattern as `user-service`)
5. Enforce 2–6 choices and exactly one correct at the service (defense in depth; HTTP validation also enforces this)
6. Re-run the phase tests and confirm green

**Deliverables**:

- `src/lib/services/mcq-service.ts`
- `src/lib/services/mcq-service.test.ts` (green)

#### Testing Plan — Phase 2

Mock `getDb`. Prefer an in-memory store behind a fake `prepare`/`bind`/`run`/`all` (and `batch` if the service uses it). Reset store and mocks in `beforeEach`.

**Write first (red):** `src/lib/services/mcq-service.test.ts`

Use a fixture with name `"Arithmetic"`, question `"What is 2 + 2?"`, a `createdByUserId`, and two choices (`"3"` incorrect, `"4"` correct).

| Test name (intent) | Asserts |
|---|---|
| `createMcq returns the mcq with choices and generated ids` | Result has `id`, `name`, `question`, `createdByUserId`, two choices with ids; `isCorrect` matches input |
| `createMcq rejects blank question` | Throws a typed validation error |
| `createMcq rejects blank createdByUserId` | Same |
| `createMcq rejects fewer than two choices` | Same |
| `createMcq rejects more than six choices` | Same |
| `createMcq rejects zero correct choices` | Same |
| `createMcq rejects more than one correct choice` | Same |
| `createMcq rejects blank name` | Same |
| `createMcq rejects blank choice text` | Same |
| `listMcqs returns summaries without choices` | After two creates, list length 2; items have `name` / `question` and no `choices` |
| `listMcqs returns newest first` | Second created appears before first |
| `getMcqById returns the mcq with choices in position order` | Round-trip; choices ordered |
| `getMcqById returns null when missing` | Unknown id |
| `updateMcq changes name, question, and choice text` | Returned object reflects patch |
| `updateMcq does not change createdByUserId` | Creator id unchanged after update |
| `updateMcq preserves choice ids that are sent` | Same choice `id` after update |
| `updateMcq inserts new choices and deletes omitted ones` | New id appears; omitted id is gone |
| `updateMcq returns null when missing` | Unknown id |
| `deleteMcq returns true and removes the row` | Subsequent get is null |
| `deleteMcq also removes choices and attempts` | get/list empty; createAttempt after delete cannot find the MCQ |
| `deleteMcq returns false when missing` | Unknown id |
| `createAttempt records the selected choice and whether it was correct` | Correct choice → `isCorrect: true` |
| `createAttempt records an incorrect selection as incorrect` | Wrong choice → `isCorrect: false` |
| `createAttempt rejects a choice that does not belong to the mcq` | Typed error |
| `createAttempt returns null (or not-found error) when the mcq is missing` | Unknown mcq id |

**Red:** `mcq-service.ts` missing or unimplemented → import/runtime failures.

**Green:** all rows above pass with the fake DB only.

### Phase 3: MCQ HTTP endpoints - PLANNED

**Objective**: List, create, get, update, delete, and attempts are callable over HTTP.

**Tasks**:

1. **Write failing tests** listed in this phase's Testing Plan; run them and confirm red
2. Shared request validation in `src/lib/mcq-validation.ts` (no Zod)
3. Route handlers listed under API Endpoints
4. Never set cookies
5. Re-run the phase tests and confirm green

**Deliverables**:

- `src/app/api/mcqs/route.ts`
- `src/app/api/mcqs/[id]/route.ts`
- `src/app/api/mcqs/[id]/attempts/route.ts`
- `src/lib/mcq-validation.ts`
- Matching `*.test.ts` files (green)

#### Testing Plan — Phase 3

Call the exported handlers with `Request` objects. For `[id]` routes, pass `{ params: Promise.resolve({ id }) }`. Mock `@/lib/services/mcq-service`. Validation tests are pure.

**Write first (red):**

- `src/lib/mcq-validation.test.ts`
- `src/app/api/mcqs/route.test.ts`
- `src/app/api/mcqs/[id]/route.test.ts`
- `src/app/api/mcqs/[id]/attempts/route.test.ts`

**Validation**

| Test name (intent) | Asserts |
|---|---|
| `accepts a valid create/update body` | `ok: true`; question trimmed |
| `rejects missing name` | 400-class result |
| `rejects missing question` | Same |
| `rejects missing createdByUserId on create` | Same |
| `rejects fewer than two choices` | Same |
| `rejects more than six choices` | Same |
| `rejects when no choice is correct` | Same |
| `rejects when two choices are correct` | Same |
| `rejects blank choice text` | Same |
| `attempt body requires choiceId` | Missing/blank fails |

**GET /api/mcqs**

| Test name (intent) | Asserts |
|---|---|
| `returns 200 and the mcq list` | `{ mcqs: [...] }` |
| `returns 500 when the service throws` | `{ error: "Unable to list MCQs" }` |

**POST /api/mcqs**

| Test name (intent) | Asserts |
|---|---|
| `returns 201 and the created mcq` | Status 201; body.mcq has choices |
| `does not set cookies` | No `Set-Cookie` |
| `returns 400 on invalid JSON or invalid body` | Validation path |
| `returns 500 when the service throws` | Generic error |

**GET /api/mcqs/:id**

| Test name (intent) | Asserts |
|---|---|
| `returns 200 and the mcq` | Body.mcq with choices |
| `returns 404 when missing` | `{ error: "MCQ not found" }` |
| `returns 500 on unexpected failure` | Generic error |

**PUT /api/mcqs/:id**

| Test name (intent) | Asserts |
|---|---|
| `returns 200 and the updated mcq` | Service called with id + body |
| `returns 400 on invalid body` | Validation |
| `returns 404 when missing` | Service returns null |
| `returns 500 on unexpected failure` | Generic error |

**DELETE /api/mcqs/:id**

| Test name (intent) | Asserts |
|---|---|
| `returns 200 { ok: true }` | When service returns true |
| `returns 404 when missing` | Service returns false |
| `returns 500 on unexpected failure` | Generic error |

**POST /api/mcqs/:id/attempts**

| Test name (intent) | Asserts |
|---|---|
| `returns 201 and the attempt with isCorrect` | Correct and incorrect fixtures |
| `returns 400 when choiceId is missing` | Validation |
| `returns 400 when the choice does not belong to the mcq` | Service typed error |
| `returns 404 when the mcq is missing` | |
| `returns 500 on unexpected failure` | Generic error |

**Red:** missing routes/validators → import failures or failed status/body assertions.

**Green:** all handler and validation tests pass against mocks.

### Phase 4: MCQ UI - PLANNED

**Objective**: A teacher can list, create, edit, preview, and delete MCQs in the browser, including two-to-six choices and recording an attempt on preview.

**Tasks**:

1. Add shadcn `dropdown-menu`, `textarea`, and `radio-group` if they are not already in `src/components/ui/`
2. **Write failing tests** listed in this phase's Testing Plan; run them and confirm red
3. Shared client validation in `src/lib/mcq-form-validation.ts`
4. Client components under `src/components/mcqs/`
5. Pages: `/mcqs`, `/mcqs/new`, `/mcqs/[id]/edit`, `/mcqs/[id]/preview`
6. Remove the stub-only copy; keep logout on the list page
7. Re-run the phase tests and confirm green

**Deliverables**:

- `src/components/mcqs/mcq-list.tsx`, `mcq-form.tsx`, `mcq-preview.tsx` (+ tests)
- `src/lib/mcq-form-validation.ts` (+ tests)
- Page shells under `src/app/mcqs/`
- `src/components/auth/mcq-stub.tsx` removed or reduced to unused; stub tests replaced by list tests (logout coverage moves to `mcq-list.test.tsx`)

#### Testing Plan — Phase 4

Query by role and accessible name. Mock `fetch` and `next/navigation`.

**Write first (red):**

- `src/lib/mcq-form-validation.test.ts`
- `src/components/mcqs/mcq-list.test.tsx`
- `src/components/mcqs/mcq-form.test.tsx`
- `src/components/mcqs/mcq-preview.test.tsx`

**Client validation**

| Test name (intent) | Asserts |
|---|---|
| `accepts a valid form` | `null` error |
| `rejects blank name` | Message |
| `rejects blank question` | Message |
| `rejects fewer than two choices` | Message |
| `rejects more than six choices` | Message |
| `rejects blank choice text` | Message |
| `rejects zero or two correct choices` | Message |

**List**

| Test name (intent) | Asserts |
|---|---|
| `shows question-bank heading, Create MCQ, and Log out` | Accessible names |
| `renders name and question in the table` | After GET 200 |
| `shows empty state when there are no mcqs` | Copy visible; Create still present |
| `Create MCQ navigates to /mcqs/new` | `router.push` |
| `actions menu offers Edit, Preview, and Delete` | Open ellipsis; three items |
| `Edit navigates to the edit page` | `/mcqs/{id}/edit` |
| `Preview navigates to the preview page` | `/mcqs/{id}/preview` |
| `Delete confirms then DELETEs and removes the row` | Dialog + `DELETE` + row gone |
| `logout POSTs /api/auth/logout then goes to /login` | Same as former stub |

**Create / edit form**

| Test name (intent) | Asserts |
|---|---|
| `create mode starts with two choice fields` | Two textboxes for choices |
| `Add choice adds a field up to six` | Sixth add leaves Add disabled; seventh does not appear |
| `cannot remove below two choices` | Remove disabled at two |
| `Save POSTs /api/mcqs then navigates to /mcqs` | Body has name, question, createdByUserId, choices; 201 → push `/mcqs` |
| `does not submit when name is empty` | `fetch` not called |
| `does not submit when question is empty` | `fetch` not called |
| `does not submit create when there is no remembered user id` | `fetch` not called; error visible |
| `Cancel navigates to /mcqs without saving` | `fetch` not called |
| `edit mode prefills from GET and PUTs on Save` | GET `/api/mcqs/{id}`; PUT with choice ids |

**Preview**

| Test name (intent) | Asserts |
|---|---|
| `renders the question and its choices` | Name + question stem + choice text; does not show "correct" before submit |
| `does not record an attempt when no choice is selected` | `fetch` POST attempts not called |
| `POSTs an attempt and shows correct` | 201 `isCorrect: true` → visible correct feedback |
| `POSTs an attempt and shows incorrect` | 201 `isCorrect: false` → visible incorrect feedback |
| `Back navigates to /mcqs without recording` | No attempts POST |

**Red:** missing modules/components → import failures or missing roles.

**Green:** form + list + preview tests pass. `npm run lint` and `npm run build` succeed.

**Status Markers**:

- COMPLETED - Phase is done
- IN PROGRESS - Currently working on this
- PLANNED - Not started yet

---

## Technical Implementation Details

### Key Files

| Path | Purpose |
|------|---------|
| `ai-workspace/mcq-crud_prd.md` | This PRD |
| `src/lib/d1-mcqs-setup.test.ts` | Phase 1 schema contract tests (10). Reads `migrations/*.sql` from disk |
| `migrations/0001_create-users.sql` | Existing `users` table (do not modify) |
| `migrations/0002_create-mcqs.sql` | Phase 1 contract: `mcqs` (`id`, `name`, `question`, `created_by_user_id`, timestamps), `mcq_choices`, `mcq_attempts` |
| `migrations/0003_replace-mcqs-question-and-created-by.sql` | Local rebuild so already-applied first-draft 0002 matches the corrected contract. Same DDL as 0002 |
| `src/lib/db.ts` | Existing `getDb()`; reuse, do not duplicate |
| `src/lib/services/mcq-service.ts` | MCQ / choice / attempt persistence |
| `src/lib/mcq-validation.ts` | HTTP body checks |
| `src/lib/current-user.ts` | Client helper: remember/clear `user.id` in sessionStorage for `createdByUserId` |
| `src/app/api/mcqs/route.ts` | GET list, POST create |
| `src/app/api/mcqs/[id]/route.ts` | GET / PUT / DELETE one |
| `src/app/api/mcqs/[id]/attempts/route.ts` | POST attempt |
| `src/components/mcqs/` | List, form, preview client components |
| `src/app/mcqs/page.tsx` | List page shell (replaces stub) |
| `src/app/mcqs/new/page.tsx` | Create page shell |
| `src/app/mcqs/[id]/edit/page.tsx` | Edit page shell |
| `src/app/mcqs/[id]/preview/page.tsx` | Preview page shell |

### Implementation Patterns

**Obtain D1 only on the server** via existing `getDb()` in `src/lib/db.ts`. Never import that module from a `'use client'` file.

**MCQ service (shape):**

```typescript
export type Mcq = {
  id: string;
  name: string;
  question: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type McqChoice = {
  id: string;
  mcqId: string;
  text: string;
  isCorrect: boolean;
  position: number;
};

export type McqWithChoices = Mcq & { choices: McqChoice[] };

export type McqAttempt = {
  id: string;
  mcqId: string;
  choiceId: string;
  isCorrect: boolean;
  createdAt: string;
};

export type NewMcqChoice = { text: string; isCorrect: boolean };
export type NewMcq = {
  name: string;
  question: string;
  createdByUserId: string;
  choices: NewMcqChoice[];
};

export type McqChoiceUpdate = { id?: string; text: string; isCorrect: boolean };
export type McqUpdate = {
  name: string;
  question: string;
  choices: McqChoiceUpdate[];
};

// listMcqs(): Promise<Mcq[]>
// getMcqById(id: string): Promise<McqWithChoices | null>
// createMcq(input: NewMcq): Promise<McqWithChoices>
// updateMcq(id: string, input: McqUpdate): Promise<McqWithChoices | null>
// deleteMcq(id: string): Promise<boolean>
// createAttempt(mcqId: string, choiceId: string): Promise<McqAttempt>
```

Throw `McqValidationError` for 2–6 / exactly-one-correct / blank field failures so handlers map them to 400. Throw or return a distinct not-found vs wrong-choice error so attempts can return 404 vs 400.

**Prepared statements (numbered placeholders).** Generate ids in JS:

```typescript
await db
  .prepare(
    "INSERT INTO mcqs (id, name, question, created_by_user_id) VALUES (?1, ?2, ?3, ?4)",
  )
  .bind(id, name, question, createdByUserId)
  .run();
```

Read with `.all()` and take `results` (or `results[0]`). Do not rely on `.first()`. Store `is_correct` as `0`/`1`; map to boolean in TypeScript.

**HTTP handlers** parse JSON, validate, call the service, return JSON. Dynamic `[id]` uses `context.params` as a `Promise` (Next.js 16).

### Important Notes

- Teaching repository: **ask before adding a dependency**. shadcn add copies source into `src/components/ui/` and is allowed. Do not add Zod or testing-pool-workers.
- Reuse `getDb()`. Do not create a second Cloudflare context helper.
- Never apply migrations remotely. Never run `npm run deploy` unless asked.
- Do not edit `cloudflare-env.d.ts` or `package-lock.json` by hand.
- Identity sprint is unchanged: no cookies, no auth middleware. `/mcqs` is still reachable without a session.
- `created_by_user_id` is required on insert. The client remembers `user.id` from register/login in sessionStorage and sends it as `createdByUserId`. Logout clears it. This is not a cookie session.
- There is no `description` column. Use `question` for the stem.
- Preview must not visually mark the correct choice until an attempt is recorded, even though GET includes `isCorrect` for the edit form.
- Choice count: default two on create, maximum six, minimum two (cannot remove the last two).
- Exactly one correct choice is required on create and update.

---

## Acceptance Criteria

- [ ] Each implementation phase wrote its tests first (red), then implementation (green); a phase was not marked COMPLETED while its tests failed
- [ ] `npm run test` is green for the full suite (identity tests still pass)
- [x] Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts` via a migration applied with `--local` only (`0002` + local `0003` rebuild; `PRAGMA table_info(mcqs)` shows `question` and `created_by_user_id`)
- [ ] Teachers can list all MCQs in a table with name, question, and an actions column
- [ ] Each MCQ row stores `created_by_user_id` for the teacher who created it
- [ ] Create MCQ navigates to the create/edit form
- [ ] The form starts with two choices and allows adding up to six
- [ ] The form cannot submit with fewer than two choices or more than six
- [ ] Save persists the MCQ and its choices through the MCQ service (not from a route handler calling D1)
- [ ] Cancel leaves the form without saving
- [ ] Edit loads an existing MCQ and Save updates it
- [ ] Ellipsis actions include Edit, Preview, and Delete
- [ ] Delete removes the MCQ (and its choices and attempts)
- [ ] Preview shows the question and choices without revealing the answer until an attempt is submitted
- [ ] Submitting a preview selection records an attempt with the MCQ, the selected choice, and whether it was correct
- [ ] API success payloads use camelCase and never return D1 snake_case column names as the public contract
- [ ] No cookies, tokens, or session records are created
- [ ] `npm run lint`, `npm run test`, and `npm run build` succeed after implementation

---

## Success Metrics

These are post-implementation checks for this teaching sprint, not production analytics.

| Metric | Target | How Measured |
|--------|--------|--------------|
| Teacher can add a question | One row in `mcqs` plus at least two `mcq_choices` after Save | Local D1 `SELECT` |
| Choice limits | UI and API both reject 1 and 7 choices | Vitest + form walkthrough |
| Attempt scoring | Selecting the correct choice stores `is_correct = 1`; wrong stores `0` | Preview walkthrough + local D1 |
| Identity still works | Register / login / logout unchanged | Existing Vitest suite + login still reaches `/mcqs` |

---

## Dependencies

### External Dependencies

- **Cloudflare D1** - Persistence. Existing binding `DB` (`km-quizmaker-db`)
- **Wrangler** - Already a devDependency; used for the new local migration

### Internal Dependencies

- **User identity sprint** - Login still lands on `/mcqs`; logout remains on the list page. Contracts in `ai-workspace/register-login-logout_prd.md` are not changed
- **`getDb()`** - `src/lib/db.ts`
- **shadcn/ui** - Existing `button`, `card`, `dialog`, `field`, `input`, `label`, `table`; add `dropdown-menu`, `textarea`, `radio-group`
- **Vitest** - Already installed

### Environment

- No new secrets. D1 binding is unchanged.

### Approved npm packages (this sprint)

- None. Use the existing Vitest harness and shadcn CLI to copy UI primitives.

### Proposed npm packages (still ask first)

- **Zod** — still not approved.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: Foreign keys are declared but D1 might not enforce them in every local/remote path.
- **Mitigation**: Service deletes child rows explicitly. Tests cover that delete removes choices and attempts.

- **Risk**: Updating an MCQ by deleting and re-inserting all choices wipes attempt history.
- **Mitigation**: Preserve choice ids from the edit form. Only delete omitted ids.

- **Risk**: Cloud / CI cannot run `wrangler d1 migrations apply`.
- **Mitigation**: Stop and report that local apply must be run on a machine already logged in. Do not invent a second database id.

- **Risk**: Identity tests break if the stub is removed without moving logout coverage.
- **Mitigation**: Port logout tests onto `McqList`. Keep register/login tests untouched.

### User Experience Risks

- **Risk**: Teachers expect `/mcqs` to stay "logged in" after refresh.
- **Mitigation**: Unchanged from identity sprint. Do not imply a persistent session.

- **Risk**: Preview GET includes `isCorrect`, so a determined user can read the answer from the network tab.
- **Mitigation**: Accept for this teaching sprint. The UI still does not reveal it until Check answer. A later sprint can add a preview DTO that omits `isCorrect`.

- **Risk**: Accidental delete.
- **Mitigation**: Confirm dialog before `DELETE`.

---

## Troubleshooting Guide

Add entries here when bugs are found during implementation. Anticipated issues:

### Local schema still has `description` instead of `question`

**Problem**: Inserts fail with "no such column: question" or tests expect `created_by_user_id` but local D1 still has the first draft of `0002`.
**Cause**: `0002_create-mcqs.sql` was applied locally with the first-draft `description` column.
**Solution**: Apply `0003_replace-mcqs-question-and-created-by.sql` locally: `npx wrangler d1 migrations apply km-quizmaker-db --local`. Do not apply `--remote`.
**Code Reference**: `migrations/0002_create-mcqs.sql`

### Local schema missing MCQ tables

**Problem**: Inserts fail with "no such table: mcqs".
**Cause**: Migration not applied locally.
**Solution**: `npx wrangler d1 migrations apply km-quizmaker-db --local`
**Code Reference**: `migrations/`

### `@/` imports fail in Vitest

**Problem**: Tests cannot resolve `@/lib/...`.
**Cause**: `vite-tsconfig-paths` missing from `vitest.config.ts`.
**Solution**: Do not change the existing config; it already includes `tsconfigPaths()`.
**Code Reference**: `vitest.config.ts`

### Dynamic route tests cannot read `id`

**Problem**: GET/PUT/DELETE handlers 404 or throw when reading params.
**Cause**: Next.js 16 passes `params` as a Promise.
**Solution**: `const { id } = await context.params`. Tests pass `{ params: Promise.resolve({ id: "..." }) }`.
**Code Reference**: `src/app/api/mcqs/[id]/route.ts`

### UI shows HTML 404 for `/api/mcqs`

**Problem**: List/create shows a generic request error; Network tab is 404 HTML.
**Cause**: Turbopack `next dev` has not registered the new Route Handlers.
**Solution**: Restart `npm run dev`. Export `dynamic = "force-dynamic"` and `runtime = "nodejs"`.
**Code Reference**: `src/app/api/mcqs/route.ts`

---

## Notes for AI Agents

When working with this PRD:

1. Start by reading Overview and Hypothesis. This sprint is MCQ CRUD on top of existing identity — do not rebuild register/login.
2. Honor Scope. Do not add sessions, AI, or Zod. Do add `created_by_user_id` on `mcqs` (not on attempts). Do not keep a `description` column — the stem is `question`.
3. Follow `.cursor/rules/d1.mdc`, `.cursor/rules/nextjs.mdc`, `.cursor/rules/shadcn.mdc`, and `.cursor/skills/testing/SKILL.md`.
4. HTTP route handlers are required even though the Next.js rule prefers Server Actions.
5. **TDD is mandatory.** For each phase: write the tests in that phase's Testing Plan → run `npm run test` and confirm they fail → implement → run tests until green → only then mark the phase COMPLETED.
6. Do not start Phase N+1 while Phase N tests are red.
7. Ask before adding npm dependencies.
8. Do not deploy. Do not apply D1 migrations remotely.
9. Update phase status markers as work progresses.
10. Add implementation details (real file names) under Technical Implementation Details as code is written.
11. Mark acceptance criteria when they are verified, not when the file exists.
12. Append Troubleshooting entries when bugs are fixed.
13. Update `AGENTS.md` project blurb when this feature is verified.
14. Verify with `npm run lint`, `npm run test`, and `npm run build`. Exercise list → create → edit → preview attempt → delete in the browser when possible. D1 on `next dev` requires `initOpenNextCloudflareForDev()`.

---

## Current Status

**Last Updated**: 2026-08-31
**Current Phase**: Phase 1 - D1 MCQ tables
**Status**: COMPLETED. Schema contract tests went red (no MCQ SQL), then `0002_create-mcqs.sql` was written and applied `--local` only. Final `mcqs` columns: `id`, `name`, `question`, `created_by_user_id`, `created_at`, `updated_at`. Re-confirmed 2026-08-31: 10 contract tests green; local migrations list has nothing pending; `PRAGMA table_info(mcqs)` matches the contract.
**Next Steps**: Phase 2 — MCQ service, test-first (red), then implement until green. Update this PRD when Phase 2 status changes.
