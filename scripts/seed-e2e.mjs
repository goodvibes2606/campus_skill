/**
 * Milestone 12 — E2E / two-institution seed (non-destructive).
 *
 * Creates:
 *  - Two demo institutions (North Campus Demo, South Campus Demo)
 *  - Minimal academic structure each (university → dept → program → year → semester → section → subject)
 *  - Demo auth users + profiles for: admin, director, hod, faculty, tpo, student
 *  - Active enrollments / HOD headship / section-subject links where applicable
 *
 * Rules:
 *  - No destructive SQL (no DELETE/TRUNCATE/UPDATE of existing rows beyond ON CONFLICT).
 *  - No real secrets — DEMO_PASSWORD only, clearly labeled for local/demo use.
 *  - Idempotent: safe to re-run.
 *  - Does NOT invent platform owner, does not touch institution config beyond defaults.
 *
 * Run: node --env-file=.env.local scripts/seed-e2e.mjs
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Pool } = pkg;

const DEMO_PASSWORD = "DemoPass!2026"; // local/demo only — never production
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL && process.env.DATABASE_URL.includes("sslmode")
      ? undefined
      : { rejectUnauthorized: false },
});

/**
 * Better Auth password hash (matches @better-auth/utils/password):
 * scrypt N=16384, r=16, p=1, dkLen=64; format: hex(salt):hex(key);
 * password is NFKC-normalized.
 */
