#!/usr/bin/env node
/**
 * Pull every recoverable local env value from CLIs + committed config.
 * Never prints secret values. Wrangler Worker secrets are write-only — this
 * cannot recover GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, webhook
 * signing secrets, or encryption keys already on Cloudflare.
 *
 *   node scripts/bootstrap_local_env.mjs
 *   node scripts/bootstrap_local_env.mjs --dry-run
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT, ".env");
const dryRun = process.argv.includes("--dry-run");

/** @param {string} raw */
function parseEnv(raw) {
  /** @type {Record<string, string>} */
  const out = {};
  let key = null;
  let quote = null;
  let buf = "";

  const flush = () => {
    if (!key) return;
    out[key] = buf;
    key = null;
    quote = null;
    buf = "";
  };

  const isOpenPem = (value) => value.includes("-----BEGIN") && !value.includes("-----END");

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!key && (!trimmed || trimmed.startsWith("#"))) continue;

    if (!key) {
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      key = line.slice(0, eq).trim();
      const rest = line.slice(eq + 1);
      if (rest.startsWith('"')) {
        quote = '"';
        buf = rest.slice(1);
        if (buf.endsWith('"') && !buf.endsWith('\\"')) {
          buf = buf.slice(0, -1);
          flush();
        }
      } else if (rest.startsWith("'")) {
        quote = "'";
        buf = rest.slice(1);
        if (buf.endsWith("'")) {
          buf = buf.slice(0, -1);
          flush();
        }
      } else {
        buf = rest.trim();
        if (isOpenPem(buf)) quote = "pem";
        else flush();
      }
      continue;
    }

    if (quote === "pem") {
      buf += `${buf ? "\n" : ""}${line}`;
      if (line.includes("-----END")) flush();
      continue;
    }

    if (quote === '"') {
      if (line.endsWith('"') && !line.endsWith('\\"')) {
        buf += (buf ? "\n" : "") + line.slice(0, -1);
        flush();
      } else {
        buf += (buf ? "\n" : "") + line;
      }
    } else {
      buf += line;
      flush();
    }
  }
  flush();
  return out;
}

/** @param {Record<string, string>} env */
function serializeEnv(env, templateRaw) {
  const lines = templateRaw.split("\n");
  const out = [];
  let key = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const name = trimmed.slice(0, trimmed.indexOf("=")).trim();
      if (env[name] !== undefined && env[name] !== "") {
        if (env[name].includes("\n")) {
          out.push(`${name}="${env[name]}"`);
        } else {
          out.push(`${name}=${env[name]}`);
        }
        key = name;
        continue;
      }
      key = name;
    }
    if (key && env[key] !== undefined && env[key] !== "" && line.startsWith(key + "=")) {
      continue;
    }
    out.push(line);
  }

  for (const [name, value] of Object.entries(env)) {
    if (out.some((line) => line.startsWith(`${name}=`))) continue;
    if (!value) continue;
    out.push(value.includes("\n") ? `${name}="${value}"` : `${name}=${value}`);
  }
  return `${out.join("\n").replace(/\n*$/, "\n")}`;
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").slice(0, 240)}`);
  }
  return (result.stdout || "").trim();
}

function loadWranglerVars() {
  const raw = readFileSync(path.join(ROOT, "apps/studio/wrangler.jsonc"), "utf8");
  const json = raw.replace(/^\s*\/\/.*$/gm, "").replace(/,\s*([\]}])/g, "$1");
  const config = JSON.parse(json);
  return {
    accountId: config.account_id,
    vars: config.vars ?? {},
  };
}

function loadStripeTestSecret() {
  const raw = run("stripe", ["config", "--list"]);
  const match = raw.match(/test_mode_api_key=(sk_test_\S+)/);
  return match?.[1] ?? "";
}

function loadGitHubApp() {
  const app = JSON.parse(run("gh", ["api", "apps/ikiro-builder"]));
  const installs = JSON.parse(run("gh", ["api", "orgs/Ikiro-io/installations"]));
  const install = installs.installations?.find((row) => row.app_slug === "ikiro-builder");
  return {
    appId: String(app.id),
    installationId: install ? String(install.id) : "",
  };
}

