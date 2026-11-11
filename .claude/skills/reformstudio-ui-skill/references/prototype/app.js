// ReformStudio Sync: alapok, keret, recepció, vendégmonitor
const S = {
  me: 1, view: "reception", sel: 1, log: [], q: "",
  theme: "light", accent: "#0f766e", collapsed: false, lastTap: -1
};
const $ = id => document.getElementById(id);
const fmtD = d => d.toLocaleDateString("hu-HU", { month: "short", day: "numeric" });
const ft = n => n.toLocaleString("hu-HU") + " Ft";
const ini = n => n.split(" ").map(x => x[0]).join("").slice(0, 2);
const firstName = n => n.split(" ").slice(1).join(" ");
const nowStr = () => new Date().toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
const daysLeft = m => Math.ceil((m.until - TODAY) / 864e5);
const clsById = id => CLASSES.find(c => c.id === id);
const member = id => MEMBERS.find(m => m.id === id);
const me = () => STAFF.find(s => s.id === S.me);
const roleOf = id => ROLES.find(r => r.id === id);
const can = p => roleOf(me().role).perms.includes(p);
const ico = n => `<svg class="i" aria-hidden="true" focusable="false"><use href="#i-${n}"/></svg>`;
const dis = p => can(p) ? "" : `disabled title="Nincs jogosultságod ehhez"`;

function status(m) {
  const d = daysLeft(m);
  if (d < 0) return { k: "bad", t: "Lejárt", ok: false, why: `A bérlet ${fmtD(m.until)} napon lejárt.` };
  if (m.left === 0) return { k: "bad", t: "Nincs alkalom", ok: false, why: "A bérleten nincs több alkalom." };
  if (d <= 3 || (m.left !== null && m.left <= 1)) return { k: "warn", t: "Hamarosan lejár", ok: true };
  return { k: "ok", t: "Érvényes", ok: true };
}
const badge = st => `<span class="badge ${st.k}">${st.t}</span>`;
const passLeft = m => m.left === null ? `${Math.max(daysLeft(m), 0)} nap` : `${m.left} / ${m.total} alkalom`;

