# Gbi Gubae API

REST API for the 6 Kilo Gibi Gubae registration system: admin authentication,
role-based permissions, and member (user) management.

**Stack:** Node.js 20+, Express 5, Prisma 7 (driver adapter `@prisma/adapter-pg`),
PostgreSQL on [Neon](https://neon.tech), deployed as a Vercel serverless function.

## Project layout

```
api/index.js            Vercel entry point (exports the Express app)
src/
  app.js                Express app: security headers, CORS, routes, error handling
  server.js             Local/long-running server (npm start / npm run dev)
  config/               env parsing, Prisma client (lazy singleton)
  controllers/          request handlers (admin, user, role)
  middleware/           auth (JWT cookie / Bearer), error + 404 handlers
  routes/               route definitions, mounted under /api
  validators/           Joi request schemas
  utils/                errors, password hashing, auth cookie helpers
prisma/
  schema.prisma         data model
  migrations/           SQL migrations (applied with `npm run db:migrate`)
scripts/seed.js         idempotent seed: default roles + first super admin
tests/
  unit/                 pure logic, no database
  integration/          HTTP tests against a real Postgres, in a throwaway schema
```

## Getting started

```bash
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, JWT_SECRET, SUPER_ADMINS
npm install
npx prisma generate         # also runs automatically on install / build
npm run db:migrate          # apply migrations to the database in DIRECT_URL
npm run db:seed             # create default roles + the first super admin
npm run dev                 # http://localhost:5500
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start with auto-reload (nodemon) |
| `npm start` | Start the server |
| `npm run build` | Generate the Prisma client |
| `npm run db:migrate` | Apply pending migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Seed roles and the initial super admin |
| `npm test` | Run all tests |
| `npm run test:unit` | Unit tests only (no database needed) |
| `npm run test:integration` | Integration tests (needs `TEST_DATABASE_URL`) |

Integration tests only run against `TEST_DATABASE_URL`, which must be a
**different database** from `DATABASE_URL` (they are skipped if it is unset).
Inside it, each run creates a uniquely named `test_*` schema, applies the
migrations, and drops it afterwards.

## Authentication & roles

- `POST /api/admin/login` with `{ studentid, adminpassword }` sets an httpOnly
  `jwt` cookie (10 days). A `Authorization: Bearer <token>` header also works.
- Sessions are revoked when the admin is deleted or their password changes.
- **Super admins** are admins whose `adminusername` is listed in `SUPER_ADMINS`.
  They manage admins, roles, and can see/edit everything.
- Other admins get permissions (copied from a role when created, editable per admin):

| Permission | Effect |
| --- | --- |
| `readUsers` | List/view all users |
| `registerUsers` | Create users; view/edit/delete the users they created |
| `editAnyUser` / `editSpecificUsers` | Edit any user / only users they created |
| `removeAnyUsers` / `removeSpecificUsers` | Delete any user / only users they created |

## API

All responses are JSON: `{ success: true, ... }` or `{ success: false, message }`.
Validation errors return `400`, auth `401`, permissions `403`, missing `404`,
duplicates (student ID, phone, email, role name) `409`.

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | public | Liveness + database check |
| POST | `/api/admin/login` | public (rate limited) | Log in |
| POST | `/api/auth/logout` | public | Clear the session cookie |
| GET | `/api/auth/current` | admin | Current admin and permissions |
| GET | `/api/user` | admin | List users (paginated, filterable) |
| POST | `/api/user` | `registerUsers` | Create a user |
| GET | `/api/user/analytics` | admin | Aggregates over the users the admin can see |
| GET / PUT / DELETE | `/api/user/:studentid` | per permissions | Read / update / delete a user |
| DELETE | `/api/user` | super admin | Delete all users |
| GET / POST | `/api/admin` | super admin | List / create admins |
| DELETE | `/api/admin` | super admin | Delete all non-super admins |
| GET / PUT / DELETE | `/api/admin/:studentid` | super admin | Read / update / delete an admin |
| GET / POST | `/api/role` | super admin | List / create roles |
| GET / PUT / DELETE | `/api/role/:id` | super admin | Read / update / delete a role |

`GET /api/user` query parameters: `page`, `limit` (max 100), `q` (search ID,
names, phone), `gender`, `batch`, `departmentname`, `sponsorshiptype`,
`participation`, `clergicalstatus`, `cafeteriaaccess`, `tookcourse`,
`sortBy`, `sortOrder` (`asc` | `desc`).

## Deploying to Vercel

1. Import the repository as a Vercel project (framework preset: **Other**).
2. Set environment variables: `DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon direct),
   `JWT_SECRET`, `SUPER_ADMINS`, `FRONTEND_URL`, and `NODE_ENV=production`.
3. Deploy. `vercel.json` routes every request to `api/index.js`; the build runs
   `prisma generate`.
4. Run migrations from your machine (or CI) against the same database:
   `npm run db:migrate` (and `npm run db:seed` once).
