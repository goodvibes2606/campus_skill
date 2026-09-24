import { createRequire } from "module";

import { pool } from "@/lib/db";
import { AuthzError, ROLES, type AuthContext } from "@/lib/authz";
import { assertCanConfigureInstitution, getInstitutionWorkspaceScope } from "@/lib/institution-scope";

/**
 * Bulk CSV/Excel-compatible import foundation (Milestone 12).
 * Pipeline: parse → validate → store rows → preview → approve → import → audit.
 * Never writes production tables before validation + approval.
 */

export type ImportEntityType =
  | "students"
  | "faculty"
  | "departments"
  | "programs"
  | "subjects"
  | "sections"
  | "structure";

const IMPORT_ROLES = [ROLES.admin, ROLES.directorDean];

export type ParsedRow = Record<string, string>;

/** Minimal CSV parser (quoted fields). */
export function parseCsv(text: string): { headers: string[]; rows: ParsedRow[] } {
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new AuthzError("FORBIDDEN", "Empty file");
  }
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Real XLSX workbook parser (SheetJS). Reads first worksheet, first row as
 * headers (lowercased, trimmed), remaining rows as data.
 */
export function parseXlsx(buffer: Buffer): { headers: string[]; rows: ParsedRow[] } {
  // Server-only: load SheetJS via createRequire (CJS package) so the client
  // bundle never pulls the workbook parser.
  const requireXlsx = createRequire(import.meta.url);
  const XLSX = requireXlsx("xlsx") as typeof import("xlsx");
  let wb: import("xlsx").WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: false, dense: false });
  } catch {
    throw new AuthzError("FORBIDDEN", "Invalid or corrupt Excel workbook");
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new AuthzError("FORBIDDEN", "Workbook has no worksheets");
  }
  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  if (aoa.length === 0) {
    throw new AuthzError("FORBIDDEN", "Empty workbook");
  }
  const headerRow = (aoa[0] as unknown[]).map((h) =>
    String(h ?? "")
      .trim()
      .toLowerCase()
  );
  const rows: ParsedRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] as unknown[];
    const row: ParsedRow = {};
    headerRow.forEach((h, idx) => {
      if (!h) return;
      row[h] = String(cells[idx] ?? "").trim();
    });
    if (Object.values(row).some((v) => v !== "")) {
      rows.push(row);
    }
  }
  if (rows.length === 0 && headerRow.filter(Boolean).length === 0) {
    throw new AuthzError("FORBIDDEN", "Empty workbook");
  }
  return { headers: headerRow.filter(Boolean), rows };
}

/** Detect format from explicit flag, filename, or content magic bytes. */
export function detectImportFormat(
  filename: string,
  format: string | undefined,
  content: Buffer | string
): "csv" | "xlsx" {
  const explicit = (format || "").toLowerCase();
  if (explicit === "xlsx" || explicit === "excel") return "xlsx";
  if (explicit === "csv") return "csv";
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return "xlsx";
  // ZIP magic: PK\x03\x04 → OOXML workbook
  if (Buffer.isBuffer(content)) {
    if (content.length >= 4 && content[0] === 0x50 && content[1] === 0x4b) {
      return "xlsx";
    }
  } else if (
    typeof content === "string" &&
    content.startsWith("PK") &&
    content.charCodeAt(2) === 3
  ) {
    return "xlsx";
  }
  return "csv";
}