let tt;
function toast(s) { const t = $("toast"); t.textContent = s; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2800); }
let lastFocus = null;
const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"],a[href]';
function openModal(title, body, foot) {
  lastFocus = document.activeElement;
  $("modal").innerHTML = `<div class="modal-h"><h2 id="modalTitle" style="font-size:15px;font-weight:600">${title}</h2></div><div class="modal-b">${body}</div><div class="modal-f">${foot}</div>`;
  $("overlay").classList.add("open");
  $("app").inert = true;
  $("modal").querySelectorAll("thead th").forEach(th => th.setAttribute("scope", "col"));
  labelTables($("modal"));
  const f = $("modal").querySelector('input[type=radio]:checked') || $("modal").querySelector(FOCUSABLE);
  if (f) f.focus();
}
function closeModal() {
  $("overlay").classList.remove("open"); $("app").inert = false;
  if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus(); else $("view").focus();
}
$("overlay").addEventListener("click", e => { if (e.target.id === "overlay") closeModal(); });
document.addEventListener("keydown", e => {
  if (!$("overlay").classList.contains("open")) return;
  if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
  if (e.key !== "Tab") return;
  const els = [...$("modal").querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (!els.length) return;
  const a = els[0], z = els[els.length - 1];
  if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
});

/* ---------- Keret ---------- */
const VIEWS = {};
const TITLES = { reception: "Recepció", monitor: "Vendégmonitor", schedule: "Órarend", members: "Vendégek", passes: "Bérletek és termékek", staff: "Felhasználókezelés", roles: "Szerepkörök és jogok", settings: "Beállítások" };

function render(moveFocus) {
  const u = me();
  $("meName").textContent = u.name; $("meAv").textContent = ini(u.name); $("meRole").textContent = roleOf(u.role).name;
  const inside = MEMBERS.filter(m => m.inside).length;
  document.querySelectorAll("#nav a").forEach(a => {
    const on = a.dataset.view === S.view;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    const p = a.dataset.perm, locked = p && !can(p);
    let label = TITLES[a.dataset.view];
    if (a.dataset.view === "reception") label += `, ${inside} vendég bent`;
    if (locked) { a.setAttribute("aria-disabled", "true"); label += ", admin jogosultság szükséges"; } else a.removeAttribute("aria-disabled");
    a.setAttribute("aria-label", label);
    let l = a.querySelector(".lock");
    if (locked && !l) a.insertAdjacentHTML("beforeend", `<span class="lock hide-c">${ico("lock")}</span>`);
    if (!locked && l) l.remove();
  });
  $("navIn").textContent = inside;
  $("crumb").textContent = TITLES[S.view];
  document.title = `${TITLES[S.view]} · ReformStudio Sync`;
  const ae = document.activeElement;
  const key = ae && $("view").contains(ae) ? (ae.id ? `#${ae.id}` : ae.dataset.act ? `[data-act="${ae.dataset.act}"]${ae.dataset.id ? `[data-id="${ae.dataset.id}"]` : ""}` : null) : null;
  $("view").innerHTML = VIEWS[S.view]();
  bindView();
  if (moveFocus) $("view").focus();
  else if (key) { const n = $("view").querySelector(key) || (ae.dataset.act === "in" || ae.dataset.act === "out" ? $("view").querySelector(`[data-act="${ae.dataset.act === "in" ? "out" : "in"}"][data-id="${ae.dataset.id}"]`) : null); (n && !n.disabled ? n : $("view")).focus(); }
}
function bindView() {
  document.querySelectorAll("#view thead th, #modal thead th").forEach(th => th.setAttribute("scope", "col"));
  labelTables($("view"));
  document.querySelectorAll("[data-act]").forEach(el => el.onclick = e => { e.stopPropagation(); ACTIONS[el.dataset.act](el.dataset.id, el); });
  document.querySelectorAll("tr[data-sel]").forEach(tr => {
    tr.tabIndex = 0;
    const open = () => { const v = S.view; S.sel = +tr.dataset.sel; S.view = "reception"; render(v !== "reception"); if (v === "reception") { const n = document.querySelector(`tr[data-sel="${S.sel}"]`); if (n) n.focus(); } };
    tr.onclick = open;
    tr.onkeydown = e => { if (e.target === tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } };
  });
  const q = $("q"); if (q) { q.oninput = () => { S.q = q.value; const p = q.selectionStart; render(); const n = $("q"); n.focus(); n.setSelectionRange(p, p); }; }
  if (VIEWS[S.view].bind) VIEWS[S.view].bind();
}
document.querySelectorAll("#nav a").forEach(a => a.onclick = e => {
  e.preventDefault();
  const p = a.dataset.perm;
  if (p && !can(p)) { toast("Ehhez a menüponthoz admin jogosultság kell"); return; }
  S.view = a.dataset.view;
  if (mqMobile.matches) closeNav(false);
  render(true);
});
$("collapse").onclick = () => setCollapsed(!S.collapsed);
function setCollapsed(v) {
  S.collapsed = v; $("app").classList.toggle("collapsed", v && !mqMobile.matches);
  const t = v ? "Menü kinyitása" : "Menü összecsukása";
  $("collapse").title = t; $("collapse").setAttribute("aria-label", t); $("collapse").setAttribute("aria-expanded", String(!v));
}

/* ---------- Reszponzív: tablet = ikonos oldalsáv, mobil = kihúzható menü ---------- */
const mqMobile = matchMedia("(max-width:720px)"), mqTablet = matchMedia("(max-width:1100px)");
function openNav() {
  $("app").classList.add("nav-open"); $("menuBtn").setAttribute("aria-expanded", "true"); $("menuBtn").setAttribute("aria-label", "Menü bezárása");
  document.querySelector(".main").inert = true;
  (document.querySelector("#nav a.active") || document.querySelector("#nav a")).focus();
}
function closeNav(returnFocus) {
  if (!$("app").classList.contains("nav-open")) return;
  $("app").classList.remove("nav-open"); $("menuBtn").setAttribute("aria-expanded", "false"); $("menuBtn").setAttribute("aria-label", "Menü megnyitása");
  document.querySelector(".main").inert = false;
  if (returnFocus) $("menuBtn").focus();
}
$("menuBtn").onclick = () => $("app").classList.contains("nav-open") ? closeNav(true) : openNav();
$("scrim").onclick = () => closeNav(true);
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("app").classList.contains("nav-open")) closeNav(true); });
function onLayoutChange() {
  closeNav(false);
  setCollapsed(mqTablet.matches && !mqMobile.matches);
}
mqMobile.addEventListener("change", onLayoutChange);
mqTablet.addEventListener("change", onLayoutChange);

