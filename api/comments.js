// Pin comments API — Vercel Node function backed by the Supabase Postgres database.
// Uses the POSTGRES_URL env var that the Vercel ⇄ Supabase integration injects.
//
//   GET    /api/comments                → all comments (header x-client-token marks your own as mine:true)
//   POST   /api/comments                → { section, x, y, author, body, parent_id? }
//   PATCH  /api/comments                → { id, resolved }
//   DELETE /api/comments?id=123         → only the comment's owner (same browser token)
//
// The table is created on first use. RLS is switched on with no policies, so the public
// Supabase REST API (anon/publishable key) cannot read or write it — only this function can.

const crypto = require("crypto");
const { Pool, types } = require("pg");
types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint ids → JS numbers (safe for this table's size)

const SECTIONS = new Set(["top", "route", "plan", "places", "budget", "stay", "memories", "crew", "backup"]);
const LIMITS = { author: 40, body: 1000, perWindow: 20, windowMs: 10 * 60 * 1000 };

let pool, ready;
function db() {
  if (!pool) {
    const raw = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
    if (!raw) throw Object.assign(new Error("Database is not configured"), { status: 503 });
    const url = new URL(raw);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname) || process.env.PGSSL === "off";
    url.searchParams.delete("sslmode"); // we set SSL explicitly below
    url.searchParams.delete("supa");
    pool = new Pool({ connectionString: url.toString(), max: 3, ssl: local ? false : { rejectUnauthorized: false } });
  }
  if (!ready) {
    ready = pool.query(`
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
    `).catch((e) => { ready = null; throw e; });
  }
  return ready.then(() => pool);
}

const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

const hits = new Map(); // simple per-instance rate limit by owner token
function limited(owner) {
  const now = Date.now(), list = (hits.get(owner) || []).filter((t) => now - t < LIMITS.windowMs);
  list.push(now); hits.set(owner, list);
  return list.length > LIMITS.perWindow;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
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

module.exports = async function handler(req, res) {
  try {
    const token = req.headers["x-client-token"];
    if (!token || String(token).length < 16 || String(token).length > 100) return send(res, 400, { error: "Missing client token" });
    const owner = hash(token);
    const pg = await db();

    if (req.method === "GET") {
      const { rows } = await pg.query(
        `select id, section, x, y, parent_id, author, body, resolved, created_at, (owner_hash = $1) as mine
           from trip_comments order by created_at asc limit 2000`, [owner]);
      return send(res, 200, { comments: rows });
    }

    if (req.method === "POST") {
      const b = await readBody(req);
      const author = clean(b.author, LIMITS.author), body = clean(b.body, LIMITS.body);
      const parent = b.parent_id == null ? null : Number(b.parent_id);
      let section = String(b.section || ""), x = Number(b.x), y = Number(b.y);
      if (!author || !body) return send(res, 400, { error: "Name and comment are required" });
      if (limited(owner)) return send(res, 429, { error: "Too many comments, try again in a few minutes" });
      if (parent != null) {
        if (!Number.isInteger(parent)) return send(res, 400, { error: "Bad parent" });
        const p = await pg.query(`select section, x, y from trip_comments where id = $1 and parent_id is null`, [parent]);
        if (!p.rows.length) return send(res, 404, { error: "Comment not found" });
        ({ section, x, y } = p.rows[0]);
      } else if (!SECTIONS.has(section) || !(x >= 0 && x <= 100) || !(y >= 0 && y <= 100)) {
        return send(res, 400, { error: "Bad position" });
      }
      const { rows } = await pg.query(
        `insert into trip_comments (section, x, y, parent_id, author, body, owner_hash)
         values ($1,$2,$3,$4,$5,$6,$7)
         returning id, section, x, y, parent_id, author, body, resolved, created_at, true as mine`,
        [section, x, y, parent, author, body, owner]);
      return send(res, 201, { comment: rows[0] });
    }

    if (req.method === "PATCH") {
      const b = await readBody(req), id = Number(b.id);
      if (!Number.isInteger(id)) return send(res, 400, { error: "Bad id" });
      const { rowCount } = await pg.query(`update trip_comments set resolved = $2 where id = $1 and parent_id is null`, [id, !!b.resolved]);
      return rowCount ? send(res, 200, { ok: true }) : send(res, 404, { error: "Comment not found" });
    }

    if (req.method === "DELETE") {
      const id = Number(new URL(req.url, "http://x").searchParams.get("id"));
      if (!Number.isInteger(id)) return send(res, 400, { error: "Bad id" });
      const { rowCount } = await pg.query(`delete from trip_comments where id = $1 and owner_hash = $2`, [id, owner]);
      return rowCount ? send(res, 200, { ok: true }) : send(res, 403, { error: "You can only delete your own comments" });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("comments api error", e);
    return send(res, e.status || (e instanceof SyntaxError ? 400 : 500), { error: e.status ? e.message : "Server error" });
  }
};
