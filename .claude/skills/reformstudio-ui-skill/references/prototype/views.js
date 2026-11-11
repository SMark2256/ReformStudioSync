// ReformStudio Sync: további nézetek, műveletek, modális ablakok
S.mf = "all";

VIEWS.members = () => {
  const f = { all: () => true, ok: m => status(m).k === "ok", warn: m => status(m).k === "warn", bad: m => status(m).k === "bad" }[S.mf];
  const list = MEMBERS.filter(f);
  const seg = [["all", "Mind"], ["ok", "Érvényes"], ["warn", "Hamarosan lejár"], ["bad", "Lejárt / elfogyott"]]
    .map(([k, l]) => `<label><input type="radio" name="mf" value="${k}" ${S.mf === k ? "checked" : ""}><span>${l}</span></label>`).join("");
  return `
  <div class="page-head"><div><h1>Vendégek</h1><p>${MEMBERS.length} regisztrált vendég. Egy sorra kattintva vagy Enterrel a recepción nyílik meg.</p></div>
    <div class="actions"><button type="button" class="btn-primary" data-act="newMember" ${dis("members")}>${ico("plus")}Új vendég</button></div></div>
  <section class="card" aria-labelledby="listH"><div class="card-h"><h2 class="sr-only" id="listH">Vendéglista</h2><fieldset class="seg" id="mf"><legend class="sr-only">Szűrés bérletállapot szerint</legend>${seg}</fieldset><span class="sub" aria-live="polite">${list.length} találat</span></div>
  <div class="table-wrap"><table><caption class="sr-only">Vendégek, szűrve: ${{ all: "mind", ok: "érvényes", warn: "hamarosan lejár", bad: "lejárt vagy elfogyott" }[S.mf]}</caption><thead><tr><th>Kártya</th><th>Név</th><th>Telefon</th><th>Bérlet</th><th>Fennmaradó</th><th>Lejárat</th><th>Állapot</th></tr></thead><tbody>
  ${list.map(m => `<tr class="click" data-sel="${m.id}"><td class="mono">${m.card}</td><td><div class="nm"><div class="avatar" aria-hidden="true">${ini(m.name)}</div>${m.name}</div></td>
    <td class="muted">${m.phone}</td><td>${m.pass}</td><td>${passLeft(m)}</td><td>${fmtD(m.until)}</td><td>${badge(status(m))}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">Nincs ilyen vendég.</td></tr>`}
  </tbody></table></div></section>`;
};
VIEWS.members.bind = () => document.querySelectorAll("#mf input").forEach(i => i.onchange = () => { S.mf = i.value; render(); const n = document.querySelector(`#mf input[value="${S.mf}"]`); if (n) n.focus(); });

VIEWS.passes = () => {
  const edit = can("prices");
  return `
  <div class="page-head"><div><h1>Bérletek és termékek</h1><p>${edit ? "Az árak közvetlenül a táblázatban módosíthatók." : "Az árak módosításához admin jogosultság kell."}</p></div>
    <div class="actions"><button type="button" class="btn-primary" data-act="newProduct" ${dis("prices")}>${ico("plus")}Új termék</button></div></div>
  <section class="card" aria-labelledby="prodH"><h2 class="sr-only" id="prodH">Terméklista</h2><div class="table-wrap"><table><caption class="sr-only">Bérletek és termékek árakkal</caption><thead><tr><th>Megnevezés</th><th>Leírás</th><th class="num">Érvényesség</th><th class="num">Alkalom</th><th class="num">Ár</th><th class="num">Eladva (30 nap)</th></tr></thead><tbody>
  ${PRODUCTS.map((p, i) => `<tr><td><b>${p.name}</b>${p.addon ? ` <span class="badge plain">Kiegészítő</span>` : ""}</td><td class="muted">${p.desc}</td>
    <td class="num">${p.days} nap</td><td class="num">${p.occ ?? "Korlátlan"}</td>
    <td class="num">${edit ? `<input class="input sm" inputmode="numeric" data-price="${p.id}" value="${p.price}" aria-label="${p.name} ára forintban"> Ft` : ft(p.price)}</td><td class="num">${[41, 23, 18, 64, 12, 7][i] ?? 0}</td></tr>`).join("")}
  </tbody></table></div></section>`;
};
VIEWS.passes.bind = () => document.querySelectorAll("[data-price]").forEach(i => i.onchange = () => {
  const p = PRODUCTS.find(x => x.id === i.dataset.price), v = parseInt(i.value.replace(/\D/g, ""), 10);
  if (v > 0) { p.price = v; toast(`${p.name} új ára: ${ft(v)}`); } else i.value = p.price;
});

VIEWS.schedule = () => `
  <div class="page-head"><div><h1>Órarend</h1><p>${fmtD(TODAY)}, ${CLASSES.length} óra, ${CLASSES.reduce((a, c) => a + c.booked, 0)} foglalás</p></div>
    <div class="actions"><button type="button" class="btn-primary" ${dis("schedule")} data-act="soon">${ico("plus")}Új óra</button></div></div>
  <section class="card" aria-labelledby="schH"><h2 class="sr-only" id="schH">Mai órák</h2><div class="table-wrap"><table><caption class="sr-only">Mai órák telítettséggel</caption><thead><tr><th>Idő</th><th>Óra</th><th>Terem</th><th>Edző</th><th style="width:28%">Telítettség</th><th class="num">Foglalt</th></tr></thead><tbody>
  ${CLASSES.map(c => `<tr><td class="mono">${c.t}</td><td><b>${c.n}</b></td><td class="muted">${c.room}</td><td class="muted">${c.coach}</td>
    <td><div class="progress ${c.booked >= c.cap ? "warn" : ""}" role="progressbar" aria-label="${c.n} telítettsége" aria-valuemin="0" aria-valuemax="${c.cap}" aria-valuenow="${c.booked}"><i style="width:${c.booked / c.cap * 100}%"></i></div></td>
    <td class="num">${c.booked} / ${c.cap}</td></tr>`).join("")}
  </tbody></table></div></section>`;

VIEWS.staff = () => `
  <div class="page-head"><div><h1>Felhasználókezelés</h1><p>A stúdió munkatársai és a szerepkörük. A szerepkör határozza meg, mit érhetnek el.</p></div>
    <div class="actions"><button type="button" class="btn-secondary" data-act="go" data-id="roles">Jogosultságok</button><button type="button" class="btn-primary" data-act="newUser">${ico("plus")}Új felhasználó</button></div></div>
  <section class="card" aria-labelledby="staffH"><h2 class="sr-only" id="staffH">Munkatársak</h2><div class="table-wrap"><table><caption class="sr-only">Munkatársak szerepkörrel és állapottal</caption><thead><tr><th>Név</th><th>E-mail</th><th>Szerepkör</th><th>Állapot</th><th>Utolsó belépés</th><th class="num">Művelet</th></tr></thead><tbody>
  ${STAFF.map(s => `<tr><td><div class="nm"><div class="avatar" aria-hidden="true">${ini(s.name)}</div>${s.name}${s.id === S.me ? ` <span class="badge plain">Te</span>` : ""}</div></td>
    <td class="muted">${s.email}</td>
    <td><select class="input" style="width:150px;height:30px" data-role="${s.id}" aria-label="${s.name} szerepköre" ${s.id === S.me ? "disabled" : ""}>${ROLES.map(r => `<option value="${r.id}" ${r.id === s.role ? "selected" : ""}>${r.name}</option>`).join("")}</select></td>
    <td>${s.active ? `<span class="badge ok">Aktív</span>` : `<span class="badge plain">Letiltva</span>`}</td><td class="muted">${s.last}</td>
    <td class="num">${s.id === S.me ? "" : `<button type="button" class="btn-link" data-act="toggleUser" data-id="${s.id}" aria-label="${s.name} ${s.active ? "letiltása" : "aktiválása"}">${s.active ? "Letiltás" : "Aktiválás"}</button>`}</td></tr>`).join("")}
  </tbody></table></div></section>`;
VIEWS.staff.bind = () => document.querySelectorAll("[data-role]").forEach(sel => sel.onchange = () => {
  const s = STAFF.find(x => x.id === +sel.dataset.role); s.role = sel.value; fillRoleSwitch(); toast(`${s.name} szerepköre: ${roleOf(s.role).name}`);
});

VIEWS.roles = () => `
  <div class="page-head"><div><h1>Szerepkörök és jogok</h1><p>Pipáld be, melyik szerepkör mit csinálhat. A változás azonnal érvényes, a bal alsó váltóval ki is próbálhatod.</p></div>
    <div class="actions"><button type="button" class="btn-primary" data-act="newRole">${ico("plus")}Új szerepkör</button></div></div>
  <section class="card" aria-labelledby="matrixH"><div class="card-h"><h2 id="matrixH">Jogosultságok szerepkörönként</h2></div><div class="table-wrap"><table><caption class="sr-only">Jogosultságok sorokban, szerepkörök oszlopokban</caption><thead><tr><th>Jogosultság</th>
    ${ROLES.map(r => `<th class="num" style="text-align:center">${r.name}<div class="small muted" style="font-weight:400">${STAFF.filter(s => s.role === r.id).length} fő</div></th>`).join("")}</tr></thead><tbody>
  ${PERMISSIONS.map(p => `<tr><th scope="row" style="background:none;font-weight:400;font-size:13px;color:var(--text)">${p.label}</th>${ROLES.map(r => `<td style="text-align:center"><input type="checkbox" data-perm-role="${r.id}" data-perm-key="${p.key}" aria-label="${r.name}: ${p.label}" ${r.perms.includes(p.key) ? "checked" : ""} ${r.locked ? "disabled" : ""}></td>`).join("")}</tr>`).join("")}
  </tbody></table></div></section>
  <section aria-labelledby="rolesH" style="margin-top:16px"><h2 class="sr-only" id="rolesH">Szerepkörök leírása</h2><div class="grid g-2">${ROLES.map(r => `<div class="card card-b"><h3 class="lbl">${r.name}</h3><p class="small" style="margin-top:4px">${r.desc}${r.locked ? ". Az admin jogai nem vehetők el." : ""}</p></div>`).join("")}</div></section>`;
VIEWS.roles.bind = () => document.querySelectorAll("[data-perm-role]").forEach(cb => cb.onchange = () => {
  const r = roleOf(cb.dataset.permRole), k = cb.dataset.permKey;
  r.perms = cb.checked ? [...r.perms, k] : r.perms.filter(x => x !== k);
  toast(`${r.name}: ${PERMISSIONS.find(p => p.key === k).label.toLowerCase()} ${cb.checked ? "engedélyezve" : "tiltva"}`);
});

const SWATCHES = [["#0f766e", "Kékeszöld"], ["#1d4ed8", "Kék"], ["#4338ca", "Indigó"], ["#9d174d", "Bordó"], ["#b45309", "Borostyán"], ["#3f6212", "Olajzöld"], ["#334155", "Palaszürke"], ["#111827", "Fekete"]];
VIEWS.settings = () => {
  const admin = me().role === "admin", ro = admin ? "" : "disabled";
  return `
  <div class="page-head"><div><h1>Beállítások</h1><p>A megjelenés felhasználónként mentődik, a stúdió adatait csak admin módosíthatja.</p></div></div>
  <section class="card" aria-labelledby="lookH"><div class="card-h"><h2 id="lookH">Megjelenés</h2></div><div class="card-b" style="padding-top:0">
    <div class="setrow"><div><h3 id="thH">Téma</h3><p>Világos vagy sötét felület</p></div>
      <div><fieldset class="seg" id="themeSeg" aria-labelledby="thH"><legend class="sr-only">Téma</legend>${[["light", "Világos"], ["dark", "Sötét"]].map(([k, l]) => `<label><input type="radio" name="th" value="${k}" ${S.theme === k ? "checked" : ""}><span>${l}</span></label>`).join("")}</fieldset></div></div>
    <div class="setrow"><div><h3 id="acH">Kiemelő szín</h3><p>Elsődleges gombok, aktív menüpont, jelölők</p></div>
      <div class="swatches" role="group" aria-labelledby="acH">${SWATCHES.map(([c, n]) => `<button type="button" class="swatch ${c === S.accent ? "on" : ""}" data-sw="${c}" style="background:${c}" aria-label="${n}" aria-pressed="${c === S.accent}" title="${n}"></button>`).join("")}
        <label class="sr-only" for="customColor">Egyedi kiemelő szín</label><input type="color" class="colorpick" id="customColor" value="${S.accent}" title="Egyedi szín"><span class="small muted mono" aria-hidden="true">${S.accent}</span></div>
      <p class="small muted" style="grid-column:2">Egyedi színnél ügyelj rá, hogy a szöveg jól olvasható maradjon. A gombfelirat színét a rendszer a háttérhez igazítja.</p></div>
    <div class="setrow"><div><h3>Oldalsáv</h3><p>Csak ikonok, több hely a tartalomnak</p></div>
      <div><label class="check" for="sbCol"><input type="checkbox" id="sbCol" ${S.collapsed ? "checked" : ""}>Összecsukott oldalsáv</label></div></div>
    <div class="setrow"><div><h3 id="btnH">Gombstílusok</h3><p>A felület három gombtípusa</p></div>
      <div class="btnrow" style="margin:0" role="group" aria-labelledby="btnH"><button type="button" class="btn-primary">Elsődleges</button><button type="button" class="btn-secondary">Másodlagos</button><button type="button" class="btn-link">Link gomb</button></div></div>
  </div></section>
  <section class="card" style="margin-top:16px" aria-labelledby="studioH"><div class="card-h"><h2 id="studioH">Stúdió adatai</h2>${admin ? "" : `<span class="badge plain">${ico("lock")} Csak admin</span>`}</div><div class="card-b">
    <div class="grid g-2"><div class="field"><label for="st_name">Stúdió neve</label><input class="input" id="st_name" value="Reform Studio Belváros" ${ro}></div>
    <div class="field"><label for="st_addr">Cím</label><input class="input" id="st_addr" value="1052 Budapest, Petőfi Sándor u. 10." ${ro}></div>
    <div class="field"><label for="st_mon">Vendégmonitor kijelzési idő</label><select class="input" id="st_mon" ${ro}><option>4 másodperc</option><option selected>6 másodperc</option><option>10 másodperc</option></select></div>
    <div class="field"><label for="st_warn">Lejárat előtti figyelmeztetés</label><select class="input" id="st_warn" ${ro}><option>1 nap</option><option selected>3 nap</option><option>7 nap</option></select></div></div>
    <div class="btnrow" style="margin:0"><button type="button" class="btn-primary" data-act="saved" ${ro}>Mentés</button><button type="button" class="btn-link" data-act="go" data-id="reception">Mégse</button></div>
  </div></section>`;
};
VIEWS.settings.bind = () => {
  document.querySelectorAll("#themeSeg input").forEach(i => i.onchange = () => { S.theme = i.value; applyTheme(); render(); const n = document.querySelector(`#themeSeg input[value="${S.theme}"]`); if (n) n.focus(); });
  document.querySelectorAll("[data-sw]").forEach(s => s.onclick = () => { S.accent = s.dataset.sw; applyTheme(); render(); const n = document.querySelector(`[data-sw="${S.accent}"]`); if (n) n.focus(); });
  $("customColor").oninput = e => { S.accent = e.target.value; applyTheme(); };
  $("customColor").onchange = () => { render(); $("customColor").focus(); };
  $("sbCol").onchange = () => { $("collapse").click(); $("sbCol").focus(); };
};

/* ---------- Modális ablakok ---------- */
function shopModal(m, ext) {
  const list = ext ? PRODUCTS.filter(p => !p.addon && p.id !== "p1") : PRODUCTS;
  let pick = (ext && PRODUCTS.find(p => p.name === m.pass)) ? PRODUCTS.find(p => p.name === m.pass).id : list[0].id;
  const body = `${ext ? `<div class="alert info">Jelenleg: <b>${m.pass}</b>, ${daysLeft(m) < 0 ? "lejárt" : fmtD(m.until) + "-ig érvényes"}. Érvényes bérletnél az új időszak a mostani lejárat után indul.</div>` : ""}
    <table><caption class="sr-only">Válassz terméket</caption><thead><tr><th><span class="sr-only">Választás</span></th><th>Termék</th><th>Leírás</th><th class="num">Ár</th></tr></thead><tbody>
    ${list.map(p => `<tr class="click" data-pick="${p.id}"><td style="width:30px"><input type="radio" name="prod" id="pr_${p.id}" value="${p.id}" aria-describedby="prd_${p.id}" ${p.id === pick ? "checked" : ""}></td><td><label for="pr_${p.id}"><b>${p.name}</b></label></td><td class="muted" id="prd_${p.id}">${p.desc}<span class="sr-only">, ${ft(p.price)}</span></td><td class="num" aria-hidden="true">${ft(p.price)}</td></tr>`).join("")}
    </tbody></table>
    <div class="grid g-2" style="margin-top:16px"><div class="field"><label for="pay">Fizetési mód</label><select class="input" id="pay"><option>Bankkártya</option><option>Készpénz</option><option>SZÉP-kártya</option><option>Átutalás</option></select></div>
    <div class="field"><label for="note">Megjegyzés a számlára</label><input class="input" id="note" placeholder="Nem kötelező"></div></div>`;
  openModal(ext ? `Bérlet hosszabbítása · ${m.name}` : `Vásárlás · ${m.name}`, body,
    `<div class="tot" id="tot" aria-live="polite"></div><button type="button" class="btn-secondary" id="mCancel">Mégse</button><button type="button" class="btn-primary" id="mOk">Fizetés rögzítése</button>`);
  const calc = () => {
    const p = PRODUCTS.find(x => x.id === pick), base = (!p.addon && ext && daysLeft(m) > 0) ? m.until : TODAY;
    const nu = new Date(base); nu.setDate(nu.getDate() + p.days); return { p, nu };
  };
  const upd = () => { const { p, nu } = calc(); $("tot").innerHTML = `<b>${ft(p.price)}</b>${p.addon ? "Kiegészítő, a bérletet nem érinti" : "Új lejárat: " + fmtD(nu)}`; };
  document.querySelectorAll("[data-pick]").forEach(tr => {
    const r = tr.querySelector("input");
    tr.onclick = e => { if (e.target.tagName === "LABEL") return; pick = tr.dataset.pick; r.checked = true; upd(); };
    r.onchange = () => { pick = r.value; upd(); };
  });
  upd();
  $("mCancel").onclick = closeModal;
  $("mOk").onclick = () => {
    const { p, nu } = calc(), pay = $("pay").value;
    if (!p.addon) { m.pass = p.name; m.total = p.occ || p.days; m.left = p.occ; m.until = nu; }
    m.buys.unshift([fmtD(TODAY), p.name, p.price]); closeModal(); render();
    toast(`${p.name} rögzítve, ${ft(p.price)}, ${pay.toLowerCase()}`);
  };
}
function bookModal(m) {
  let pick = m.cls;
  openModal(`Foglalás · ${m.name}`, `<table><caption class="sr-only">Mai órák, válassz egyet</caption><thead><tr><th><span class="sr-only">Választás</span></th><th>Idő</th><th>Óra</th><th>Terem</th><th class="num">Szabad hely</th></tr></thead><tbody>
    ${CLASSES.map(c => { const full = c.booked >= c.cap && c.id !== m.cls; return `<tr class="${full ? "" : "click"}" data-bk="${c.id}" style="${full ? "opacity:.6" : ""}"><td><input type="radio" name="bk" id="bk_${c.id}" value="${c.id}" ${c.id === m.cls ? "checked" : ""} ${full ? "disabled" : ""}></td>
    <td class="mono">${c.t}</td><td><label for="bk_${c.id}">${c.n}<span class="sr-only">, ${c.t}${full ? ", telt ház" : ""}</span></label></td><td class="muted">${c.room}</td><td class="num">${full ? "Telt ház" : c.cap - c.booked}</td></tr>`; }).join("")}</tbody></table>`,
    `<span class="tot small">A vendégmonitor ezt az órát mutatja.</span><button type="button" class="btn-secondary" id="mCancel">Mégse</button><button type="button" class="btn-primary" id="mOk">Foglalás mentése</button>`);
  $("mCancel").onclick = closeModal;
  document.querySelectorAll('#modal input[name="bk"]').forEach(r => r.onchange = () => pick = r.value);
  document.querySelectorAll("tr.click[data-bk]").forEach(tr => tr.onclick = e => { if (e.target.tagName === "LABEL") return; const r = tr.querySelector("input"); r.checked = true; pick = r.value; });
  $("mOk").onclick = () => {
    const c = clsById(pick); if (c.id === m.cls) { closeModal(); return; }
    clsById(m.cls).booked--; c.booked++; m.cls = c.id; closeModal(); render(); toast(`${m.name} foglalása: ${c.t} ${c.n}`);
  };
}
function historyModal(m) {
  openModal(`Előzmények · ${m.name}`, `<div class="grid g-2"><section aria-labelledby="hv"><h3 class="lbl" id="hv" style="margin-bottom:6px">Látogatások</h3><table><caption class="sr-only">Látogatások dátum szerint</caption><tbody>${m.visits.map(v => `<tr><td class="mono">${v[0]}</td><td>${v[1]}</td></tr>`).join("") || `<tr><td class="empty">Még nincs látogatás.</td></tr>`}</tbody></table></section>
    <section aria-labelledby="hb"><h3 class="lbl" id="hb" style="margin-bottom:6px">Vásárlások</h3><table><caption class="sr-only">Vásárlások dátum szerint</caption><tbody>${m.buys.map(b => `<tr><td class="mono">${b[0]}</td><td>${b[1]}</td><td class="num">${ft(b[2])}</td></tr>`).join("") || `<tr><td class="empty">Még nincs vásárlás.</td></tr>`}</tbody></table></section></div>`,
    `<span class="tot"></span><button type="button" class="btn-secondary" id="mCancel">Bezárás</button>`);
  $("mCancel").onclick = closeModal;
}
function formModal(title, fields, onOk) {
  const attrs = f => f.k === "email" ? 'type="email" autocomplete="email"' : f.k === "phone" ? 'type="tel" autocomplete="tel"' : f.k === "name" ? 'autocomplete="name"' : "";
  openModal(title, `<form id="mForm" novalidate>${fields.map((f, i) => `<div class="field"><label for="f_${f.k}">${f.l}${i === 0 ? ' <span aria-hidden="true">*</span>' : ""}</label>${f.opts ? `<select class="input" id="f_${f.k}">${f.opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join("")}</select>` : `<input class="input" id="f_${f.k}" placeholder="${f.p || ""}" ${i === 0 ? 'required aria-required="true"' : ""} ${attrs(f)}>`}</div>`).join("")}
    <p class="small" id="fErr" role="alert" style="color:var(--danger)"></p><p class="small muted"><span aria-hidden="true">*</span> kötelező mező</p></form>`,
    `<span class="tot"></span><button type="button" class="btn-secondary" id="mCancel">Mégse</button><button type="submit" form="mForm" class="btn-primary" id="mOk">Mentés</button>`);
  $("mCancel").onclick = closeModal;
  $("mForm").onsubmit = e => {
    e.preventDefault();
    const v = {}; fields.forEach(f => v[f.k] = $("f_" + f.k).value.trim());
    const first = $("f_" + fields[0].k);
    if (!v[fields[0].k]) { first.setAttribute("aria-invalid", "true"); first.setAttribute("aria-describedby", "fErr"); $("fErr").textContent = `A(z) „${fields[0].l}” mező kitöltése kötelező.`; first.focus(); return; }
    onOk(v); closeModal(); render(true);
  };
}

/* ---------- Műveletek ---------- */
const ACTIONS = {
  tap: simulateTap,
  in: id => checkIn(member(+id), false),
  out: id => checkOut(member(+id)),
  extend: id => shopModal(member(+id), true),
  buy: id => shopModal(member(+id), false),
  book: id => bookModal(member(+id)),
  history: id => historyModal(member(+id)),
  go: v => { S.view = v; render(true); },
  soon: () => toast("Az órarend szerkesztése a következő tervkörben készül el"),
  saved: () => toast("Beállítások mentve"),
  toggleUser: id => { const s = STAFF.find(x => x.id === +id); s.active = !s.active; fillRoleSwitch(); render(); toast(`${s.name} ${s.active ? "aktiválva" : "letiltva"}`); },
  newMember: () => formModal("Új vendég", [{ k: "name", l: "Teljes név", p: "Vezetéknév Keresztnév" }, { k: "phone", l: "Telefon", p: "+36" }, { k: "email", l: "E-mail" }], v => {
    const id = Math.max(...MEMBERS.map(m => m.id)) + 1;
    MEMBERS.push({ id, name: v.name, card: "RS-" + (10000 + id * 137).toString().slice(-5), phone: v.phone || "–", email: v.email, pass: "Nincs bérlet", total: 1, left: 0, until: TODAY, cls: "c7", since: "Ma", visits: [], buys: [], inside: false, locker: null });
    S.sel = id; S.view = "reception"; toast(`${v.name} felvéve, a kártyát most hozzá lehet rendelni`);
  }),
  newUser: () => formModal("Új felhasználó", [{ k: "name", l: "Név" }, { k: "email", l: "E-mail", p: "nev@reformstudio.hu" }, { k: "role", l: "Szerepkör", opts: ROLES.map(r => [r.id, r.name]) }], v => {
    STAFF.push({ id: Math.max(...STAFF.map(s => s.id)) + 1, name: v.name, email: v.email, role: v.role, active: true, last: "Meghívó elküldve" }); fillRoleSwitch(); toast(`Meghívó elküldve: ${v.name}`);
  }),
  newRole: () => formModal("Új szerepkör", [{ k: "name", l: "Szerepkör neve", p: "pl. Stúdióvezető" }, { k: "desc", l: "Rövid leírás" }], v => {
    ROLES.push({ id: "r" + Date.now(), name: v.name, desc: v.desc || "Egyedi szerepkör", perms: [] }); toast(`${v.name} létrehozva, most állítsd be a jogait`);
  }),
  newProduct: () => formModal("Új termék", [{ k: "name", l: "Megnevezés" }, { k: "price", l: "Ár (Ft)" }, { k: "days", l: "Érvényesség (nap)" }, { k: "occ", l: "Alkalmak száma (üresen: korlátlan)" }], v => {
    PRODUCTS.push({ id: "x" + Date.now(), name: v.name, desc: "Egyedi termék", price: +v.price || 0, days: +v.days || 30, occ: v.occ ? +v.occ : null }); toast(`${v.name} hozzáadva`);
  })
};

/* ---------- Indítás ---------- */
[[5, "14:52", "c3"], [1, "15:08", "c4"], [8, "15:21", "c5"]].forEach(([id, t, c]) => {
  const m = member(id); m.inside = true; m.locker = 10 + id * 3; S.log.unshift({ id, time: t, ok: true, cls: c, how: "Kártya" });
});
S.log.splice(1, 0, { id: 4, time: "15:14", ok: false, cls: "c7", how: "Kártya" });
fillRoleSwitch(); applyTheme(); onLayoutChange(); render(); tick(); setInterval(tick, 15000);