// Mobilon a táblázatsorok kártyaként jelennek meg, a cellák a fejléc szövegét kapják feliratként
function labelTables(root) {
  root.querySelectorAll("table").forEach(t => {
    const heads = [...t.querySelectorAll("thead th")].map(th => th.textContent.replace(/\s+/g, " ").trim());
    if (!heads.length) return;
    t.querySelectorAll("tbody tr").forEach(tr => [...tr.children].forEach((cell, i) => {
      if (cell.tagName === "TD" && cell.colSpan === 1 && heads[i]) cell.dataset.label = heads[i];
    }));
  });
}
function applyTheme() {
  document.documentElement.dataset.theme = S.theme;
  document.documentElement.style.setProperty("--accent", S.accent);
  const l = parseInt(S.accent.slice(1, 3), 16) * .299 + parseInt(S.accent.slice(3, 5), 16) * .587 + parseInt(S.accent.slice(5, 7), 16) * .114;
  document.documentElement.style.setProperty("--accent-fg", l > 160 ? "#111" : "#fff");
  $("themeBtn").innerHTML = ico(S.theme === "dark" ? "sun" : "moon");
  $("themeBtn").setAttribute("aria-pressed", String(S.theme === "dark"));
}
$("themeBtn").onclick = () => { S.theme = S.theme === "dark" ? "light" : "dark"; applyTheme(); if (S.view === "settings") render(); };
function fillRoleSwitch() {
  $("roleSwitch").innerHTML = STAFF.filter(s => s.active).map(s => `<option value="${s.id}" ${s.id === S.me ? "selected" : ""}>${s.name} (${roleOf(s.role).name})</option>`).join("");
}
$("roleSwitch").onchange = e => {
  S.me = +e.target.value;
  const a = document.querySelector(`#nav a[data-view="${S.view}"]`);
  if (a && a.dataset.perm && !can(a.dataset.perm)) S.view = "reception";
  render(); toast(`Belépve mint ${me().name}, ${roleOf(me().role).name}`);
};
$("logout").onclick = () => toast("A bemutatóban a kijelentkezés nem aktív");
function tick() { $("clock").textContent = new Date().toLocaleDateString("hu-HU", { weekday: "long", month: "long", day: "numeric" }) + ", " + nowStr(); document.querySelectorAll(".mon-clock").forEach(c => c.textContent = nowStr()); }

/* ---------- Beléptetés ---------- */
function checkIn(m, viaTap) {
  const st = status(m);
  if (st.ok) {
    m.inside = true; m.locker = m.locker || 10 + Math.floor(Math.random() * 40);
    if (m.left !== null) m.left--;
    m.visits.unshift([fmtD(TODAY), clsById(m.cls).n]);
  }
  S.log.unshift({ id: m.id, time: nowStr(), ok: st.ok, cls: m.cls, how: viaTap ? "Kártya" : "Kézi" });
  S.sel = m.id;
  if (viaTap) S.monitor = { id: m.id, at: Date.now() };
  render();
  if (viaTap) showMonitor(m, st);
  toast(st.ok ? `${m.name} beléptetve, szekrény: ${m.locker}` : `${m.name}: ${st.t.toLowerCase()}, a kapu nem nyitott`);
}
function checkOut(m) {
  m.inside = false; const l = S.log.find(x => x.id === m.id && x.ok && !x.out); if (l) l.out = nowStr();
  toast(`${m.name} kiléptetve, a ${m.locker}. szekrény felszabadult`); m.locker = null; render();
}

