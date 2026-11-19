// Pin comments API — Vercel Node function backed by the Supabase Postgres database.
//   GET    /api/comments                → all comments (header x-client-token marks your own as mine:true)
//   POST   /api/comments                → { section, x, y, author, body, parent_id? }
//   PATCH  /api/comments                → { id, resolved }
//   DELETE /api/comments?id=123         → only the comment's owner (same browser token)
// Tables are created on first use with RLS on and no policies, so the public Supabase REST API
// (anon/publishable key) cannot read or write them — only these functions can.
const { db, clean, ownerOf, limited, readBody, send, fail } = require("./_db");

const SECTIONS = new Set(["top", "route", "plan", "places", "budget", "stay", "memories", "crew", "backup"]);

module.exports = async function handler(req, res) {
  try {
    const owner = ownerOf(req);
    if (!owner) return send(res, 400, { error: "Missing client token" });
    const pg = await db();

    if (req.method === "GET") {
      const { rows } = await pg.query(
        `select id, section, x, y, parent_id, author, body, resolved, created_at, (owner_hash = $1) as mine
           from trip_comments order by created_at asc limit 2000`, [owner]);
      return send(res, 200, { comments: rows });
    }

    if (req.method === "POST") {
      const b = await readBody(req);
      const author = clean(b.author, 40), body = clean(b.body, 1000);
      const parent = b.parent_id == null ? null : Number(b.parent_id);
      let section = String(b.section || ""), x = Number(b.x), y = Number(b.y);
      if (!author || !body) return send(res, 400, { error: "Name and comment are required" });
      if (limited("c:" + owner, 20, 10 * 60 * 1000)) return send(res, 429, { error: "Too many comments, try again in a few minutes" });
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
    return fail(res, e, "comments api error");
  }
};
