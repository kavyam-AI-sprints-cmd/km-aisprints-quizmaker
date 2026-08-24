Date created: 2026-08-24
Date last modified: 2026-08-24 (testing plan / TDD added)

# Register, Login, and Logout - Technical PRD

## Overview/Problem

Quiz Maker is a greenfield application for multiple teachers to collaborate on a shared test bank of multiple-choice questions. Before any question-bank work can exist, teachers need a way to become users of the system: they must be able to register an account, log in, and log out. Today the starter has no database, no user model, and no authentication UI, so there is no way for a second teacher to join or for anyone to identify themselves. This first phase solves only that identity gap so later sprints can attach MCQ features to a known user.

---

## Hypothesis

We believe that a simple hashed-password register / login / logout flow on Cloudflare D1 will let multiple teachers become independent users of Quiz Maker and reach a shared MCQ workspace stub, without the cost of sessions, tokens, or social login.

---

## Scope

### In Scope

- A `users` table on Cloudflare D1, created via a Wrangler migration
- First name, last name, username, email, and a hashed password per user
- Username and email as separate required fields (they may hold the same value)
- A user service in `src/lib/services/` with create, read, update, and delete
- HTTP POST endpoints for register, login, and logout
- Client-side SHA-256 hashing of the password before it is sent in the POST body
- Server-side storage of that hash only; never persist plaintext passwords
- Register and login pages that POST to those endpoints
- On successful register or login, navigate to a stub MCQ page
- A logout control on the stub page that POSTs to logout and returns the teacher to login
- D1 database creation, `wrangler.jsonc` binding `DB`, and `npm run cf-typegen`
- Vitest unit tests, written first in each phase (red) and passing before the phase is marked complete (green)

### Out of Scope

- Multiple-choice question CRUD, test-bank collaboration, or any MCQ UI beyond a stub
- Social login (Google, Microsoft, GitHub, etc.)
- Tokens (JWT, opaque API tokens, CSRF tokens)
- Session management of any kind: cookies, `Set-Cookie`, server sessions, Durable Object sessions
- Auth middleware / route guards that block `/mcqs` for anonymous visitors
- Password reset, email verification, remember-me, account lockout
- Roles, permissions, or admin vs teacher distinction
- Profile-edit UI (the service still exposes update/delete for later sprints)

### Cut

- **bcrypt / Argon2 / salted password hashing** - Adds a dependency and is more than this phase's "basic authentication" bar. SHA-256 via Web Crypto needs no new package. Revisit before any real production traffic.
- **HTTPS-only plaintext POST with server-side hashing** - Rejected because the product owner asked to hash on the client and send the digest over the wire.
- **Cookies or localStorage as a logged-in flag** - Explicitly out; this phase does not persist identity after navigation.
- **Server Actions instead of HTTP endpoints** - The Next.js project convention prefers Server Actions, but this feature is specified as HTTP POST so a later client (or test) can call the same contract.
- **Zod** - Validation is required, but Zod is not installed. Implement this phase with small hand-written validators in `src/lib/` so we do not add a dependency unless the implementer confirms it with the user first.
- **`@cloudflare/vitest-pool-workers`** - Would run tests inside the Workers runtime against real local D1. That is a different suite config and is not needed for this sprint. Unit tests mock D1 / `getCloudflareContext()`. Raise it with the user before introducing it.

---

## Technical Requirements

### Database Schema

Cloudflare D1 (SQLite). Database name: `km-quizmaker-db`. Binding name: `DB`.

The database does not exist yet. Implementation must:

1. `npx wrangler d1 create km-quizmaker-db`
2. Paste the returned `d1_databases` block into `wrangler.jsonc` with binding `DB`
3. `npm run cf-typegen`
4. `npx wrangler d1 migrations create km-quizmaker-db create-users`
5. Apply **locally only**: `npx wrangler d1 migrations apply km-quizmaker-db --local`
6. Never apply migrations with `--remote`

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);
```

`UNIQUE` on `username` and `email` already creates indexes in SQLite; the named indexes above are still useful for explicit query plans and for documentation. If the generated migration already has UNIQUE constraints, do not duplicate indexes that SQLite would create automatically — one unique constraint per column is enough.

Column notes:

| Column | Type | Rules |
|--------|------|--------|
| `id` | TEXT PK | Random 32-char hex, not an integer autoincrement |
| `first_name` | TEXT | Required, trimmed, 1–100 chars |
| `last_name` | TEXT | Required, trimmed, 1–100 chars |
| `username` | TEXT UNIQUE | Required, trimmed, 3–50 chars, case-sensitive |
| `email` | TEXT UNIQUE | Required, trimmed, stored lowercase, valid email shape |
| `password_hash` | TEXT | SHA-256 hex digest (64 lowercase hex chars). Never plaintext |
| `created_at` | DATETIME | Set on insert |
| `updated_at` | DATETIME | Set on insert and on every update |

Username and email are independent. A teacher may register with username `jdoe` and email `jdoe@school.edu`, or use the same string for both if they want.

### API Endpoints

All auth routes are Next.js App Router handlers under `src/app/api/`. JSON in, JSON out. No cookies. Register and login call the user service; logout does not touch D1 in this phase.

Password contract for register and login: the JSON field `password` is the **SHA-256 hex digest** of the teacher's typed password, produced on the client with Web Crypto **before** `fetch`. The server must reject a body whose `password` is not a 64-character lowercase hex string. The server never hashes a plaintext password; it stores and compares the digest it received.

#### POST /api/auth/register

Creates a user, then the client navigates to `/mcqs`.

**Request Body:**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "username": "jdoe",
  "email": "jdoe@school.edu",
  "password": "64-char-sha256-hex-digest"
}
```