function pullClerkEnv() {
  const tmp = path.join(ROOT, ".env.clerk-bootstrap.tmp");
  const result = spawnSync("clerk", ["env", "pull", "--file", tmp, "--app", "app_3FYycsYTMUQztBxSofIu2yxEsp3"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`clerk env pull failed: ${(result.stderr || result.stdout || "").slice(0, 240)}`);
  }
  const pulled = existsSync(tmp) ? parseEnv(readFileSync(tmp, "utf8")) : {};
  if (existsSync(tmp)) {
    spawnSync("rm", ["-f", tmp]);
  }
  return pulled;
}

function loadStaffUserIds() {
  const raw = run("clerk", ["users", "list", "--limit", "10"]);
  const data = JSON.parse(raw);
  const users = data.data ?? [];
  const ids = users
    .filter((user) =>
      (user.email_addresses ?? []).some((email) =>
        /emailmike@gmail.com|support@xterminal.app/i.test(email.email_address ?? ""),
      ),
    )
    .map((user) => user.id);
  return ids.join(",");
}

const templatePath = path.join(ROOT, ".env.example");
const templateRaw = existsSync(templatePath)
  ? readFileSync(templatePath, "utf8")
  : existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8")
    : "";

if (!templateRaw) {
  throw new Error("missing .env.example — cannot bootstrap");
}

const existing = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, "utf8")) : {};
const env = { ...existing };

const { accountId, vars } = loadWranglerVars();
const github = loadGitHubApp();
const clerk = pullClerkEnv();

const fills = {
  CLERK_SECRET_KEY: clerk.CLERK_SECRET_KEY || env.CLERK_SECRET_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    clerk.CLERK_PUBLISHABLE_KEY || vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  GITHUB_APP_ID: github.appId,
  GITHUB_APP_INSTALLATION_ID: github.installationId,
  GITHUB_ORG: "Ikiro-io",
  GITHUB_TEMPLATE_OWNER: "Ikiro-io",
  IKIRO_FOLDER_BUILDER_WEBHOOK_URL: "https://ikiro-folder-builder.emailmike.workers.dev/webhook/github",
  STRIPE_SECRET_KEY: loadStripeTestSecret() || env.STRIPE_SECRET_KEY,
  STRIPE_SITE_ANNUAL_PRICE_ID: vars.STRIPE_SITE_ANNUAL_PRICE_ID || env.STRIPE_SITE_ANNUAL_PRICE_ID,
  STRIPE_STUDIO_MONTHLY_PRICE_ID:
    vars.STRIPE_STUDIO_MONTHLY_PRICE_ID || env.STRIPE_STUDIO_MONTHLY_PRICE_ID,
  STRIPE_TAX_MODE: vars.STRIPE_TAX_MODE || env.STRIPE_TAX_MODE || "disabled",
  R2_ACCOUNT_ID: accountId,
  R2_ARTIFACT_BUCKET: "ikiro-artifacts",
  D1_DATABASE_ID: "d55bb197-971d-46e9-93ab-e779d9a6ae55",
  IKIRO_APP_ORIGIN: vars.IKIRO_APP_ORIGIN || env.IKIRO_APP_ORIGIN,
  IKIRO_CONTENT_HOST: vars.IKIRO_CONTENT_HOST || env.IKIRO_CONTENT_HOST,
  IKIRO_STAFF_USER_IDS: loadStaffUserIds() || env.IKIRO_STAFF_USER_IDS,
};

for (const [key, value] of Object.entries(fills)) {
  if (value) env[key] = value;
}

delete env.CLERK_PUBLISHABLE_KEY;

const unrecoverable = [
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET",
  "IKIRO_FORM_PROVIDER_KEY",
  "IKIRO_GALLERY_PLATFORM_KEY",
  "IKIRO_TRANSPORT_WEBHOOK_SECRET",
  "PREVIEW_SIGNING_SECRET",
  "GEMINI_API_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_API_TOKEN",
  "SITE_JOBS_INTERNAL_TOKEN",
];

const stillMissing = unrecoverable.filter((key) => {
  const value = env[key]?.trim();
  return !value || value.includes("PASTE_KEY") || value.includes("REPLACE_ME");
});

const filled = Object.keys(fills).filter((key) => fills[key]);
const next = serializeEnv(env, templateRaw);

if (!dryRun) {
  writeFileSync(ENV_PATH, next, "utf8");
}

console.log(
  JSON.stringify({
    ok: true,
    dry_run: dryRun,
    env_path: ENV_PATH,
    auto_filled: filled,
    still_need_manual: stillMissing,
    note:
      "Wrangler/Stripe webhook secrets and GitHub PEM cannot be read back from APIs. Paste from password manager or dashboard Reveal.",
  }),
);
