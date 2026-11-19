/* Pin comments — tap anywhere on a section to leave a note for the group.
   Talks to /api/comments (Vercel function → Supabase Postgres). No accounts: people type a name,
   and a random token in localStorage lets them delete their own comments. */
(function () {
  const API = "/api/comments";
  const POLL_MS = 15000;
  const SECTIONS = ["top", "route", "plan", "places", "budget", "stay", "memories", "crew", "backup"];
  const LABEL = { top: "Top", route: "Route", plan: "Itinerary", places: "Places", budget: "Budget", stay: "Stay", memories: "Memories", crew: "Crew", backup: "Handover" };

  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  let token = store.get("pc_token");
  if (!token) { token = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()) + "-pc"; store.set("pc_token", token); }

  let comments = [], pinMode = false, showResolved = false, openId = null, apiOk = true;

  /* ---------- styles ---------- */
  const css = `
  .pc-fab{position:fixed;right:20px;bottom:20px;z-index:90;display:flex;gap:8px}
  .pc-btn{font:600 .9rem var(--body,system-ui);border:0;border-radius:999px;padding:12px 18px;cursor:pointer;box-shadow:0 10px 30px -10px rgba(0,0,0,.45);transition:.2s}
  .pc-btn.main{background:var(--tea,#4FCB8E);color:var(--tea-ink,#06150D)}
  .pc-btn.main.on{background:var(--amber,#F2B84B);color:#1a1205}
  .pc-btn.list{background:var(--s2,#1B2B2F);color:var(--text,#EEF3F1);border:1px solid var(--line,#2A3D41);position:relative}
  .pc-btn .n{position:absolute;top:-6px;right:-6px;background:var(--rose,#d9674e);color:#fff;font-size:.7rem;min-width:20px;height:20px;border-radius:10px;display:grid;place-items:center;padding:0 5px}
  .pc-btn .n:empty{display:none}
  body.pc-pinning{cursor:crosshair}
  body.pc-pinning section[id],body.pc-pinning #top{outline:2px dashed rgba(242,184,75,.6);outline-offset:-6px}
  .pc-hint{position:fixed;left:50%;top:80px;transform:translateX(-50%);z-index:95;background:var(--text,#EEF3F1);color:var(--bg,#0F1A1C);padding:10px 16px;border-radius:999px;font:600 .85rem var(--body,system-ui);display:none;box-shadow:0 10px 30px -10px rgba(0,0,0,.5)}
  body.pc-pinning .pc-hint{display:block}
  section[id]{position:relative}
  .pc-pin{position:absolute;z-index:40;width:30px;height:30px;margin:-30px 0 0 -4px;border-radius:50% 50% 50% 4px;background:var(--amber,#e9a23b);color:#0f1f1a;border:2px solid var(--bg,#0F1A1C);display:grid;place-items:center;font:800 .78rem var(--body,system-ui);cursor:pointer;box-shadow:0 6px 16px -4px rgba(0,0,0,.5);transition:transform .2s;animation:pcDrop .4s cubic-bezier(.2,1.4,.4,1)}
  .pc-pin:hover,.pc-pin.open{transform:scale(1.15)}
  .pc-pin.done{background:#9aa8a1;opacity:.75}
  .pc-pin i{position:absolute;top:-7px;right:-7px;background:var(--text,#EEF3F1);color:var(--bg,#0F1A1C);font-style:normal;font-size:.62rem;min-width:16px;height:16px;border-radius:8px;display:grid;place-items:center;padding:0 3px}
  @keyframes pcDrop{from{transform:translateY(-14px) scale(.6);opacity:0}}
  .pc-pop{position:fixed;z-index:100;width:min(340px,92vw);background:var(--s1,#152225);color:var(--text,#EEF3F1);border:1px solid var(--line,#2A3D41);border-radius:16px;box-shadow:0 24px 60px -18px rgba(0,0,0,.8);font:.9rem/1.45 var(--body,system-ui);overflow:hidden;animation:pcPop .2s ease}
  @keyframes pcPop{from{opacity:0;transform:translateY(6px)}}
  .pc-pop header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--s2,#1B2B2F);font-weight:600;font-size:.84rem;color:var(--soft,#C3D1CE)}
  .pc-pop header button{background:none;border:0;font-size:1.2rem;cursor:pointer;color:var(--muted,#8FA4A1)}
  .pc-body{max-height:300px;overflow:auto;padding:6px 14px}
  .pc-msg{padding:10px 0;border-bottom:1px solid var(--line,#2A3D41)}
  .pc-msg:last-child{border-bottom:0}
  .pc-msg b{font-weight:700}.pc-msg time{color:var(--muted,#8FA4A1);font-size:.75rem;margin-left:6px}
  .pc-msg p{margin:3px 0 0;white-space:pre-wrap;word-break:break-word}
  .pc-msg .acts{margin-top:4px;display:flex;gap:10px}
  .pc-link{background:none;border:0;padding:0;color:var(--tea,#4FCB8E);font:600 .78rem var(--body,system-ui);cursor:pointer}
  .pc-link.red{color:var(--rose,#F07A6A)}
  .pc-form{padding:12px 14px;border-top:1px solid var(--line,#2A3D41);display:grid;gap:8px}
  .pc-form input,.pc-form textarea{width:100%;border:1px solid var(--line,#2A3D41);border-radius:10px;padding:9px 11px;font:inherit;resize:vertical;background:var(--s2,#1B2B2F);color:var(--text,#EEF3F1)}
  .pc-form input:focus,.pc-form textarea:focus{outline:none;border-color:var(--mist,#8EC5E8)}
  .pc-form .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .pc-send{background:var(--tea,#4FCB8E);color:var(--tea-ink,#06150D);border:0;border-radius:10px;padding:9px 16px;font:700 .85rem var(--body,system-ui);cursor:pointer}
  .pc-send:disabled{opacity:.5;cursor:default}
  .pc-err{color:var(--rose,#F07A6A);font-size:.8rem}
  .pc-panel{position:fixed;top:0;right:0;bottom:0;z-index:98;width:min(380px,100vw);background:var(--bg,#0F1A1C);border-left:1px solid var(--line,#2A3D41);box-shadow:-20px 0 60px -20px rgba(0,0,0,.8);transform:translateX(105%);transition:transform .35s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column;font:.9rem/1.45 var(--body,system-ui);color:var(--text,#EEF3F1)}
  .pc-panel.open{transform:none}
  .pc-panel>header{padding:20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line,#2A3D41)}
  .pc-panel h3{font:700 1.4rem var(--display,Georgia,serif);margin:0}
  .pc-panel label{font-size:.8rem;color:var(--muted,#8FA4A1);display:flex;gap:6px;align-items:center;cursor:pointer}
  .pc-list{overflow:auto;padding:12px 16px 90px;flex:1}
  .pc-item{background:var(--s1,#152225);border-radius:14px;padding:12px 14px;margin-bottom:10px;cursor:pointer;border-left:4px solid var(--amber,#e9a23b);transition:.2s}
  .pc-item:hover{transform:translateX(-3px)}
  .pc-item.done{border-left-color:#5E716E;opacity:.7}
  .pc-item small{color:var(--muted,#8FA4A1)}
  .pc-item p{margin:4px 0 0;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .pc-empty{color:var(--muted,#8FA4A1);text-align:center;padding:40px 10px}
  .pc-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:110;background:var(--text,#EEF3F1);color:var(--bg,#0F1A1C);padding:10px 16px;border-radius:12px;font:600 .85rem var(--body,system-ui);opacity:0;transition:.3s;pointer-events:none}
  .pc-toast.on{opacity:1}
  @media(max-width:600px){.pc-fab{right:12px;bottom:12px}.pc-btn{padding:11px 14px}}`;
  document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);

  /* ---------- helpers ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago"; return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };
  const secEl = (id) => document.getElementById(id);
  const roots = () => comments.filter((c) => !c.parent_id);
  const replies = (id) => comments.filter((c) => c.parent_id === id);
  function toast(msg) { const t = $t; t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2600); }

  async function api(method, body, query = "") {
    const r = await fetch(API + query, { method, headers: { "Content-Type": "application/json", "x-client-token": token }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  /* ---------- UI shell ---------- */
  document.body.insertAdjacentHTML("beforeend", `
    <div class="pc-fab">
      <button class="pc-btn list" id="pcList" title="All comments">Comments<span class="n" id="pcCount"></span></button>
      <button class="pc-btn main" id="pcMode">Add comment</button>
    </div>
    <div class="pc-hint">Tap anywhere on the page to place your comment. <u id="pcCancel" style="cursor:pointer">Cancel</u></div>
    <aside class="pc-panel" id="pcPanel" aria-label="Comments">
      <header><div><h3>Comments</h3><label><input type="checkbox" id="pcShowDone"> Show resolved</label></div>
        <button class="pc-link" id="pcClose" style="font-size:1.6rem;color:var(--muted,#8FA4A1)" aria-label="Close comments">×</button></header>
      <div class="pc-list" id="pcItems"></div>
    </aside>
    <div class="pc-toast" id="pcToast"></div>`);
  const $t = document.getElementById("pcToast"), $mode = document.getElementById("pcMode"), $panel = document.getElementById("pcPanel");

  function setPinMode(on) {
    pinMode = on; document.body.classList.toggle("pc-pinning", on);
    $mode.classList.toggle("on", on); $mode.textContent = on ? "Cancel" : "Add comment";
    if (on) { closePop(); $panel.classList.remove("open"); }
  }
  $mode.onclick = (e) => { e.stopPropagation(); setPinMode(!pinMode); };
  document.getElementById("pcCancel").onclick = (e) => { e.stopPropagation(); setPinMode(false); };
  document.getElementById("pcList").onclick = (e) => { e.stopPropagation(); setPinMode(false); closePop(); $panel.classList.toggle("open"); renderPanel(); };
  document.getElementById("pcClose").onclick = () => $panel.classList.remove("open");
  document.getElementById("pcShowDone").onchange = (e) => { showResolved = e.target.checked; render(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { setPinMode(false); closePop(); $panel.classList.remove("open"); } });

  /* tap-to-pin: capture phase so the page's own click handlers don't fire in pin mode */
  document.addEventListener("click", (e) => {
    if (!pinMode || e.target.closest(".pc-fab,.pc-pop,.pc-panel,.pc-hint,nav")) return;
    const sec = e.target.closest("section[id], #top");
    if (!sec || !SECTIONS.includes(sec.id)) return;
    e.preventDefault(); e.stopPropagation();
    const r = sec.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    setPinMode(false);
    openComposer({ section: sec.id, x, y }, e.clientX, e.clientY);
  }, true);

  /* ---------- popovers ---------- */
  let $pop = null;
  function closePop() { $pop && $pop.remove(); $pop = null; openId = null; document.querySelectorAll(".pc-pin.open").forEach((p) => p.classList.remove("open")); document.querySelector(".pc-ghost")?.remove(); }
  document.addEventListener("click", (e) => { if ($pop && !e.target.closest(".pc-pop,.pc-pin,.pc-item,.pc-fab")) closePop(); });

  function placePop(el, x, y) {
    document.body.appendChild(el);
    const w = el.offsetWidth, h = el.offsetHeight, vw = innerWidth, vh = innerHeight;
    el.style.left = Math.max(8, Math.min(vw - w - 8, x + 14)) + "px";
    el.style.top = Math.max(76, Math.min(vh - h - 8, y - 20)) + "px";
  }

  function formHTML(btn) {
    return `<form class="pc-form">
      <input name="author" maxlength="40" placeholder="Your name" value="${esc(store.get("pc_name", ""))}" required>
      <textarea name="body" rows="3" maxlength="1000" placeholder="Write a comment or change request…" required></textarea>
      <div class="row"><span class="pc-err"></span><button class="pc-send" type="submit">${btn}</button></div></form>`;
  }

  function bindForm(form, payload, onDone) {
    const nameInput = form.author, bodyInput = form.body;
    (nameInput.value ? bodyInput : nameInput).focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const author = nameInput.value.trim(), body = bodyInput.value.trim();
      if (!author) { nameInput.focus(); return; }
      if (!body) { bodyInput.focus(); return; }
      const btn = form.querySelector(".pc-send"); btn.disabled = true;
      try {
        store.set("pc_name", author);
        const { comment } = await api("POST", { ...payload, author, body });
        comments.push(comment); onDone(comment); render();
      } catch (err) { form.querySelector(".pc-err").textContent = err.message; btn.disabled = false; }
    };
    bodyInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) form.requestSubmit(); });
  }

  function openComposer(pos, cx, cy) {
    closePop();
    const sec = secEl(pos.section), ghost = document.createElement("div");
    ghost.className = "pc-pin pc-ghost"; ghost.style.left = pos.x + "%"; ghost.style.top = pos.y + "%"; ghost.textContent = "+";
    sec.appendChild(ghost);
    $pop = document.createElement("div"); $pop.className = "pc-pop";
    $pop.innerHTML = `<header>New comment · ${LABEL[pos.section]}<button aria-label="Close">×</button></header>${formHTML("Post")}`;
    $pop.querySelector("header button").onclick = closePop;
    placePop($pop, cx, cy);
    bindForm($pop.querySelector("form"), pos, (c) => { closePop(); toast("Comment posted"); setTimeout(() => openThread(c.id), 60); });
  }

  function openThread(id, fromPanel) {
    const c = comments.find((x) => x.id === id); if (!c) return;
    closePop(); openId = id;
    const pin = document.querySelector(`.pc-pin[data-id="${id}"]`);
    if (fromPanel && pin) { $panel.classList.remove("open"); pin.scrollIntoView({ behavior: "smooth", block: "center" }); }
    const show = () => {
      const p = document.querySelector(`.pc-pin[data-id="${id}"]`); p?.classList.add("open");
      const r = p ? p.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3 };
      $pop = document.createElement("div"); $pop.className = "pc-pop";
      const msgs = [c, ...replies(id)];
      $pop.innerHTML = `<header>${LABEL[c.section]} · ${c.resolved ? "Resolved" : "Open"}<button aria-label="Close">×</button></header>
        <div class="pc-body">${msgs.map((m) => `<div class="pc-msg"><b>${esc(m.author)}</b><time>${ago(m.created_at)}</time><p>${esc(m.body)}</p>
          <div class="acts">${m === c ? `<button class="pc-link" data-act="resolve">${c.resolved ? "Reopen" : "✓ Resolve"}</button>` : ""}
          ${m.mine ? `<button class="pc-link red" data-act="del" data-id="${m.id}">Delete</button>` : ""}</div></div>`).join("")}</div>
        ${formHTML("Reply")}`;
      $pop.querySelector("header button").onclick = closePop;
      $pop.querySelector("[data-act=resolve]").onclick = async () => {
        try { await api("PATCH", { id, resolved: !c.resolved }); c.resolved = !c.resolved; render(); openThread(id); toast(c.resolved ? "Marked as resolved" : "Reopened"); }
        catch (err) { toast(err.message); }
      };
      $pop.querySelectorAll("[data-act=del]").forEach((b) => b.onclick = async () => {
        const did = Number(b.dataset.id);
        if (!confirmDelete(b)) return;
        try { await api("DELETE", null, "?id=" + did); comments = comments.filter((m) => m.id !== did && m.parent_id !== did); render(); did === id ? closePop() : openThread(id); toast("Deleted"); }
        catch (err) { toast(err.message); }
      });
      placePop($pop, r.left + 16, r.top);
      const form = $pop.querySelector("form"); form.body.placeholder = "Reply…"; form.body.rows = 2;
      bindForm(form, { parent_id: id }, () => openThread(id));
    };
    fromPanel && pin ? setTimeout(show, 450) : show();
  }

  /* two-tap delete instead of a browser confirm() dialog */
  function confirmDelete(btn) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = "1"; btn.textContent = "Tap again to delete";
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = "Delete"; }, 3000);
    return false;
  }

  /* ---------- render ---------- */
  function render() {
    document.querySelectorAll(".pc-pin:not(.pc-ghost)").forEach((p) => p.remove());
    const list = roots().filter((c) => showResolved || !c.resolved);
    list.forEach((c, i) => {
      const sec = secEl(c.section); if (!sec) return;
      const pin = document.createElement("div");
      const n = replies(c.id).length;
      pin.className = "pc-pin" + (c.resolved ? " done" : "") + (openId === c.id ? " open" : "");
      pin.dataset.id = c.id; pin.style.left = c.x + "%"; pin.style.top = c.y + "%";
      pin.title = `${c.author}: ${c.body}`;
      pin.innerHTML = esc((c.author.trim()[0] || "?").toUpperCase()) + (n ? `<i>${n}</i>` : "");
      pin.onclick = (e) => { e.stopPropagation(); openId === c.id ? closePop() : openThread(c.id); };
      sec.appendChild(pin);
    });
    const open = roots().filter((c) => !c.resolved).length;
    document.getElementById("pcCount").textContent = open || "";
    if ($panel.classList.contains("open")) renderPanel();
  }

  function renderPanel() {
    const box = document.getElementById("pcItems");
    if (!apiOk) { box.innerHTML = `<div class="pc-empty">Comments aren't available right now.</div>`; return; }
    const list = roots().filter((c) => showResolved || !c.resolved).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    box.innerHTML = list.length ? list.map((c) => `<div class="pc-item${c.resolved ? " done" : ""}" data-id="${c.id}">
        <small><b>${esc(c.author)}</b> · ${LABEL[c.section]} · ${ago(c.created_at)}${replies(c.id).length ? ` · ${replies(c.id).length} repl${replies(c.id).length > 1 ? "ies" : "y"}` : ""}</small>
        <p>${esc(c.body)}</p></div>`).join("")
      : `<div class="pc-empty">No ${showResolved ? "" : "open "}comments yet.<br>Tap <b>Add comment</b>, then tap anywhere on the page.</div>`;
    box.querySelectorAll(".pc-item").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openThread(Number(el.dataset.id), true); });
  }

  /* ---------- sync ---------- */
  async function load() {
    if (document.hidden) return;
    try {
      const { comments: rows } = await api("GET");
      const typing = $pop && $pop.querySelector("textarea") === document.activeElement;
      comments = rows; apiOk = true;
      if (!typing) render(); else document.getElementById("pcCount").textContent = roots().filter((c) => !c.resolved).length || "";
    } catch (e) { apiOk = false; if ($panel.classList.contains("open")) renderPanel(); }
  }
  load(); setInterval(load, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  addEventListener("resize", () => { if ($pop && openId) openThread(openId); });
})();