**Response:**

- Success (201):

```json
{
  "user": {
    "id": "a1b2c3...",
    "firstName": "Jane",
    "lastName": "Doe",
    "username": "jdoe",
    "email": "jdoe@school.edu"
  }
}
```

Never return `password` or `password_hash`.

- Error (400): validation failure (`{ "error": "..." }`)
- Error (409): username or email already exists (`{ "error": "Username already taken" }` or `{ "error": "Email already registered" }`)
- Error (500): unexpected server / D1 failure (`{ "error": "Unable to register" }`)

#### POST /api/auth/login

Looks up the user by username, compares the submitted digest to `password_hash` with a constant-time check, then the client navigates to `/mcqs`.

**Request Body:**

```json
{
  "username": "jdoe",
  "password": "64-char-sha256-hex-digest"
}
```

Login is by **username**, not email. If a teacher used the same value for both, they still type it in the username field.

**Response:**

- Success (200): same `user` object shape as register (no password fields)
- Error (400): missing/invalid fields
- Error (401): unknown username or digest mismatch. Use one generic message: `{ "error": "Invalid username or password" }` so callers cannot probe which usernames exist
- Error (500): unexpected server / D1 failure

#### POST /api/auth/logout

No session exists to destroy. This endpoint exists so the UI has a real POST to call and so a later sprint can add session cleanup without changing the client contract.

**Request Body:** none (empty JSON object is acceptable)

**Response:**

- Success (200): `{ "ok": true }`
- The handler does not read D1 and does not set cookies

After a 200, the client navigates to `/login`.

### User Interface Requirements

Use existing shadcn/ui pieces (`button`, `card`, `field`, `input`, `label`) from `@/components/ui`. Do not add `react-hook-form`. Forms are client components because they must hash with `crypto.subtle` in the browser, then `fetch` POST.

#### Login (/login)

- Card with heading "Log in to Quiz Maker"
- Fields: username, password (password input, `type="password"`)
- Client validation: both required; password min length 8 **before** hashing
- On submit: SHA-256 hash the typed password, POST `/api/auth/login`, on 200 navigate to `/mcqs`
- Show API and validation errors with `FieldError`
- Link to `/register` for teachers without an account

#### Register (/register)

- Card with heading "Create an account"
- Fields: first name, last name, username, email, password, confirm password
- Client validation:
  - All fields required
  - Email matches a simple email pattern
  - Username 3–50 characters
  - Password min length 8
  - Confirm password matches password **before** hashing
- On submit: hash the typed password, POST `/api/auth/register`, on 201 navigate to `/mcqs`
- Show duplicate username/email (409) as a field-level or form-level error
- Link to `/login`

#### MCQ stub (/mcqs)

- Placeholder page only: title such as "Question bank" and a short line that the MCQ test bank will be built in a later sprint
- A Logout button that POST `/api/auth/logout` then navigates to `/login`
- No question forms, no lists, no API calls other than logout
- No auth gate: visiting `/mcqs` directly is allowed in this phase because there is no session

#### Home (/)

- Replace the starter landing with a redirect to `/login` (or a one-line welcome with links to Log in and Register). Do not leave the unmodified AISprints starter page as the entry point.

#### Shared UI behavior

- Disable the submit button while the request is in flight
- Never log the typed password or the digest to the console
- Do not store the digest or user object in cookies or localStorage

---

## Testing Strategy

This feature is built **test-first** with **Vitest**. The user approved Vitest as the unit-testing framework. Follow `.cursor/skills/testing/SKILL.md`.

### Red → green per phase

Do not write production code for a phase until that phase's tests exist and have been run once as **red**. Then implement until those tests are **green**. A phase is complete only when:

1. That phase's Vitest files pass in isolation (`npm run test -- path/to/file.test.ts`)
2. The full suite still passes (`npm run test`)
3. The phase's acceptance criteria below are true

