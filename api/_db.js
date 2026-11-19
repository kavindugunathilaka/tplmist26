// Shared Postgres helpers for the API functions (files starting with "_" are not routes on Vercel).
const crypto = require("crypto");
const { Pool, types } = require("pg");
types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint ids → JS numbers

let pool, ready;

const SCHEMA = `
  create table if not exists trip_comments (
    id          bigserial primary key,
    section     text        not null,
    x           real        not null check (x between 0 and 100),
    y           real        not null check (y between 0 and 100),
    parent_id   bigint      references trip_comments(id) on delete cascade,
    author      text        not null,
    body        text        not null,
    owner_hash  text        not null,
    resolved    boolean     not null default false,
    created_at  timestamptz not null default now()
  );
  create index if not exists trip_comments_parent_idx on trip_comments(parent_id);
  alter table trip_comments enable row level security;

  create table if not exists trip_photos (
    id          bigserial primary key,
    place       text        not null,
    caption     text        not null default '',
    author      text        not null,
    width       int         not null,
    height      int         not null,
    thumb       bytea       not null,
    full_img    bytea       not null,
    owner_hash  text        not null,
    created_at  timestamptz not null default now()
  );
  create index if not exists trip_photos_created_idx on trip_photos(created_at desc);
  alter table trip_photos enable row level security;
`;

function db() {
  if (!pool) {
    const raw = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
    if (!raw) throw Object.assign(new Error("Database is not configured"), { status: 503 });
    const url = new URL(raw);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname) || process.env.PGSSL === "off";
    url.searchParams.delete("sslmode");
    url.searchParams.delete("supa");
    pool = new Pool({ connectionString: url.toString(), max: 3, ssl: local ? false : { rejectUnauthorized: false } });
  }
  if (!ready) ready = pool.query(SCHEMA).catch((e) => { ready = null; throw e; });
  return ready.then(() => pool);
}

const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

function ownerOf(req) {
  const token = req.headers["x-client-token"];
  if (!token || String(token).length < 16 || String(token).length > 100) return null;
  return hash(token);
}

const hits = new Map(); // simple per-instance rate limit
function limited(key, max, windowMs) {
  const now = Date.now(), list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now); hits.set(key, list);
  return list.length > max;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8") || "{}");
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function fail(res, e, label) {
  console.error(label, e);
  return send(res, e.status || (e instanceof SyntaxError ? 400 : 500), { error: e.status ? e.message : "Server error" });
}

module.exports = { db, hash, clean, ownerOf, limited, readBody, send, fail };