async function hashPassword(password) {
  const { scryptAsync } = await import("@noble/hashes/scrypt.js");
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const saltHex = [...saltBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = await scryptAsync(password.normalize("NFKC"), saltHex, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2,
  });
  const keyHex = [...key].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${keyHex}`;
}

async function ensureRoles(client) {
  const roles = [
    ["student", "Default role"],
    ["faculty", "Teaching faculty"],
    ["admin", "Institution administrator"],
    ["hod", "Head of Department"],
    ["director_dean", "Director or Dean"],
    ["system_admin", "System administrator"],
    ["tpo", "Training and Placement Officer"],
    ["recruiter", "External recruiter"],
  ];
  for (const [name, desc] of roles) {
    await client.query(
      `INSERT INTO public.roles (name, description) VALUES ($1,$2)
       ON CONFLICT (name) DO NOTHING`,
      [name, desc]
    );
  }
}

async function getRoleId(client, name) {
  const r = await client.query(`SELECT id FROM public.roles WHERE name=$1`, [
    name,
  ]);
  return r.rows[0].id;
}

async function ensureAuthUser(client, { id, email, name, verified = true }) {
  const existing = await client.query(
    `SELECT id FROM auth."user" WHERE lower(email)=lower($1)`,
    [email]
  );
  let userId = existing.rows[0]?.id ?? null;
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  if (!userId) {
    userId = id;
    await client.query(
      `INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4, now(), now())`,
      [userId, name, email, verified]
    );
  }
  // Better Auth sign-in requires credential account.accountId === user.id.
  await client.query(
    `INSERT INTO auth."account"
       (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
     VALUES ($1,$2,'credential',$3,$4, now(), now())
     ON CONFLICT DO NOTHING`,
    [randomUUID(), userId, userId, passwordHash]
  );
  // Non-destructive repair for older seeds that stored email as accountId.
  await client.query(
    `UPDATE auth."account"
        SET "accountId" = "userId"::text, password = $2, "updatedAt" = now()
      WHERE "userId" = $1 AND "providerId" = 'credential'
        AND ("accountId" IS DISTINCT FROM "userId"::text OR password IS DISTINCT FROM $2)`,
    [userId, passwordHash]
  );
  return userId;
}

async function ensureProfile(client, { userId, email, name, roleId, institutionId }) {
  // profiles.id must equal auth.user.id (getAuthContext joins on session.user.id).
  const byId = await client.query(
    `SELECT id FROM public.profiles WHERE id = $1`,
    [userId]
  );
  const byEmail = await client.query(
    `SELECT id FROM public.profiles WHERE email = lower($1)`,
    [email]
  );
  let profileId;
  if (byId.rows[0]) {
    profileId = byId.rows[0].id;
  } else if (byEmail.rows[0]) {
    // Email unique: reuse existing row and re-key to auth user id if safe (no children).
    const existing = byEmail.rows[0].id;
    if (existing === userId) {
      profileId = existing;
    } else {
      const children = await client.query(
        `SELECT
           (SELECT count(*) FROM public.student_enrollments WHERE student_id = $1) +
           (SELECT count(*) FROM public.department_heads WHERE hod_id = $1) +
           (SELECT count(*) FROM public.notifications WHERE recipient_id = $1) AS n`,
        [existing]
      );
      if (Number(children.rows[0].n) === 0) {
        await client.query(
          `UPDATE public.profiles SET id = $1 WHERE id = $2`,
          [userId, existing]
        );
        profileId = userId;
      } else {
        // Non-destructive: keep existing profile id for FKs; caller must use return value.
        profileId = existing;
      }
    }
  } else {
    profileId = userId;
  }
  await client.query(
    `INSERT INTO public.profiles
       (id, email, full_name, role_id, institution_id, status)
     VALUES ($1, lower($2), $3, $4, $5, 'active')
     ON CONFLICT (id) DO UPDATE SET
       institution_id = COALESCE(public.profiles.institution_id, EXCLUDED.institution_id),
       role_id = EXCLUDED.role_id,
       full_name = EXCLUDED.full_name,
       status = CASE WHEN public.profiles.status = 'deactivated' THEN public.profiles.status ELSE 'active' END,
       updated_at = now()`,
    [profileId, email, name, roleId, institutionId]
  );
  return profileId;
}

async function ensureInstitution(client, { name, slug, city }) {
  const bySlug = await client.query(
    `SELECT id FROM public.institutions WHERE slug=$1`,
    [slug]
  );
  if (bySlug.rows[0]) return bySlug.rows[0].id;
  const id = randomUUID();
  await client.query(
    `INSERT INTO public.institutions (id, name, slug, address, status)
     VALUES ($1,$2,$3,$4,'active')`,
    [id, name, slug, city]
  );
  await client.query(
    `INSERT INTO public.institution_configs (institution_id, short_name, city, status, onboarding_status, onboarding_step)
     VALUES ($1,$2,$3,'active','ready',9)
     ON CONFLICT (institution_id) DO NOTHING`,
    [id, name.split(" ")[0], city]
  );
  return id;
}

async function ensureStructure(client, institutionId, codePrefix) {
  let uni = await client.query(
    `SELECT id FROM public.universities WHERE institution_id=$1 AND code=$2`,
    [institutionId, `${codePrefix}U`]
  );
  if (!uni.rows[0]) {
    await client.query(
      `INSERT INTO public.universities (institution_id, name, code, status)
       VALUES ($1,$2,$3,'active')`,
      [institutionId, `Demo University ${codePrefix}`, `${codePrefix}U`]
    );
    uni = await client.query(
      `SELECT id FROM public.universities WHERE institution_id=$1 AND code=$2`,
      [institutionId, `${codePrefix}U`]
    );
  }
  const universityId = uni.rows[0].id;

  let dept = await client.query(
    `SELECT id FROM public.departments WHERE institution_id=$1 AND code=$2`,
    [institutionId, `${codePrefix}CS`]
  );
  if (!dept.rows[0]) {
    await client.query(
      `INSERT INTO public.departments (university_id, institution_id, name, code, status)
       VALUES ($1,$2,'Computer Science',$3,'active')`,
      [universityId, institutionId, `${codePrefix}CS`]
    );
    dept = await client.query(
      `SELECT id FROM public.departments WHERE institution_id=$1 AND code=$2`,
      [institutionId, `${codePrefix}CS`]
    );
  }
  const departmentId = dept.rows[0].id;

  let prog = await client.query(
    `SELECT id FROM public.programs WHERE institution_id=$1 AND code=$2`,
    [institutionId, `${codePrefix}BTECH`]
  );
  if (!prog.rows[0]) {
    await client.query(
      `INSERT INTO public.programs (department_id, institution_id, name, code, duration_semesters, status)
       VALUES ($1,$2,'B.Tech CSE',$3,8,'active')`,
      [departmentId, institutionId, `${codePrefix}BTECH`]
    );
    prog = await client.query(
      `SELECT id FROM public.programs WHERE institution_id=$1 AND code=$2`,
      [institutionId, `${codePrefix}BTECH`]
    );
  }
  const programId = prog.rows[0].id;

  let year = await client.query(
    `SELECT id FROM public.academic_years WHERE program_id=$1 AND name='2026-27'`,
    [programId]
  );
  if (!year.rows[0]) {
    await client.query(
      `INSERT INTO public.academic_years (program_id, institution_id, name, starts_on, ends_on, status)
       VALUES ($1,$2,'2026-27','2026-08-01','2027-07-31','active')`,
      [programId, institutionId]
    );
    year = await client.query(
      `SELECT id FROM public.academic_years WHERE program_id=$1 AND name='2026-27'`,
      [programId]
    );
  }
  const academicYearId = year.rows[0].id;

  let sem = await client.query(
    `SELECT id FROM public.semesters WHERE academic_year_id=$1 AND semester_number=1`,
    [academicYearId]
  );
  if (!sem.rows[0]) {
    await client.query(
      `INSERT INTO public.semesters (academic_year_id, institution_id, semester_number, name, starts_on, ends_on, status)
       VALUES ($1,$2,1,'Semester 1','2026-08-01','2026-12-31','active')`,
      [academicYearId, institutionId]
    );
    sem = await client.query(
      `SELECT id FROM public.semesters WHERE academic_year_id=$1 AND semester_number=1`,
      [academicYearId]
    );
  }
  const semesterId = sem.rows[0].id;

  let sec = await client.query(
    `SELECT id FROM public.sections WHERE semester_id=$1 AND name='A'`,
    [semesterId]
  );
  if (!sec.rows[0]) {
    await client.query(
      `INSERT INTO public.sections (semester_id, institution_id, name, status)
       VALUES ($1,$2,'A','active')`,
      [semesterId, institutionId]
    );
    sec = await client.query(
      `SELECT id FROM public.sections WHERE semester_id=$1 AND name='A'`,
      [semesterId]
    );
  }
  const sectionId = sec.rows[0].id;

  let subj = await client.query(
    `SELECT id FROM public.subjects WHERE program_id=$1 AND subject_code=$2`,
    [programId, `${codePrefix}CS101`]
  );
  if (!subj.rows[0]) {
    await client.query(
      `INSERT INTO public.subjects (program_id, institution_id, name, subject_code, description, status)
       VALUES ($1,$2,'Programming Fundamentals',$3,'Demo subject','active')`,
      [programId, institutionId, `${codePrefix}CS101`]
    );
    subj = await client.query(
      `SELECT id FROM public.subjects WHERE program_id=$1 AND subject_code=$2`,
      [programId, `${codePrefix}CS101`]
    );
  }
  const subjectId = subj.rows[0].id;

  return {
    universityId,
    departmentId,
    programId,
    academicYearId,
    semesterId,
    sectionId,
    subjectId,
  };
}

async function seedInstitution(client, cfg) {
  const institutionId = await ensureInstitution(client, cfg);
  const s = await ensureStructure(client, institutionId, cfg.code);

  const people = [];
  const base = `${cfg.code.toLowerCase()}`;

  const defs = [
    {
      key: "admin",
      role: "admin",
      email: `${base}.admin@example.edu`,
      name: `${cfg.code} Admin`,
    },
    {
      key: "director",
      role: "director_dean",
      email: `${base}.director@example.edu`,
      name: `${cfg.code} Director`,
    },
    {
      key: "hod",
      role: "hod",
      email: `${base}.hod@example.edu`,
      name: `${cfg.code} HOD`,
    },
    {
      key: "faculty",
      role: "faculty",
      email: `${base}.faculty@example.edu`,
      name: `${cfg.code} Faculty`,
    },
    {
      key: "tpo",
      role: "tpo",
      email: `${base}.tpo@example.edu`,
      name: `${cfg.code} TPO`,
    },
    {
      key: "student",
      role: "student",
      email: `${base}.student@example.edu`,
      name: `${cfg.code} Student`,
    },
  ];

  for (const d of defs) {
    const suggestedId = randomUUID();
    const authUserId = await ensureAuthUser(client, {
      id: suggestedId,
      email: d.email,
      name: d.name,
    });
    const roleId = await getRoleId(client, d.role);
    const profileId = await ensureProfile(client, {
      userId: authUserId,
      email: d.email,
      name: d.name,
      roleId,
      institutionId,
    });
    people[d.key] = profileId;
  }

  // HOD headship (at most one active per department)
  const headExists = await client.query(
    `SELECT 1 FROM public.department_heads
      WHERE department_id=$1 AND valid_to IS NULL`,
    [s.departmentId]
  );
  if (!headExists.rows[0]) {
    await client.query(
      `INSERT INTO public.department_heads (department_id, hod_id, institution_id)
       VALUES ($1,$2,$3)`,
      [s.departmentId, people.hod, institutionId]
    );
  }

  // section_subjects with faculty
  const ss = await client.query(
    `SELECT id FROM public.section_subjects WHERE section_id=$1 AND subject_id=$2`,
    [s.sectionId, s.subjectId]
  );
  if (!ss.rows[0]) {
    await client.query(
      `INSERT INTO public.section_subjects (section_id, subject_id, institution_id, faculty_id, status)
       VALUES ($1,$2,$3,$4,'active')`,
      [s.sectionId, s.subjectId, institutionId, people.faculty]
    );
  }

  // student enrollment
  const enr = await client.query(
    `SELECT id FROM public.student_enrollments
      WHERE student_id=$1 AND status='active'`,
    [people.student]
  );
  if (!enr.rows[0]) {
    await client.query(
      `INSERT INTO public.student_enrollments
         (student_id, institution_id, program_id, academic_year_id, semester_id, section_id, status, enrolled_by)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7)`,
      [
        people.student,
        institutionId,
        s.programId,
        s.academicYearId,
        s.semesterId,
        s.sectionId,
        people.admin,
      ]
    );
  }

  // Active TPO responsibility (pending → director can approve; seed as pending for director flow)
  const tpoResp = await client.query(
    `SELECT id FROM public.placement_responsibilities
      WHERE institution_id=$1 AND person_id=$2 AND responsibility='tpo'
        AND status IN ('pending','active')`,
    [institutionId, people.tpo]
  );
  if (!tpoResp.rows[0]) {
    await client.query(
      `INSERT INTO public.placement_responsibilities
         (institution_id, person_id, responsibility, responsibility_title, scope_notes, requested_by, status)
       VALUES ($1,$2,'tpo','Teaching & Placement Officer', '', $3, 'pending')`,
      [institutionId, people.tpo, people.admin]
    );
  }

  return { institutionId, people, structure: s };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — run with --env-file=.env.local");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureRoles(client);

    const north = await seedInstitution(client, {
      name: "North Campus Demo",
      slug: "north-campus-demo",
      city: "North City",
      code: "NC",
    });
    const south = await seedInstitution(client, {
      name: "South Campus Demo",
      slug: "south-campus-demo",
      city: "South City",
      code: "SC",
    });

    await client.query("COMMIT");

    const summary = {
      institutions: [
        {
          name: "North Campus Demo",
          slug: "north-campus-demo",
          id: north.institutionId,
          users: Object.fromEntries(
            Object.entries(north.people).map(([k, v]) => [
              k,
              `${k}.${"north"}@example.edu`.replace(
                "north",
                "north"
              ),
            ])
          ),
        },
        {
          name: "South Campus Demo",
          slug: "south-campus-demo",
          id: south.institutionId,
        },
      ],
      demoAccounts: [
        "nc.admin@example.edu",
        "nc.director@example.edu",
        "nc.hod@example.edu",
        "nc.faculty@example.edu",
        "nc.tpo@example.edu",
        "nc.student@example.edu",
        "sc.admin@example.edu",
        "sc.director@example.edu",
        "sc.hod@example.edu",
        "sc.faculty@example.edu",
        "sc.tpo@example.edu",
        "sc.student@example.edu",
      ],
      password: DEMO_PASSWORD,
      passwordNote:
        "Demo-only password. If Better Auth hash format mismatches, use Forgot password on /sign-in to reset.",
      note: "Two-institution seed for isolation testing. Re-run is safe.",
    };

    // isolation check
    const nStudents = await client.query(
      `SELECT count(*)::int AS n FROM public.profiles
        WHERE institution_id=$1 AND role_id=(SELECT id FROM public.roles WHERE name='student')`,
      [north.institutionId]
    );
    const sStudents = await client.query(
      `SELECT count(*)::int AS n FROM public.profiles
        WHERE institution_id=$1 AND role_id=(SELECT id FROM public.roles WHERE name='student')`,
      [south.institutionId]
    );
    summary.isolationCheck = {
      northStudents: nStudents.rows[0].n,
      southStudents: sStudents.rows[0].n,
      crossContamination:
        nStudents.rows[0].n > 0 &&
        sStudents.rows[0].n > 0 &&
        north.institutionId !== south.institutionId
          ? "none (separate institution_ids)"
          : "verify",
    };

    console.log(JSON.stringify(summary, null, 2));
    console.log(
      `seed-e2e OK · sha256 probe ${createHash("sha256").update(DEMO_PASSWORD).digest("hex").slice(0, 8)}…`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("seed-e2e FAILED:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
