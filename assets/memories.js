/* Memories — the group's own trip photos.
   Photos are resized in the browser (full ≈1600px, thumb ≈480px JPEG) and uploaded one by one to /api/photos.
   Uses window.TRIP_PLACES (set in index.html) for the place list, and the page's #lb lightbox. */
(function () {
  const API = "/api/photos";
  const PLACES = (window.TRIP_PLACES || []).concat([{ id: "other", name: "Other" }]);
  const placeName = (id) => (PLACES.find((p) => p.id === id) || { name: "Other" }).name;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  let token = store.get("pc_token");
  if (!token) { token = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()) + "-pc"; store.set("pc_token", token); }

  let photos = [], filter = "all", current = -1, view = [], apiOk = true;

  /* ---------- styles ---------- */
  document.head.insertAdjacentHTML("beforeend", `<style>
  .mem-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:22px}
  .mem-add{background:var(--amber,#e9a23b);color:#0f1f1a;border:0;border-radius:999px;padding:12px 20px;font:700 .92rem var(--body,system-ui);cursor:pointer;box-shadow:0 10px 24px -12px rgba(0,0,0,.6);transition:.2s}
  .mem-add:hover{transform:translateY(-2px)}
  .mem-count{color:rgba(255,255,255,.65);font-size:.88rem}
  .mem-empty{border:2px dashed rgba(255,255,255,.2);border-radius:18px;padding:60px 20px;text-align:center;color:rgba(255,255,255,.7);cursor:pointer;transition:.2s}
  .mem-empty:hover{border-color:var(--amber,#e9a23b);color:#fff}
  .mem-empty b{display:block;font:600 1.3rem var(--display,Georgia,serif);color:#fff;margin-bottom:6px}
  #gallery{columns:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  #gallery .shot{margin:0}
  #gallery .shot img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;display:block;background:#1d3a31}
  #gallery .mem-empty{grid-column:1/-1}
  @media(max-width:600px){#gallery{grid-template-columns:repeat(2,1fr);gap:8px}#gallery .shot figcaption{padding:22px 8px 6px;font-size:.72rem}}
  .shot figcaption small{display:block;opacity:.7;font-size:.72rem;margin-top:2px}
  .mem-modal{position:fixed;inset:0;z-index:120;background:rgba(5,12,10,.75);display:grid;place-items:center;padding:16px;animation:pop .25s}
  .mem-card{background:#fff;color:#0f1f1a;border-radius:20px;width:min(560px,100%);max-height:92vh;overflow:auto;padding:24px;font:.92rem/1.5 var(--body,system-ui)}
  .mem-card h3{font:700 1.5rem var(--display,Georgia,serif);margin:0 0 4px}
  .mem-card p.sub{color:#5d6f66;margin:0 0 16px}
  .mem-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-bottom:16px}
  .mem-thumbs div{aspect-ratio:1;border-radius:10px;background:#eef3ef center/cover;position:relative}
  .mem-thumbs div.ok::after{content:"✓";position:absolute;inset:0;display:grid;place-items:center;background:rgba(47,107,79,.55);color:#fff;font-size:1.6rem;border-radius:10px}
  .mem-thumbs div.bad::after{content:"!";position:absolute;inset:0;display:grid;place-items:center;background:rgba(192,57,43,.6);color:#fff;font-size:1.6rem;border-radius:10px}
  .mem-thumbs div.busy::after{content:"";position:absolute;inset:0;border-radius:10px;background:rgba(255,255,255,.55)}
  .mem-card label{display:block;font-weight:700;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:#2f6b4f;margin:12px 0 6px}
  .mem-card input,.mem-card select{width:100%;border:1.5px solid #dfe8e2;border-radius:10px;padding:10px 12px;font:inherit;background:#fff;color:#0f1f1a}
  .mem-card input:focus,.mem-card select:focus{outline:none;border-color:#2f6b4f}
  .mem-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:20px}
  .mem-go{background:var(--forest,#123a2e);color:#fff;border:0;border-radius:12px;padding:12px 20px;font:700 .92rem var(--body,system-ui);cursor:pointer}
  .mem-go:disabled{opacity:.5;cursor:default}
  .mem-cancel{background:none;border:0;color:#5d6f66;font:600 .9rem var(--body,system-ui);cursor:pointer}
  .mem-status{font-size:.85rem;color:#5d6f66}
  .mem-status.err{color:#c0392b}
  #lb img{max-width:min(92vw,1400px);max-height:78vh;width:auto;height:auto;margin:0 auto}
  #lb p{max-width:92vw;margin-left:auto;margin-right:auto}
  .lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);color:#fff;border:0;width:48px;height:48px;border-radius:50%;font-size:1.6rem;cursor:pointer}
  .lb-nav.prev{left:16px}.lb-nav.next{right:16px}
  .lb-del{margin-left:12px;background:none;border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:999px;padding:3px 12px;font:600 .8rem var(--body,system-ui);cursor:pointer}
  .lb-del.armed{background:#c0392b;border-color:#c0392b}
  @media(max-width:600px){.lb-nav{top:auto;bottom:24px;transform:none;background:rgba(255,255,255,.2)}.lb-nav.prev{left:calc(50% - 60px)}.lb-nav.next{right:calc(50% - 60px)}}
  </style>`);

  /* ---------- section shell ---------- */
  const sec = $("#memories");
  const head = $(".sec-head p", sec);
  if (head) head.textContent = "Photos from the trip, added by all of us. Tap ＋ Add photos to upload yours.";
  $("#filters").insertAdjacentHTML("beforebegin", `<div class="mem-bar"><button class="mem-add" id="memAdd">＋ Add photos</button><span class="mem-count" id="memCount"></span></div>
    <input type="file" id="memFile" accept="image/*" multiple hidden>`);
  const fileInput = $("#memFile");
  $("#memAdd").onclick = () => fileInput.click();
  fileInput.onchange = () => { if (fileInput.files.length) openUpload([...fileInput.files]); fileInput.value = ""; };

  /* ---------- api ---------- */
  async function api(method, body, query = "") {
    const r = await fetch(API + query, { method, headers: { "Content-Type": "application/json", "x-client-token": token }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || (r.status === 413 ? "Photo too large" : "Upload failed"));
    return data;
  }
  const src = (p, size) => `${API}?id=${p.id}&size=${size}`;

  /* ---------- image resize ---------- */
  async function loadBitmap(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {} }
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  function toJpeg(bmp, max, quality) {
    const w0 = bmp.width, h0 = bmp.height, s = Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement("canvas"); c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/jpeg", quality), w: c.width, h: c.height };
  }
  async function prepare(file) {
    const bmp = await loadBitmap(file);
    let full = toJpeg(bmp, 1600, 0.82);
    if (full.data.length > 1_900_000) full = toJpeg(bmp, 1400, 0.72);
    const thumb = toJpeg(bmp, 480, 0.72);
    bmp.close && bmp.close();
    return { full: full.data, thumb: thumb.data, width: full.w, height: full.h };
  }

  /* ---------- upload dialog ---------- */
  function openUpload(files) {
    const modal = document.createElement("div"); modal.className = "mem-modal";
    const last = store.get("mem_place", "");
    modal.innerHTML = `<div class="mem-card" role="dialog" aria-label="Add photos">
      <h3>Add ${files.length} photo${files.length > 1 ? "s" : ""}</h3><p class="sub">They're resized before upload, so this is quick even on mobile data.</p>
      <div class="mem-thumbs">${files.map(() => "<div></div>").join("")}</div>
      <label for="memPlace">Where was this?</label>
      <select id="memPlace">${PLACES.map((p) => `<option value="${p.id}"${p.id === last ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <label for="memCap">Caption (optional)</label><input id="memCap" maxlength="200" placeholder="e.g. Sunrise at World's End">
      <label for="memName">Your name</label><input id="memName" maxlength="40" placeholder="Your name" value="${esc(store.get("pc_name", ""))}">
      <div class="mem-actions"><span class="mem-status" id="memStatus"></span><div><button class="mem-cancel" id="memCancel">Cancel</button> <button class="mem-go" id="memGo">Upload</button></div></div></div>`;
    document.body.appendChild(modal);
    const tiles = [...modal.querySelectorAll(".mem-thumbs div")];
    files.forEach((f, i) => { const u = URL.createObjectURL(f); tiles[i].style.backgroundImage = `url("${u}")`; });
    let busy = false;
    const close = () => { if (!busy) { modal.remove(); tiles.forEach((t) => URL.revokeObjectURL((t.style.backgroundImage.match(/url\("(.*)"\)/) || [])[1])); } };
    $("#memCancel", modal).onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
    $("#memGo", modal).onclick = async () => {
      const author = $("#memName", modal).value.trim(), place = $("#memPlace", modal).value, caption = $("#memCap", modal).value.trim();
      const status = $("#memStatus", modal);
      if (!author) { $("#memName", modal).focus(); status.textContent = "Please add your name"; status.className = "mem-status err"; return; }
      store.set("pc_name", author); store.set("mem_place", place);
      busy = true; $("#memGo", modal).disabled = true; $("#memCancel", modal).disabled = true;
      let ok = 0, failed = 0, lastErr = "";
      for (let i = 0; i < files.length; i++) {
        status.className = "mem-status"; status.textContent = `Uploading ${i + 1} of ${files.length}…`;
        tiles[i].className = "busy";
        try {
          const img = await prepare(files[i]);
          const { photo } = await api("POST", { place, caption, author, ...img });
          photos.unshift(photo); ok++; tiles[i].className = "ok";
        } catch (e) { failed++; lastErr = /decode|load|source/i.test(e.message || "") || !e.message ? "a file couldn't be read as a photo" : e.message; tiles[i].className = "bad"; }
      }
      busy = false; render();
      if (!failed) { status.textContent = "Done!"; setTimeout(() => modal.remove(), 700); }
      else {
        status.className = "mem-status err";
        status.textContent = `${ok} uploaded, ${failed} failed (${lastErr}).`;
        $("#memCancel", modal).disabled = false; $("#memCancel", modal).textContent = "Close";
      }
    };
  }

  /* ---------- gallery ---------- */
  const gallery = $("#gallery"), filters = $("#filters");
  function render() {
    const counts = {}; photos.forEach((p) => (counts[p.place] = (counts[p.place] || 0) + 1));
    if (filter !== "all" && !counts[filter]) filter = "all";
    filters.innerHTML = photos.length ? `<button class="btn${filter === "all" ? " on" : ""}" data-f="all">All · ${photos.length}</button>` +
      PLACES.filter((p) => counts[p.id]).map((p) => `<button class="btn${filter === p.id ? " on" : ""}" data-f="${p.id}">${esc(p.name)} · ${counts[p.id]}</button>`).join("") : "";
    const ppl = new Set(photos.map((p) => p.author.trim().toLowerCase())).size;
    $("#memCount").textContent = photos.length ? `${photos.length} photo${photos.length > 1 ? "s" : ""} from ${ppl} ${ppl > 1 ? "people" : "person"}` : "";
    view = photos.filter((p) => filter === "all" || p.place === filter);
    if (!apiOk) { gallery.innerHTML = `<div class="mem-empty" style="cursor:default">Photos can't be loaded right now.</div>`; return; }
    gallery.innerHTML = view.length ? view.map((p, i) => `
      <figure class="shot" data-i="${i}">
        <img src="${src(p, "thumb")}" alt="${esc(p.caption || placeName(p.place))}" loading="lazy">
        <figcaption>${esc(placeName(p.place))}${p.caption ? ` · ${esc(p.caption)}` : ""}<small>by ${esc(p.author)}</small></figcaption>
      </figure>`).join("")
      : `<div class="mem-empty" id="memEmpty"><b>No photos yet</b>Tap here to add the first one.</div>`;
    const empty = $("#memEmpty"); if (empty) empty.onclick = () => fileInput.click();
  }
  filters.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; filter = b.dataset.f; render(); };
  gallery.onclick = (e) => { const f = e.target.closest(".shot"); if (f) openLightbox(Number(f.dataset.i)); };

  /* ---------- lightbox (reuses the page's #lb) ---------- */
  const lb = $("#lb"), lbImg = $("#lbImg"), lbCap = $("#lbCap");
  lb.insertAdjacentHTML("beforeend", `<button class="lb-nav prev" aria-label="Previous">‹</button><button class="lb-nav next" aria-label="Next">›</button>`);
  const navPrev = $(".lb-nav.prev", lb), navNext = $(".lb-nav.next", lb);
  navPrev.onclick = (e) => { e.stopPropagation(); step(-1); };
  navNext.onclick = (e) => { e.stopPropagation(); step(1); };
  function openLightbox(i) {
    current = i; const p = view[i]; if (!p) return;
    lbImg.src = src(p, "thumb"); const full = new Image(); full.onload = () => { if (view[current] === p) lbImg.src = full.src; }; full.src = src(p, "full");
    lbCap.innerHTML = `${esc(placeName(p.place))}${p.caption ? " · " + esc(p.caption) : ""} · by ${esc(p.author)}${p.mine ? `<button class="lb-del">Delete</button>` : ""}`;
    const del = $(".lb-del", lbCap);
    if (del) del.onclick = async (e) => {
      e.stopPropagation();
      if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "Tap again to delete"; setTimeout(() => { del.classList.remove("armed"); del.textContent = "Delete"; }, 3000); return; }
      try { await api("DELETE", null, "?id=" + p.id); photos = photos.filter((x) => x.id !== p.id); lb.classList.remove("open"); render(); }
      catch (err) { del.textContent = err.message; }
    };
    navPrev.style.display = navNext.style.display = view.length > 1 ? "" : "none";
    lb.classList.add("open");
  }
  function step(d) { if (view.length) openLightbox((current + d + view.length) % view.length); }
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open") || current < 0) return;
    if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "Escape") lb.classList.remove("open");
  });
  let x0 = null;
  lb.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  lb.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); x0 = null; });

  /* ---------- sync ---------- */
  async function load() {
    if (document.hidden || document.querySelector(".mem-modal")) return;
    try { const { photos: rows } = await api("GET"); photos = rows; apiOk = true; } catch { apiOk = false; }
    if (!lb.classList.contains("open")) render();
  }
  render(); load(); setInterval(load, 30000);
})();