/* ---------- Vendégmonitor ---------- */
function nextClasses() {
  const n = new Date(), now = n.getHours() * 60 + n.getMinutes();
  let i = CLASSES.findIndex(c => { const [h, mm] = c.t.split(":"); return h * 60 + +mm >= now; });
  return i < 0 ? CLASSES.slice(-3) : CLASSES.slice(i, i + 3);
}
function monitorHTML() {
  return `<div class="monitor-frame" role="group" aria-label="Vendégmonitor kijelző"><div class="monitor">
    <div class="mon-idle">
      <div class="mon-top"><div class="mon-brand">REFORM STUDIO</div><div class="mon-clock" aria-hidden="true">${nowStr()}</div></div>
      <div class="mon-center"><div class="mon-reader" aria-hidden="true"></div><p class="mon-h">Érintsd a kártyádat<br>vagy a telefonodat az olvasóhoz</p><p>Az olvasó a pult jobb oldalán található.</p></div>
      <ul class="mon-next" aria-label="Következő órák" style="list-style:none">${nextClasses().map(c => `<li><div><b>${c.t}  ${c.n}</b>${c.room}</div></li>`).join("")}</ul>
    </div>
    <div class="mon-msg" aria-hidden="true"><div class="bar"></div><div class="mon-timer"></div></div>
  </div></div>`;
}
let mt;
function showMonitor(m, st) {
  const c = clsById(m.cls);
  const inner = st.ok
    ? `<div class="lead">Üdv újra</div><div class="name">${firstName(m.name)}</div>
       <div class="mon-cls"><div class="t">${c.t}</div><div><div class="n">${c.n}</div><div class="d">${c.room} · ${c.coach}</div></div></div>
       <div class="mon-facts"><div><span>Szekrény</span><b>${m.locker}</b></div><div><span>Bérlet</span><b>${passLeft(m)}</b></div><div><span>Érvényes</span><b>${fmtD(m.until)}</b></div></div>`
    : `<div class="lead">A belépés nem sikerült</div><div class="name">${firstName(m.name)}</div>
       <div class="mon-cls"><div class="t">!</div><div><div class="n">${st.t} bérlet</div><div class="d">${st.why} Kérjük, fordulj a recepcióhoz.</div></div></div>
       <div class="mon-facts"><div><span>Kártya</span><b>${m.card}</b></div><div><span>Bérlet</span><b>${m.pass}</b></div><div><span>Teendő</span><b>Recepció</b></div></div>`;
  document.querySelectorAll(".mon-msg").forEach(el => {
    el.className = "mon-msg show" + (st.ok ? "" : " denied");
    el.innerHTML = `<div class="bar"></div><div style="padding-left:2%;display:flex;flex-direction:column;height:100%">${inner}</div><div class="mon-timer"></div>`;
    const t = el.querySelector(".mon-timer"); t.style.width = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => { t.style.transition = "width 6s linear"; t.style.width = "100%"; }));
  });
  clearTimeout(mt); mt = setTimeout(() => document.querySelectorAll(".mon-msg").forEach(el => el.classList.remove("show")), 6000);
}
function simulateTap() {
  let pool = MEMBERS.filter(m => !m.inside);
  if (!pool.length) { MEMBERS.forEach(m => m.inside = false); pool = MEMBERS; }
  let i; do { i = Math.floor(Math.random() * pool.length); } while (pool.length > 1 && pool[i].id === S.lastTap);
  S.lastTap = pool[i].id; checkIn(pool[i], true);
}

