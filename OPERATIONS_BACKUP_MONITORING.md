# Operations — Backup & Monitoring Requirements

Status: `[CONFIRMED]` — M12 documentation deliverable. Requirements only; no real credentials, no paid dependency, no provider lock-in.

## 1. Backup requirements

### 1.1 Database (Neon PostgreSQL)

- **What:** logical / physical backups of the production database (all schemas: `public` + `auth`).
- **Minimum frequency:** daily automated backup; retain at least 7 days rolling.
- **Critical changes:** before any destructive migration or bulk data operation, take an on-demand snapshot.
- **Encryption:** backups encrypted at rest (provider default) and in transit.
- **Access:** backup credentials are server-side only — never in code, never in `.env.local` committed to git, never exposed to the browser.
- **Restore test:** perform a restore drill at least once before pilot launch; document Recovery Point Objective (RPO) and Recovery Time Objective (RTO) as `[NEEDS DECISION]` until the Product Owner confirms pilot expectations.
- **Multi-tenant note:** a full-DB backup covers all institutions; restore procedures must preserve institution isolation (do not restore partial rows across tenants without validation).

### 1.2 Files / blob storage (when Storage is implemented)

- Storage: TBD (separate implementation). When chosen:
  - versioning or object lock for critical uploads (if supported);
  - independent backup or replication of the bucket/container;
  - `file_objects` metadata table backed up with the database (metadata ↔ blob consistency).
- Until then, `file_objects` is a registry only — no production blobs to back up.

### 1.3 Configuration & secrets

- `BETTER_AUTH_SECRET`, `DATABASE_URL`, optional `AUTH_MAIL_WEBHOOK_URL`, future `AI_*` keys: stored in environment / secret manager only.
- Rotation procedure: rotate on personnel change or suspected leak; never commit rotated values.
- Export of institution config / announcements / privacy notices: covered by DB backup.

### 1.4 Application

- Source of truth is git (meaningful commits only; no secrets in history).
- Deployment artifacts rebuildable from the repository — no manual hot-fixes that skip git.

## 2. Monitoring requirements

### 2.1 Availability

- Uptime check on public sign-in and a public page (e.g. `/public`) — alert on prolonged downtime.
- Health endpoint: `[NEEDS DECISION]` whether to expose `/api/health` (recommended for pilot: liveness only, no schema details).

### 2.2 Errors & logs

- Capture unhandled API 500s (`mapApiError` generic message to clients; full detail only in server logs).
- Log fields: timestamp, request id (if available), route, status, user id (if authenticated), institution id (if scoped) — **never** password hashes, reset tokens, webhook secrets, or full request bodies containing credentials.
- Retention: align with pilot policy `[NEEDS DECISION]` (suggested default: 30 days).

### 2.3 Security signals

- Alert on spikes of 401/403 (credential stuffing / probing).
- Alert on repeated 500s from import/export/file endpoints.
- Review `institution_config_audit`, import/export job audit, and placement appointment decisions periodically for separation-of-duties violations.
- Auth mail webhook failures (`AUTH_MAIL_WEBHOOK_URL`) — monitor delivery errors so password-reset / verify-email is not silently dropped.

### 2.4 Data integrity

- Daily check: `schema_migrations` matches expected migration list.
- Import jobs: alert on `failed` / stuck `approved` jobs not run.
- Export jobs: alert on failed jobs; ensure TPO cannot export restricted datasets (authorization failures should be logged as 403, not retried blindly).
- Announcement fan-out: alert on notification insert failures.

### 2.5 Performance (pilot-scale)

- Slow query / connection pool saturation on Neon.
- API latency for dashboard and list endpoints under concurrent demo users.
- No paid APM required for pilot `[ASSUMPTION]` — provider built-in logs + simple uptime check are enough until scale demands more.

## 3. Explicit non-goals for M12

- No multi-region failover design (architecture follow-up).
- No SIEM / enterprise SOC.
- No customer-managed encryption keys (provider-managed until `[NEEDS DECISION]`).
- No real SMTP provider contract (webhook/console fallback in place).

## 4. Owner

Product Owner confirms RPO/RTO, log retention, and health-endpoint exposure before pilot. Development agent implements only after approval.
