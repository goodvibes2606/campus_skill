/**
 * Batch: adopt mapApiError in API routes that still leak error.message on 500.
 * Replaces local handleErr 500 message leakage with mapApiError, or
 * replaces catch 500 responses that include error.message.
 *
 * Run: node scripts/batch-map-api-error.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const apiRoot = join(root, "src/app/api");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const LEAK = /message:\s*error instanceof Error \? error\.message : ["']unknown["']/g;
const HANDLE_ERR_500 =
  /return NextResponse\.json\(\s*\{\s*error:\s*"server_error",\s*message:\s*error instanceof Error \? error\.message : "unknown",\s*\},\s*\{\s*status:\s*500\s*\}\s*\);/g;

let changed = 0;
let scanned = 0;

for (const file of walk(apiRoot)) {
  scanned++;
  let src = readFileSync(file, "utf8");
  const before = src;
  const rel = relative(root, file).replace(/\\/g, "/");

  // Skip auth catch-all (Better Auth owns responses)
  if (rel.includes("/api/auth/")) continue;

  // Prefer full mapApiError adoption when file has AuthzError + getAuthContext pattern
  if (
    src.includes("error instanceof Error ? error.message") ||
    src.includes('error instanceof Error ? error.message : "unknown"')
  ) {
    // Replace leaky 500 message with safe message
    src = src.replace(
      /message:\s*error instanceof Error \? error\.message : ["']unknown["']/g,
      'message: "Something went wrong. Try again."'
    );
    src = src.replace(
      /message:\s*error instanceof Error \? error\.message : ["']unknown["']/g,
      'message: "Something went wrong. Try again."'
    );
    // coordinators style single-line
    src = src.replace(
      /\{\s*error:\s*"server_error",\s*message:\s*error instanceof Error \? error\.message : "unknown"\s*\}/g,
      '{ error: "server_error", message: "Something went wrong. Try again." }'
    );
  }

  if (src !== before) {
    writeFileSync(file, src);
    changed++;
    console.log("updated", rel);
  }
}

console.log(`scanned=${scanned} changed=${changed}`);