/* ---------- Recepció nézet ---------- */
VIEWS.reception = () => {
  const m = member(S.sel), st = status(m), c = clsById(m.cls);
  const q = S.q.trim().toLowerCase();
  const rows = q
    ? MEMBERS.filter(x => (x.name + x.card + x.phone).toLowerCase().includes(q)).map(x => `
      <tr class="click ${x.id === S.sel ? "sel" : ""}" data-sel="${x.id}"><td class="mono">${x.card}</td>
      <td><div class="nm"><div class="avatar">${ini(x.name)}</div>${x.name}</div></td><td>${clsById(x.cls).t} ${clsById(x.cls).n}</td><td>${x.pass}</td><td>${badge(status(x))}</td><td></td></tr>`).join("")
    : S.log.map(l => { const x = member(l.id); return `
      <tr class="click ${x.id === S.sel ? "sel" : ""}" data-sel="${x.id}"><td class="mono">${l.time}${l.out ? "–" + l.out : ""}</td>
      <td><div class="nm"><div class="avatar">${ini(x.name)}</div>${x.name}</div></td><td>${clsById(l.cls).t} ${clsById(l.cls).n}</td><td class="muted">${l.how}</td>
      <td>${l.ok ? (l.out ? `<span class="badge plain">Távozott</span>` : `<span class="badge ok">Bent van</span>`) : `<span class="badge bad">Elutasítva</span>`}</td>
      <td class="num">${l.ok && !l.out && x.inside ? `<button type="button" class="btn-link" data-act="out" data-id="${x.id}" aria-label="${x.name} kiléptetése" ${dis("checkin")}>Kiléptetés</button>` : ""}</td></tr>`; }).join("");
  const inside = MEMBERS.filter(x => x.inside).length;
  const pct = m.left !== null ? m.left / m.total * 100 : Math.max(0, Math.min(100, daysLeft(m) / m.total * 100));
  return `
  <div class="page-head"><div><h1>Recepció</h1><p>Beléptetés, bérletek és mai foglalások egy helyen.</p></div>
    <div class="actions"><button class="btn-secondary" data-act="tap">${ico("nfc")}Kártya olvasása (szimuláció)</button>
    <button class="btn-primary" data-act="newMember" ${dis("members")}>${ico("plus")}Új vendég</button></div></div>
  <section class="stats" aria-labelledby="statsH"><h2 class="sr-only" id="statsH">Napi összesítő</h2>
    <div class="card stat"><span>Bent tartózkodik</span><b>${inside}</b><small>${CLASSES.reduce((a, c) => a + c.cap, 0)} hely a mai órákon</small></div>
    <div class="card stat"><span>Mai belépések</span><b>${S.log.filter(l => l.ok).length}</b><small>${S.log.filter(l => l.how === "Kártya").length} kártyával</small></div>
    <div class="card stat"><span>Elutasított belépés</span><b>${S.log.filter(l => !l.ok).length}</b><small>lejárt vagy elfogyott bérlet</small></div>
    <div class="card stat"><span>Lejáró bérletek</span><b>${MEMBERS.filter(x => status(x).k !== "ok").length}</b><small>3 napon belül vagy lejárt</small></div>
  </section>
  <div class="grid g-rec">
    <div class="grid" style="align-content:start">
      <section class="card" aria-labelledby="logH"><div class="card-h"><h2 id="logH">${q ? "Keresési találatok" : "Mai belépések"}</h2>
        <div class="r" role="search"><div class="search">${ico("search")}<label class="sr-only" for="q">Vendég keresése</label><input class="input" id="q" type="search" placeholder="Név, kártyaszám vagy telefon" value="${S.q}" autocomplete="off"></div></div></div>
        <div class="table-wrap"><table><caption class="sr-only">${q ? "Keresési találatok. Egy sorra lépve Enterrel megnyílik a vendég." : "Mai belépések. Egy sorra lépve Enterrel megnyílik a vendég."}</caption><thead><tr><th>${q ? "Kártya" : "Idő"}</th><th>Vendég</th><th>Óra</th><th>${q ? "Bérlet" : "Mód"}</th><th>Állapot</th><th><span class="sr-only">Művelet</span></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty">${q ? "Nincs találat." : "Még nincs belépés ma."}</td></tr>`}</tbody></table></div></section>
      <section class="card" aria-labelledby="todayH"><div class="card-h"><h2 id="todayH">Mai órák</h2><div class="r"><button type="button" class="btn-link" data-act="go" data-id="schedule">Teljes órarend</button></div></div>
        <div class="table-wrap"><table><caption class="sr-only">Mai órák foglaltsággal</caption><thead><tr><th>Idő</th><th>Óra</th><th>Terem</th><th>Edző</th><th class="num">Foglalt</th></tr></thead><tbody>
        ${CLASSES.map(x => `<tr><td class="mono">${x.t}</td><td>${x.n}</td><td class="muted">${x.room}</td><td class="muted">${x.coach}</td>
        <td class="num">${x.booked >= x.cap ? `<span class="badge warn plain">Telt ház</span>` : `${x.booked} / ${x.cap}`}</td></tr>`).join("")}</tbody></table></div></section>
    </div>
    <div class="grid" style="align-content:start">
      <section class="card" aria-labelledby="guestH"><div class="card-h"><h2 id="guestH">Vendég adatai</h2><div class="r">${badge(st)}</div></div><div class="card-b">
        <div class="person"><div class="avatar" aria-hidden="true">${ini(m.name)}</div><div><h3>${m.name}</h3><p>${m.card} · ${m.phone}</p></div></div>
        ${st.ok ? "" : `<div class="alert" role="alert">${st.why} Beléptetés előtt hosszabbítás vagy új bérlet szükséges.</div>`}
        <dl class="dl">
          <dt>Bérlet</dt><dd>${m.pass}</dd>
          <dt>Érvényes</dt><dd>${fmtD(m.until)} ${daysLeft(m) < 0 ? `<span class="muted">(${-daysLeft(m)} napja lejárt)</span>` : `<span class="muted">(még ${daysLeft(m)} nap)</span>`}</dd>
          <dt>Fennmaradó</dt><dd>${passLeft(m)}<div class="progress ${st.k === "ok" ? "" : st.k}" aria-hidden="true"><i style="width:${pct}%"></i></div></dd>
          <dt>Mai foglalás</dt><dd>${c.t} ${c.n} <span class="muted">· ${c.room}</span></dd>
          <dt>Szekrény</dt><dd>${m.inside ? m.locker : `<span class="muted">nincs kiadva</span>`}</dd>
          <dt>Vendég óta</dt><dd>${m.since}</dd>
        </dl>
        <div class="btnrow">
          ${m.inside ? `<button type="button" class="btn-secondary" data-act="out" data-id="${m.id}" ${dis("checkin")}>Kiléptetés</button>`
                     : `<button type="button" class="btn-primary" data-act="in" data-id="${m.id}" ${st.ok ? dis("checkin") : "disabled title='Érvénytelen bérlet'"}>Beléptetés</button>`}
          <button type="button" class="${st.ok ? "btn-secondary" : "btn-primary"}" data-act="extend" data-id="${m.id}" ${dis("extend")}>Hosszabbítás</button>
          <button type="button" class="btn-secondary" data-act="buy" data-id="${m.id}" ${dis("sell")}>Új vásárlás</button>
        </div>
        <div class="btnrow"><button type="button" class="btn-link" data-act="book" data-id="${m.id}" ${dis("book")}>Foglalás módosítása</button>
          <button type="button" class="btn-link" data-act="history" data-id="${m.id}">Előzmények</button></div>
      </div></section>
      <section class="card" aria-labelledby="monH"><div class="card-h"><h2 id="monH">Vendégmonitor</h2><span class="sub">élő előnézet</span><div class="r"><button type="button" class="btn-link" data-act="go" data-id="monitor">Teljes nézet</button></div></div>
        <div class="card-b">${monitorHTML()}</div></section>
    </div>
  </div>`;
};

/* ---------- Vendégmonitor nézet ---------- */
VIEWS.monitor = () => `
  <div class="page-head"><div><h1>Vendégmonitor</h1><p>A beléptetőkapu melletti kijelző. Csippantás után 6 másodpercig mutatja a vendég adatait, aztán visszaáll.</p></div>
    <div class="actions"><button class="btn-primary" data-act="tap">${ico("nfc")}Kártya olvasása (szimuláció)</button></div></div>
  ${monitorHTML()}
  <div class="grid g-2" style="margin:16px auto 0;max-width:960px">
    <section class="card card-b" aria-labelledby="seeH"><h2 class="lbl" id="seeH">Mit lát a vendég</h2><p class="small" style="margin-top:6px">Keresztnév, a mai foglalt óra időpontja, terme és edzője, a szekrény száma, a hátralévő alkalmak vagy napok, és a lejárat.</p></section>
    <section class="card card-b" aria-labelledby="hideH"><h2 class="lbl" id="hideH">Mit nem lát</h2><p class="small" style="margin-top:6px">Teljes nevet, telefonszámot, árakat és vásárlásokat nem. Érvénytelen bérletnél a kapu zárva marad, és a vendég a recepcióra kerül.</p></section>
  </div>`;