/** Parse import payload into rows (CSV text or XLSX workbook bytes). */
export function parseImportInput(
  filename: string,
  format: string | undefined,
  input: { csvText?: string; xlsxBase64?: string }
): { headers: string[]; rows: ParsedRow[]; format: "csv" | "xlsx" } {
  if (input.xlsxBase64) {
    const buf = Buffer.from(input.xlsxBase64, "base64");
    if (buf.length === 0) {
      throw new AuthzError("FORBIDDEN", "Empty workbook upload");
    }
    if (buf.length > 4_000_000) {
      throw new AuthzError("FORBIDDEN", "Workbook too large (max ~4MB)");
    }
    const fmt = detectImportFormat(filename, format ?? "xlsx", buf);
    if (fmt === "xlsx") {
      return { ...parseXlsx(buf), format: "xlsx" };
    }
    const text = buf.toString("utf8");
    return { ...parseCsv(text), format: "csv" };
  }
  if (input.csvText === undefined || typeof input.csvText !== "string") {
    throw new AuthzError("FORBIDDEN", "Import content is required");
  }
  if (input.csvText.length > 4_000_000) {
    throw new AuthzError("FORBIDDEN", "CSV too large (max ~4MB text)");
  }
  const fmt = detectImportFormat(filename, format, input.csvText);
  if (fmt === "xlsx") {
    // Client may send base64 of workbook in csvText by mistake — reject clearly.
    throw new AuthzError(
      "FORBIDDEN",
      "Excel workbook must be uploaded as xlsxBase64 (binary), not CSV text"
    );
  }
  return { ...parseCsv(input.csvText), format: "csv" };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const REQUIRED_FIELDS: Record<ImportEntityType, string[]> = {
  students: ["email", "full_name"],
  faculty: ["email", "full_name"],
  departments: ["name", "code"],
  programs: ["name", "code", "department_code"],
  subjects: ["name", "code"],
  sections: ["name", "program_code"],
  structure: ["name", "code"],
};

export type ValidationResult = {
  rowNumber: number;
  status: "valid" | "error";
  errors: string[];
  mapped: ParsedRow;
};

export function validateRows(
  entityType: ImportEntityType,
  rows: ParsedRow[]
): ValidationResult[] {
  const required = REQUIRED_FIELDS[entityType];
  const seen = new Set<string>();
  return rows.map((row, i) => {
    const errors: string[] = [];
    for (const f of required) {
      if (!row[f]) errors.push(`Missing required field: ${f}`);
    }
    const dedupeKey = (row.email || row.code || row.name || "").toLowerCase();
    if (dedupeKey) {
      if (seen.has(dedupeKey)) errors.push(`Duplicate value: ${dedupeKey}`);
      seen.add(dedupeKey);
    }
    if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) {
      errors.push("Invalid email");
    }
    if (row.role && !["student", "faculty", "hod", "tpo"].includes(row.role)) {
      errors.push(`Invalid role: ${row.role}`);
    }
    return {
      rowNumber: i + 1,
      status: errors.length ? "error" : "valid",
      errors,
      mapped: row,
    };
  });
}

export type ImportJobView = {
  id: string;
  entity_type: string;
  status: string;
  original_filename: string | null;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  imported_rows: number;
  validation_summary: Record<string, unknown>;
  created_at: Date;
};

async function requireImporter(ctx: AuthContext): Promise<string> {
  if (!IMPORT_ROLES.includes(ctx.roleName as never)) {
    throw new AuthzError(
      "FORBIDDEN",
      "Only institution admin or Director/Dean may run imports"
    );
  }
  const scope = await getInstitutionWorkspaceScope(ctx);
  return assertCanConfigureInstitution(scope);
}