Never write a test whose assertion cannot fail (`expect(true).toBe(true)`). Assert observable results (returned objects, HTTP status and JSON, what the user can see). Cover failure paths, not only the happy path. Name tests so a failure message explains what broke.

### One-time harness (before Phase 1 tests)

Vitest is not in the starter. Install it once, then write Phase 1 tests:

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event jsdom vite-tsconfig-paths
```

`@testing-library/user-event` is required for Phase 4 form tests; install it with the harness so later phases do not add packages ad hoc.

Add `vitest.config.ts` at the repo root (from the testing skill: `@vitejs/plugin-react`, `vite-tsconfig-paths` so `@/` resolves, `environment: "jsdom"`, `globals: true`).

Scripts in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Colocate tests with the subject: `user-service.ts` → `user-service.test.ts`. Reset mocks in `beforeEach` with `vi.clearAllMocks()`. Each test must pass alone. Never hit a real network, real D1, or real model provider from a unit test.

`getCloudflareContext()` does not work under jsdom. Mock `@opennextjs/cloudflare` (or the `src/lib/db.ts` wrapper) and supply a fake `env.DB`. Keep D1 behind `src/lib/` so tests mock that module rather than rebuilding the full prepared-statement chain unless an in-memory fake is simpler for that file.

Server Components cannot be rendered by Testing Library. Phase 4 extracts client forms and tests those.

### What tests do not replace

Vitest does not prove local D1 migrations or Workers runtime behavior. After Phase 1, still apply migrations with `--local` and, before calling the whole feature done, verify register/login with `npm run preview` (or an equivalent D1-backed path). Those checks sit beside the suite, not inside it.

---

## Implementation Phases

### Phase 1: D1 and users table - COMPLETED

**Objective**: Quiz Maker has a local D1 database and a `users` table.

**Tasks**:

1. Install the Vitest harness (see Testing Strategy) if it is not already present
2. **Write failing tests** listed in this phase's Testing Plan; run them and confirm red
3. Create `km-quizmaker-db` with Wrangler and bind it as `DB` in `wrangler.jsonc`
4. Run `npm run cf-typegen`
5. Create the `create-users` migration with the schema above
6. Apply the migration locally only
7. Re-run the phase tests and confirm green
8. Add any new env placeholders to `.dev.vars.example` if a new variable is introduced (D1 binding itself is not a secret)

**Deliverables**:

- `vitest.config.ts`, `npm run test` / `npm run test:watch`
- `src/lib/d1-users-setup.test.ts` (green)
- `wrangler.jsonc` contains a `d1_databases` binding named `DB`
- A migration file under `migrations/`
- `cloudflare-env.d.ts` regenerated (do not hand-edit)

#### Testing Plan — Phase 1

Unit tests cannot create a Cloudflare D1 account or apply Wrangler migrations. They lock the **committed contract**: binding name and `users` DDL. Manual/Wrangler steps still run after the tests go green.

**Write first (red):** `src/lib/d1-users-setup.test.ts`

Read `wrangler.jsonc` and every `migrations/*.sql` file from disk (repo artifacts, not a live database).

| Test name (intent) | Asserts |
|---|---|
| `wrangler.jsonc binds D1 as DB` | Config contains a `d1_databases` entry whose `binding` is `DB` |
| `migration creates a users table` | SQL includes `CREATE TABLE` `users` |
| `users has required identity columns` | Table definition includes `id`, `first_name`, `last_name`, `username`, `email`, `password_hash` |
| `id is a text primary key` | `id` is `TEXT` and `PRIMARY KEY` (not an integer autoincrement) |
| `username is unique` | `username` is constrained `UNIQUE` |
| `email is unique` | `email` is constrained `UNIQUE` |
| `password is stored only as a hash column` | `password_hash` is present; there is no column named `password` |

**Red:** no `migrations/` SQL and no `DB` binding → file-not-found or failed assertions.

**Green:** binding and migration match the schema in this PRD. Confirmed 2026-08-24: 7 failed, then 7 passed after D1 bind + `0001_create-users.sql`.

**Phase 1 is not done on green tests alone.** Also: `npx wrangler d1 migrations apply km-quizmaker-db --local` succeeds. Do not treat `npm run dev` as proof. Local apply succeeded 2026-08-24 (`PRAGMA table_info(users)` shows the eight columns). Remote migrations were not applied.

### Phase 2: User service - COMPLETED

**Objective**: All user persistence goes through one service; route handlers do not call `env.DB` directly.

**Tasks**:

1. **Write failing tests** listed in this phase's Testing Plan; run them and confirm red
2. Add `src/lib/db.ts` (or equivalent) that obtains D1 via `getCloudflareContext()` from `@opennextjs/cloudflare`
3. Add `src/lib/services/user-service.ts` with create, getById, getByUsername, update, delete
4. Use prepared statements and numbered placeholders (`?1`, `?2`)
5. Map D1 rows to a TypeScript `User` type that omits `password_hash` except inside the service for login comparison
6. Export a constant-time `hashesEqual` (or equivalent) used by login in Phase 3
7. Re-run the phase tests and confirm green

**Deliverables**:

- `src/lib/services/user-service.ts`
- `src/lib/services/user-service.test.ts` (green)
- `src/lib/db.ts` if needed to obtain the binding once

#### Testing Plan — Phase 2

Mock `getCloudflareContext` / `getDb`. Do not call real D1. Prefer an in-memory store behind a fake `prepare`/`bind`/`run`/`all` so assertions are about **user records**, not SQL string trivia. Reset store and mocks in `beforeEach`.

**Write first (red):** `src/lib/services/user-service.test.ts`

Use a 64-char lowercase hex string as `passwordHash` in fixtures (for example 64 `a`s).

| Test name (intent) | Asserts |
|---|---|
| `createUser returns a public user without passwordHash` | Result has `id`, names, `username`, `email`; `passwordHash` is not on the object |
| `createUser stores the hash internally` | A later `getUserByUsername` returns the same `passwordHash` that was inserted |
| `createUser stores email in lowercase` | Input `Jane@School.edu` → `email` is `jane@school.edu` |
| `createUser rejects a duplicate username` | Second create with the same username fails with a conflict the register handler can map to 409 (typed error or thrown code — pick one and test that shape) |
| `createUser rejects a duplicate email` | Same for email, even when username differs |
| `createUser allows username equal to email` | Both fields may be `jdoe@school.edu` |
| `getUserById returns the user` | Round-trip after create |
| `getUserById returns null when missing` | Unknown id |
| `getUserByUsername includes passwordHash` | Login needs the digest; this is the only public read that may include it |
| `getUserByUsername returns null when missing` | Unknown username |
| `updateUser changes allowed fields` | Patch last name (and/or email); returned `PublicUser` reflects it; hash not in the return |
| `updateUser returns null when missing` | Unknown id |
| `deleteUser returns true when a row is removed` | Subsequent getById is null |
| `deleteUser returns false when missing` | Unknown id |
| `hashesEqual is true for identical digests` | Same 64-hex string |
| `hashesEqual is false for different digests` | Same length, different content (covers the comparison login will use) |

**Red:** `user-service.ts` missing or functions unimplemented → import/runtime failures or failed assertions.

**Green:** all rows above pass with the fake DB only. Confirmed 2026-08-24: 16 user-service tests plus 7 Phase 1 tests, 23 passed.

### Phase 3: Auth HTTP endpoints - COMPLETED

**Objective**: Register, login, and logout are callable over HTTP.

**Tasks**:

1. **Write failing tests** listed in this phase's Testing Plan; run them and confirm red
2. Shared request validation helpers in `src/lib/auth-validation.ts` (no Zod unless the user agrees)
3. `src/app/api/auth/register/route.ts` — POST, validate, `createUser`, 201
4. `src/app/api/auth/login/route.ts` — POST, `getByUsername`, `hashesEqual`, 200 or 401
5. `src/app/api/auth/logout/route.ts` — POST, 200 `{ ok: true }`
6. Never return password fields; never set cookies
7. Re-run the phase tests and confirm green

**Deliverables**:

- Three route handlers
- `src/lib/auth-validation.ts`
- Matching `*.test.ts` files (green)

#### Testing Plan — Phase 3

Call the exported `POST` handlers with `Request` objects. Mock `@/lib/services/user-service` so handlers are tested in isolation (no D1). Validation tests are pure and do not mock.

**Write first (red):**

- `src/lib/auth-validation.test.ts`
- `src/app/api/auth/register/route.test.ts`
- `src/app/api/auth/login/route.test.ts`
- `src/app/api/auth/logout/route.test.ts`

**Validation**

| Test name (intent) | Asserts |
|---|---|
| `register accepts a complete valid body` | No error; email normalized if the helper does that |
| `register rejects missing fields` | 400-class validation result for each required field |
| `register rejects an invalid email` | Not an email shape |
| `register rejects a password that is not 64 lowercase hex` | Plaintext `"secret123"`, uppercase hex, wrong length |
| `login accepts username plus 64-hex password` | Valid |
| `login rejects missing username or password` | Invalid |
| `login rejects a non-hex password` | Same digest rule as register |

**POST /api/auth/register**

| Test name (intent) | Asserts |
|---|---|
| `returns 201 and a public user` | Status 201; body.user has id/names/username/email; no `password` or `passwordHash` |
| `does not set cookies` | No `Set-Cookie` on the response |
| `returns 400 on invalid JSON or invalid body` | Validation failure path |
| `returns 409 when username is taken` | Service throws/returns the conflict shape from Phase 2 |
| `returns 409 when email is taken` | Same for email |
| `returns 500 when the service throws unexpectedly` | Generic `{ error: "Unable to register" }` (or the PRD message) |

**POST /api/auth/login**

| Test name (intent) | Asserts |
|---|---|
| `returns 200 and a public user on digest match` | No password fields |
| `does not set cookies` | No `Set-Cookie` |
| `returns 401 for unknown username` | `{ error: "Invalid username or password" }` — same message as wrong password |
| `returns 401 for wrong digest` | Identical error message (no username oracle) |
| `returns 400 on invalid body` | Missing/invalid fields |
| `returns 500 on unexpected service failure` | Generic error |

**POST /api/auth/logout**

| Test name (intent) | Asserts |
|---|---|
| `returns 200 { ok: true }` | Body and status |
| `does not call the user service` | Mock unused |
| `does not set cookies` | No `Set-Cookie` |

**Red:** missing routes/validators → import failures or failed status/body assertions.

**Green:** all handler and validation tests pass against mocks. Confirmed 2026-08-24: 22 Phase 3 tests plus prior phases, 45 passed.

### Phase 4: Auth UI and MCQ stub - PLANNED

**Objective**: A teacher can register or log in from the browser and land on the MCQ stub; they can log out back to login.

**Tasks**:

1. **Write failing tests** listed in this phase's Testing Plan; run them and confirm red
2. Shared `hashPassword(plain: string): Promise<string>` using `crypto.subtle` (Web Crypto), UTF-8 bytes, SHA-256, lowercase hex
3. Client forms under `src/components/auth/` (pages stay thin; Testing Library cannot render Server Components)
4. `/login` and `/register` pages
5. `/mcqs` stub with logout
6. `/` redirects (or links) into the auth flow
7. Wire forms to the POST endpoints; mock `fetch` in tests, not in production
8. Re-run the phase tests and confirm green

**Deliverables**:

- `src/lib/hash-password.ts` (safe to import from client components; no D1, no Node APIs)
- `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/mcqs/page.tsx`
- Auth form components under `src/components/auth/`
- Matching `*.test.ts` / `*.test.tsx` files (green)

#### Testing Plan — Phase 4

Query by role and accessible name. Use `userEvent` from `@testing-library/user-event`. Mock `fetch` and Next.js navigation (`next/navigation`). Do not assert on CSS class names or test IDs.

**Write first (red):**

- `src/lib/hash-password.test.ts`
- `src/components/auth/login-form.test.tsx`
- `src/components/auth/register-form.test.tsx`
- `src/components/auth/mcq-stub.test.tsx` (or the client component that owns Logout)

**hashPassword**

| Test name (intent) | Asserts |
|---|---|
| `returns 64 lowercase hex characters` | `/^[0-9a-f]{64}$/` |
| `hashes UTF-8 SHA-256 for a known input` | SHA-256 of `"password"` is `5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8` |
| `different passwords produce different digests` | `"password"` vs `"password1"` |
| `does not return the plaintext` | Result !== input |

**Login form**

| Test name (intent) | Asserts |
|---|---|
| `renders username and password fields and a submit control` | Accessible names |
| `password input is masked` | `type="password"` |
| `does not submit when username is empty` | `fetch` not called |
| `does not submit when password is shorter than 8 characters` | `fetch` not called |
| `hashes then POSTs to /api/auth/login` | Body `password` is the SHA-256 hex of the typed value, not plaintext; `username` is sent |
| `navigates to /mcqs on 200` | `router.push` / `replace` to `/mcqs` |
| `shows an error on 401 and does not navigate` | Error text visible; no navigation |

**Register form**

| Test name (intent) | Asserts |
|---|---|
| `renders first name, last name, username, email, password, confirm password` | Accessible names |
| `does not submit when required fields are empty` | `fetch` not called |
| `does not submit when email is invalid` | `fetch` not called |
| `does not submit when username is too short` | `fetch` not called |
| `does not submit when passwords do not match` | `fetch` not called |
| `does not submit when password is shorter than 8 characters` | `fetch` not called |
| `hashes then POSTs to /api/auth/register` | Digest in JSON; plaintext absent from the body |
| `navigates to /mcqs on 201` | Navigation |
| `shows a conflict error on 409` | Visible error; no navigation |

**MCQ stub / logout**

| Test name (intent) | Asserts |
|---|---|
| `shows question-bank stub copy` | Heading or text that this is a later sprint |
| `logout POSTs /api/auth/logout then goes to /login` | `fetch` then navigation |
| `does not render an MCQ editor` | No question prompt / choices form |

**Red:** missing modules/components → import failures or missing roles.

**Green:** hash + form + logout tests pass. Then walk register → `/mcqs` → logout → login in the browser (and `npm run preview` for D1) before marking the feature done.

**Status Markers**:

- COMPLETED - Phase is done
- IN PROGRESS - Currently working on this
- PLANNED - Not started yet

---

## Technical Implementation Details

### Key Files

| Path | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest + jsdom + `@/` via `vite-tsconfig-paths` |
| `wrangler.jsonc` | Add D1 binding `DB` |
| `migrations/0001_create-users.sql` | `users` table (exact filename comes from Wrangler) |
| `src/lib/d1-users-setup.test.ts` | Phase 1 contract tests for binding + migration SQL |
| `src/lib/db.ts` | Resolve `env.DB` via `getCloudflareContext()` |
| `src/lib/services/user-service.ts` | Create / read / update / delete users |
| `src/lib/services/user-service.test.ts` | Phase 2 service tests (mocked D1) |
| `src/lib/hash-password.ts` | SHA-256 hex for the browser (and reusable in tests) |
| `src/lib/hash-password.test.ts` | Phase 4 hash tests |
| `src/lib/auth-validation.ts` | Request-body checks for register and login |
| `src/lib/auth-validation.test.ts` | Phase 3 validation tests |
| `src/app/api/auth/register/route.ts` | POST register |
| `src/app/api/auth/register/route.test.ts` | Phase 3 register handler tests |
| `src/app/api/auth/login/route.ts` | POST login |
| `src/app/api/auth/login/route.test.ts` | Phase 3 login handler tests |
| `src/app/api/auth/logout/route.ts` | POST logout |
| `src/app/api/auth/logout/route.test.ts` | Phase 3 logout handler tests |
| `src/components/auth/*` | Client login, register, and MCQ-stub/logout UI |
| `src/components/auth/*.test.tsx` | Phase 4 UI tests |
| `src/app/login/page.tsx` | Login UI |
| `src/app/register/page.tsx` | Register UI |
| `src/app/mcqs/page.tsx` | MCQ stub + logout |
| `src/app/page.tsx` | Entry: redirect or links to login/register |
| `.dev.vars.example` | Keep in sync if any new local var is added |

### Implementation Patterns

**Obtain D1 only on the server:**

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
  const { env } = await getCloudflareContext();
  return env.DB;
}
```

Never import this module from a `'use client'` file.

**User service (shape):**

```typescript
export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
};

export type NewUser = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
};

export type UserUpdate = Partial<
  Pick<NewUser, "firstName" | "lastName" | "username" | "email" | "passwordHash">
>;

// createUser(input: NewUser): Promise<PublicUser>
// getUserById(id: string): Promise<PublicUser | null>
// getUserByUsername(username: string): Promise<(PublicUser & { passwordHash: string }) | null>
// updateUser(id: string, patch: UserUpdate): Promise<PublicUser | null>
// deleteUser(id: string): Promise<boolean>
// hashesEqual(a: string, b: string): boolean  // exported; used by login; covered in Phase 2 tests
```

`getUserByUsername` may return `passwordHash` **only** so login can compare. Route handlers still strip it before JSON. Update and delete are unused by this phase's UI but must exist on the service.

**Prepared statements (numbered placeholders):**

```typescript
await db
  .prepare(
    "INSERT INTO users (first_name, last_name, username, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)"
  )
  .bind(firstName, lastName, username, email, passwordHash)
  .run();
```

Read with `.all()` and take `results[0]`. Do not rely on `.first()`.

**Client password hash (Web Crypto, no extra package):**

```typescript
export async function hashPassword(plain: string): Promise<string> {
  const bytes = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

**Constant-time compare** on the server so digest length/timing does not leak:

```typescript
function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
```

**Register / login handlers** parse JSON, validate, call the user service, return JSON. They do not hash. If a client sends plaintext, validation fails (not 64 hex chars).

### Important Notes

- This is a teaching repository: **ask before adding a dependency**, except the Vitest harness listed in Testing Strategy, which the user already approved. Prefer Web Crypto over bcrypt/argon2 for this phase. Prefer hand-rolled validation over Zod unless the user agrees.
- `npm run dev` runs on Node and will not prove D1. Verify D1-backed register/login with `npm run preview` (Workers runtime) after local migrations are applied.
- Cloud agents have no Cloudflare credentials: `wrangler d1 create` and `wrangler d1 migrations apply` must be run in an environment that is already logged in. If creation cannot run, stop and say so; do not fake a database id in `wrangler.jsonc`.
- Never apply migrations remotely. Never run `npm run deploy` unless asked.
- Do not edit `cloudflare-env.d.ts` or `package-lock.json` by hand.
- Client-side hashing means the API **cannot** enforce password complexity on the server; min length lives on the form, before `hashPassword`.
- SHA-256 without a salt is not a password-hashing function. Stolen `password_hash` rows can be brute-forced offline. Acceptable for this phase; called out under Risks.
- Because there are no sessions, "logged in" is only "the last POST succeeded and we navigated to `/mcqs`". Refreshing `/mcqs` does not restore a user. That is intentional.
- Logout is a contract stub: the button must still POST so the next sprint can attach real session clearing later.
- Email is stored lowercase so `Jane@School.edu` and `jane@school.edu` collide on the unique index.
- Duplicate username/email: catch D1 unique-constraint failures and map them to 409 rather than 500.

---

## Acceptance Criteria

- [x] Vitest is installed; `npm run test` and `npm run test:watch` exist
- [ ] Each implementation phase wrote its tests first (red), then implementation (green); a phase was not marked COMPLETED while its tests failed
- [x] `npm run test` is green for the full suite
- [x] A local D1 database exists, is bound as `DB`, and the `users` migration applies with `--local`
- [ ] A teacher can register with first name, last name, username, email, and password
- [ ] The password is hashed in the browser with SHA-256 before the register POST; D1 stores only `password_hash`
- [ ] Username and email may be the same string; both columns are still required and unique
- [x] Duplicate username returns 409; duplicate email returns 409
- [ ] After a successful register, the browser is on `/mcqs`
- [ ] A teacher can log in with username + password; the password is hashed in the browser before the login POST
- [ ] Wrong password or unknown username returns 401 with a generic error; `/mcqs` is not shown
- [ ] After a successful login, the browser is on `/mcqs`
- [ ] `/mcqs` is a stub only (no MCQ features) and includes Logout
- [ ] Logout POSTs `/api/auth/logout` and then shows `/login`
- [x] API success payloads never include `password` or `password_hash`
- [x] User service exposes create, get, update, and delete even though the UI only uses create and get-by-username
- [x] No cookies, tokens, or session records are created
- [ ] `npm run lint`, `npm run test`, and `npm run build` succeed after implementation
- [ ] Register and login are verified against the Workers runtime (`npm run preview`) or an equivalent D1-backed path, not inspection alone

---

## Success Metrics

These are post-implementation checks for this teaching sprint, not production analytics.

| Metric | Target | How Measured |
|--------|--------|--------------|
| Second teacher can join | Two distinct users exist in local D1 after two registers | Query `SELECT username FROM users` locally |
| Happy-path time | Register or login to `/mcqs` in one submit | Manual walkthrough in the browser |
| Password not stored in plaintext | No `users.password_hash` value equals the typed password | Inspect a local row after register |
| No session artifacts | Response `Set-Cookie` headers absent on register/login/logout | Network tab or `curl -v` |

---

## Dependencies

### External Dependencies

- **Cloudflare D1** - User persistence. Must be created and bound; not in the starter today
- **Wrangler** - Already a devDependency; used for D1 create, migrations, types
- **Web Crypto (`crypto.subtle`)** - Browser and Workers SHA-256; no npm package

### Internal Dependencies

- **shadcn/ui** - `button`, `card`, `field`, `input`, `label` already in `src/components/ui/`
- **`getCloudflareContext()`** - `@opennextjs/cloudflare`, already in the project
- **User service** - To be created; the only module allowed to talk to `env.DB` for users
- **Vitest** - To be installed as the unit-test runner (see Testing Strategy). Not in the starter yet.

### Environment

- No new secrets are required for this phase (no third-party auth, no JWT signing key)
- If a variable is added later, put the real value in `.dev.vars` (gitignored) and an empty placeholder in `.dev.vars.example`

### Approved npm packages (this sprint)

- **vitest**, **@vitejs/plugin-react**, **@testing-library/react**, **@testing-library/user-event**, **jsdom**, **vite-tsconfig-paths** — unit testing harness. Approved by the product owner. Install as devDependencies only.

### Proposed npm packages (still ask first)

- **Zod** — would validate register/login bodies to match the Next.js workspace rule. Not approved yet.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: SHA-256 digests in the POST body are reusable (pass-the-hash). Anyone who intercepts the JSON can replay login.
- **Mitigation**: Accept for this phase. Deployed Workers traffic is HTTPS. Do not log request bodies. A later phase should use a slow salted hash on the server and a real session.

- **Risk**: D1 is unbound or migrations were not applied locally, so every register fails at runtime.
- **Mitigation**: Phase 1 is a hard prerequisite. Verify with `npx wrangler d1 migrations list km-quizmaker-db` and `npm run preview`, not only `npm run dev`.

- **Risk**: Hash mismatch if one side hex-encodes differently (uppercase vs lowercase, extra whitespace).
- **Mitigation**: Specify UTF-8 → SHA-256 → lowercase hex in one shared helper. Server validates `^[0-9a-f]{64}$`.

- **Risk**: Unique constraint errors surface as 500s.
- **Mitigation**: Catch D1 constraint failures in the service or register handler and return 409 with a clear field message.

- **Risk**: Cloud / CI environment cannot run `wrangler d1 create` (no credentials).
- **Mitigation**: Stop and report that D1 setup must be run locally. Do not invent a database id.

### User Experience Risks

- **Risk**: Teachers expect `/mcqs` to stay "logged in" after refresh and it will not.
- **Mitigation**: Stub copy can say the question bank is coming next; do not imply a persistent session. Document in this PRD so the next sprint adds sessions deliberately.

- **Risk**: Teachers try to log in with email in the username field.
- **Mitigation**: Label the field "Username". Help text: use the username chosen at registration (email works only if they set username to the same value).

- **Risk**: Confirm-password typos on register.
- **Mitigation**: Require match on the client before hashing and POSTing.

---

## Troubleshooting Guide

Add entries here when bugs are found during implementation. Anticipated issues:

### D1 binding missing on preview

**Problem**: Register/login throw or return 500; logs mention `DB` or `D1`.
**Cause**: `wrangler.jsonc` has no `d1_databases` binding, or `cf-typegen` was not run.
**Solution**: Complete Phase 1; confirm `env.DB` exists in generated types; restart preview.
**Code Reference**: `wrangler.jsonc` (binding `DB`)

### Local schema empty

**Problem**: Inserts fail with "no such table: users".
**Cause**: Migration not applied locally.
**Solution**: `npx wrangler d1 migrations apply km-quizmaker-db --local`
**Code Reference**: `migrations/`

### Login always 401 after a successful register

**Problem**: Same password fails login.
**Cause**: Register stored a different encoding than login sends (hash skipped on one side, or extra trim).
**Solution**: Both forms must call the same `hashPassword`. Do not hash on the server. Confirm the stored value is 64 hex chars.
**Code Reference**: `src/lib/hash-password.ts`

### Unique username treated as server error

**Problem**: Second register with the same username returns 500.
**Cause**: D1 error not mapped to 409.
**Solution**: Inspect the D1 error message/code in the register path and map unique failures to 409.
**Code Reference**: `src/app/api/auth/register/route.ts`

### `@/` imports fail in Vitest

**Problem**: Tests cannot resolve `@/lib/...`.
**Cause**: `vite-tsconfig-paths` missing from `vitest.config.ts`.
**Solution**: Follow the testing skill config; include `tsconfigPaths()` in `plugins`.
**Code Reference**: `vitest.config.ts`

---

## Notes for AI Agents

When working with this PRD:

1. Start by reading Overview and Hypothesis. The product is a multi-teacher quiz maker; this sprint is identity only.
2. Honor Scope. Do not build MCQs, cookies, JWTs, OAuth, or middleware that pretends to be a session.
3. Follow `.cursor/rules/d1.mdc`, `.cursor/rules/nextjs.mdc`, and `.cursor/skills/testing/SKILL.md`.
4. HTTP POST route handlers are required even though the Next.js rule prefers Server Actions.
5. **TDD is mandatory.** For each phase: write the tests in that phase's Testing Plan → run `npm run test` and confirm they fail → implement → run tests until green → only then mark the phase COMPLETED. Do not implement a phase's production code before its tests exist.
6. Do not start Phase N+1 while Phase N tests are red or Phase N is still PLANNED/IN PROGRESS without a green suite for that phase.
7. Ask before adding npm dependencies other than the approved Vitest harness.
8. Do not deploy. Do not apply D1 migrations remotely. Do not use `@cloudflare/vitest-pool-workers` unless the user agrees.
9. Update phase status markers as work progresses (IN PROGRESS while tests are red or code is landing; COMPLETED only when tests are green and phase criteria hold).
10. Add implementation details (real file names, line references) under Technical Implementation Details as code is written.
11. Mark acceptance criteria when they are verified, not when the file exists.
12. Append Troubleshooting entries when bugs are fixed.
13. After this feature exists, update `AGENTS.md` project blurb so it is no longer "unmodified starter" — but only once the work actually ships. Note Vitest in the stack when it is installed.
14. Verify with `npm run lint`, `npm run test`, and `npm run build`, and exercise register → `/mcqs` → logout → login in the browser (or `npm run preview` for D1).

---

## Current Status

**Last Updated**: 2026-08-24
**Current Phase**: Phase 3 complete; waiting for review before Phase 4
**Status**: Phase 3 COMPLETED
**Next Steps**: After review, Phase 4 — write failing hash/UI tests, then implement login/register forms, MCQ stub, and logout
