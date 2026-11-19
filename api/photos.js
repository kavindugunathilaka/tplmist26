// Memories photo API — photos are resized in the browser (≈1600px full + ≈480px thumb, JPEG)
// and stored in the Supabase Postgres database.
//   GET    /api/photos                      → list (no image bytes); header x-client-token marks mine:true
//   GET    /api/photos?id=12&size=thumb|full → the JPEG itself (cached by Vercel's CDN, ids never change)
//   POST   /api/photos                      → { place, caption, author, width, height, thumb, full } (base64 JPEG)
//   DELETE /api/photos?id=12                → only the uploader (same browser token)
const { db, clean, ownerOf, limited, readBody, send, fail } = require("./_db");

const MAX_FULL = 1_500_000, MAX_THUMB = 250_000;
const isJpeg = (b) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
function decode(s, max) {
  const b = Buffer.from(String(s || "").replace(/^data:image\/jpeg;base64,/, ""), "base64");
  return b.length && b.length <= max && isJpeg(b) ? b : null;
}

module.exports = async function handler(req, res) {
  try {
    const q = new URL(req.url, "http://x").searchParams;

    // image bytes: no token needed so <img src> works
    if (req.method === "GET" && q.get("id")) {
      const id = Number(q.get("id")), col = q.get("size") === "full" ? "full_img" : "thumb";
      if (!Number.isInteger(id)) return send(res, 400, { error: "Bad id" });
      const pg = await db();
      const { rows } = await pg.query(`select ${col} as img from trip_photos where id = $1`, [id]);
      if (!rows.length) return send(res, 404, { error: "Not found" });
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
      return res.end(rows[0].img);
    }

    const owner = ownerOf(req);
    if (!owner) return send(res, 400, { error: "Missing client token" });
    const pg = await db();

    if (req.method === "GET") {
      const { rows } = await pg.query(
        `select id, place, caption, author, width, height, created_at, (owner_hash = $1) as mine
           from trip_photos order by created_at desc limit 3000`, [owner]);
      return send(res, 200, { photos: rows });
    }

    if (req.method === "POST") {
      const b = await readBody(req);
      const author = clean(b.author, 40), caption = clean(b.caption, 200), place = String(b.place || "");
      const width = Math.round(Number(b.width)), height = Math.round(Number(b.height));
      if (!author) return send(res, 400, { error: "Please add your name" });
      if (!/^[a-z]{2,12}$/.test(place)) return send(res, 400, { error: "Pick a place" });
      if (!(width > 0 && width <= 4000 && height > 0 && height <= 4000)) return send(res, 400, { error: "Bad image size" });
      const full = decode(b.full, MAX_FULL), thumb = decode(b.thumb, MAX_THUMB);
      if (!full || !thumb) return send(res, 400, { error: "That file isn't a supported photo" });
      if (limited("p:" + owner, 80, 10 * 60 * 1000)) return send(res, 429, { error: "Too many uploads, try again in a few minutes" });
      const { rows } = await pg.query(
        `insert into trip_photos (place, caption, author, width, height, thumb, full_img, owner_hash)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning id, place, caption, author, width, height, created_at, true as mine`,
        [place, caption, author, width, height, thumb, full, owner]);
      return send(res, 201, { photo: rows[0] });
    }

    if (req.method === "DELETE") {
      const id = Number(q.get("id"));
      if (!Number.isInteger(id)) return send(res, 400, { error: "Bad id" });
      const { rowCount } = await pg.query(`delete from trip_photos where id = $1 and owner_hash = $2`, [id, owner]);
      return rowCount ? send(res, 200, { ok: true }) : send(res, 403, { error: "You can only delete your own photos" });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return fail(res, e, "photos api error");
  }
};