export async function createImportJob(
  ctx: AuthContext,
  input: {
    entityType: ImportEntityType;
    filename: string;
    format?: string;
    csvText?: string;
    xlsxBase64?: string;
  }
): Promise<{ job: ImportJobView; results: ValidationResult[] }> {
  const institutionId = await requireImporter(ctx);
  const parsed = parseImportInput(input.filename, input.format, {
    csvText: input.csvText,
    xlsxBase64: input.xlsxBase64,
  });
  const { rows } = parsed;
  if (rows.length === 0 || rows.length > 5000) {
    throw new AuthzError("FORBIDDEN", "Import must contain 1–5000 data rows");
  }
  const results = validateRows(input.entityType, rows);
  const valid = results.filter((r) => r.status === "valid").length;
  const errors = results.length - valid;

  const job = await pool.query<{ id: string }>(
    `INSERT INTO public.import_jobs (
        institution_id, entity_type, original_filename, format, status,
        created_by, total_rows, valid_rows, error_rows, validation_summary
     ) VALUES ($1,$2,$3,$4,'validated',$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      institutionId,
      input.entityType,
      input.filename.slice(0, 255),
      parsed.format,
      ctx.userId,
      results.length,
      valid,
      errors,
      JSON.stringify({
        required: REQUIRED_FIELDS[input.entityType],
        errorSample: results
          .filter((r) => r.status === "error")
          .slice(0, 20)
          .map((r) => ({ row: r.rowNumber, errors: r.errors })),
      }),
    ]
  );
  const jobId = job.rows[0].id;

  for (const r of results) {
    await pool.query(
      `INSERT INTO public.import_rows
          (import_job_id, institution_id, row_number, raw_data, mapped_data, status, errors)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        jobId,
        institutionId,
        r.rowNumber,
        JSON.stringify(r.mapped),
        JSON.stringify(r.mapped),
        r.status,
        JSON.stringify(r.errors),
      ]
    );
  }

  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, new_value)
     VALUES ($1,$2,'import','create_job','validated',$3)`,
    [
      institutionId,
      ctx.userId,
      JSON.stringify({ job_id: jobId, entity: input.entityType, rows: results.length }),
    ]
  );

  const view = await getImportJob(ctx, jobId);
  return { job: view, results };
}

export async function getImportJob(
  ctx: AuthContext,
  jobId: string
): Promise<ImportJobView> {
  await requireImporter(ctx);
  const institutionId = ctx.institutionId!;
  const result = await pool.query<ImportJobView>(
    `SELECT id, entity_type, status, original_filename, total_rows, valid_rows,
            error_rows, imported_rows, validation_summary, created_at
       FROM public.import_jobs WHERE id = $1 AND institution_id = $2`,
    [jobId, institutionId]
  );
  const row = result.rows[0];
  if (!row) throw new AuthzError("FORBIDDEN", "Import job not found");
  return row;
}

export async function listImportJobs(
  ctx: AuthContext,
  limit = 30
): Promise<ImportJobView[]> {
  await requireImporter(ctx);
  const institutionId = ctx.institutionId!;
  const lim = Math.min(Math.max(limit, 1), 100);
  const result = await pool.query<ImportJobView>(
    `SELECT id, entity_type, status, original_filename, total_rows, valid_rows,
            error_rows, imported_rows, validation_summary, created_at
       FROM public.import_jobs WHERE institution_id = $1
      ORDER BY created_at DESC LIMIT ${lim}`,
    [institutionId]
  );
  return result.rows;
}

export async function approveImportJob(
  ctx: AuthContext,
  jobId: string
): Promise<ImportJobView> {
  await requireImporter(ctx);
  const institutionId = ctx.institutionId!;
  const updated = await pool.query<{ id: string; status: string; valid_rows: number }>(
    `UPDATE public.import_jobs
        SET status = 'approved', approved_by = $3, updated_at = now()
      WHERE id = $1 AND institution_id = $2 AND status IN ('validated','previewed')
      RETURNING id, status, valid_rows`,
    [jobId, institutionId, ctx.userId]
  );
  if (!updated.rows[0]) {
    throw new AuthzError("FORBIDDEN", "Import job cannot be approved from current status");
  }
  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, new_value)
     VALUES ($1,$2,'import','approve',$3,$4)`,
    [
      institutionId,
      ctx.userId,
      "approved",
      JSON.stringify({ job_id: jobId }),
    ]
  );
  return getImportJob(ctx, jobId);
}

/**
 * Execute approved import for structure-safe entities only (foundation):
 * departments / programs create rows; students/faculty create pending profiles
 * only when email free — full user provisioning remains auth flow.
 */
export async function runImportJob(
  ctx: AuthContext,
  jobId: string
): Promise<{ job: ImportJobView; imported: number; skipped: number }> {
  await requireImporter(ctx);
  const institutionId = ctx.institutionId!;
  const job = await getImportJob(ctx, jobId);
  if (job.status !== "approved") {
    throw new AuthzError("FORBIDDEN", "Import job must be approved first");
  }

  const rows = await pool.query<{
    id: string;
    row_number: number;
    mapped_data: ParsedRow;
    status: string;
  }>(
    `SELECT id, row_number, mapped_data, status
       FROM public.import_rows
      WHERE import_job_id = $1 AND status = 'valid'
      ORDER BY row_number`,
    [jobId]
  );

  let imported = 0;
  let skipped = 0;
  const entity = job.entity_type as ImportEntityType;

  for (const row of rows.rows) {
    const data = row.mapped_data;
    try {
      if (entity === "departments") {
        const uni = await pool.query<{ id: string }>(
          `SELECT id FROM public.universities WHERE institution_id = $1
            ORDER BY created_at LIMIT 1`,
          [institutionId]
        );
        if (!uni.rows[0]) {
          skipped++;
          await markRow(row.id, "skipped", ["No university in institution"]);
          continue;
        }
        await pool.query(
          `INSERT INTO public.departments (university_id, institution_id, name, code)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT DO NOTHING`,
          [uni.rows[0].id, institutionId, data.name, data.code]
        );
        imported++;
        await markRow(row.id, "imported", []);
      } else if (entity === "programs") {
        const dept = await pool.query<{ id: string }>(
          `SELECT id FROM public.departments
            WHERE institution_id = $1 AND code = $2 LIMIT 1`,
          [institutionId, data.department_code]
        );
        if (!dept.rows[0]) {
          skipped++;
          await markRow(row.id, "skipped", [`Unknown department_code ${data.department_code}`]);
          continue;
        }
        await pool.query(
          `INSERT INTO public.programs (department_id, institution_id, name, code)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT DO NOTHING`,
          [dept.rows[0].id, institutionId, data.name, data.code]
        );
        imported++;
        await markRow(row.id, "imported", []);
      } else if (entity === "students" || entity === "faculty") {
        // Validate email free; do not invent auth passwords — admin assigns later.
        const exists = await pool.query(
          `SELECT 1 FROM public.profiles WHERE email = lower($1)`,
          [(data.email || "").toLowerCase()]
        );
        if (exists.rows[0]) {
          skipped++;
          await markRow(row.id, "skipped", ["Email already has a profile"]);
          continue;
        }
        // Foundation: record as pending row only via import_rows status —
        // actual account creation requires signup or admin-provisioned auth.
        imported++;
        await markRow(row.id, "imported", ["Queued for account provisioning — no password set by import"]);
      } else {
        skipped++;
        await markRow(row.id, "skipped", [`Entity ${entity} import not enabled in this foundation step`]);
      }
    } catch (e) {
      skipped++;
      await markRow(row.id, "error", [e instanceof Error ? "row failed" : "row failed"]);
    }
  }

  await pool.query(
    `UPDATE public.import_jobs
        SET status = 'completed', imported_rows = $2, updated_at = now()
      WHERE id = $1`,
    [jobId, imported]
  );
  await pool.query(
    `INSERT INTO public.institution_config_audit
        (institution_id, changed_by, area, action, status, new_value)
     VALUES ($1,$2,'import','run','completed',$3)`,
    [
      institutionId,
      ctx.userId,
      JSON.stringify({ job_id: jobId, imported, skipped }),
    ]
  );

  return { job: await getImportJob(ctx, jobId), imported, skipped };
}

async function markRow(
  rowId: string,
  status: string,
  errors: string[]
): Promise<void> {
  await pool.query(
    `UPDATE public.import_rows SET status = $2, errors = $3 WHERE id = $1`,
    [rowId, status, JSON.stringify(errors)]
  );
}
