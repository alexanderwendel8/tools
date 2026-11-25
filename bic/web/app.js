"use strict";

const PAGE = 100;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };

// Semikolon-CSV mit Anführungszeichen (wie von Pythons csv-Modul geschrieben).
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() || [];
  return rows.filter((r) => r.some((v) => v !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const state = { banks: [], filtered: [], shown: 0, days: [], loadedDays: new Map() };

/* ---------- Suche ---------- */

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");

function highlight(text, terms) {
  let html = esc(text);
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    html = html.replace(re, "<mark>$1</mark>");
  }
  return html;
}

function applyFilter() {
  const q = $("#q").value.trim();
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const land = $("#f-land").value, sektor = $("#f-sektor").value;
  state.filtered = state.banks.filter((b) =>
    (!land || b.Bundesland === land) &&
    (!sektor || b.Sektor === sektor) &&
    terms.every((t) => b._search.includes(t)));
  state.shown = 0;
  $("#rows").innerHTML = "";
  renderMore(q.split(/\s+/).filter(Boolean));
  const n = state.filtered.length;
  $("#result-count").textContent = `${n.toLocaleString("de-AT")} ${n === 1 ? "Eintrag" : "Einträge"}`;
  try { history.replaceState(null, "", q ? `#q=${encodeURIComponent(q)}` : location.pathname); } catch {}
}

function renderMore(terms) {
  terms = terms || $("#q").value.trim().split(/\s+/).filter(Boolean);
  const slice = state.filtered.slice(state.shown, state.shown + PAGE);
  if (!state.filtered.length) {
    $("#rows").innerHTML = `<tr><td colspan="5" class="empty">Keine Bank gefunden.</td></tr>`;
  }
  $("#rows").insertAdjacentHTML("beforeend", slice.map((b) => `
    <tr data-blz="${esc(b.Bankleitzahl)}" tabindex="0">
      <td>${highlight(b.Bankleitzahl, terms)}</td>
      <td>${highlight(b["SWIFT-Code"], terms) || "–"}</td>
      <td>${highlight(b.Bankenname, terms)}${b.Kennzeichen === "Filiale" ? ' <span class="branch">(Filiale)</span>' : ""}</td>
      <td class="hide-sm">${highlight([b.PLZ, b.Ort].filter(Boolean).join(" "), terms)}</td>
      <td class="hide-md">${esc(b.Sektor)}</td>
    </tr>`).join(""));
  state.shown += slice.length;
  $("#more").hidden = state.shown >= state.filtered.length;
}

/* ---------- Detail ---------- */

const DETAIL_FIELDS = [
  ["Bankleitzahl", "Bankleitzahl", true], ["SWIFT-Code", "BIC", true], ["LEI", "LEI", true],
  ["Kennzeichen", "Art"], ["Sektor", "Sektor"], ["Institutsart", "Institutsart"],
  ["Identnummer", "Identnummer"], ["Firmenbuchnummer", "Firmenbuchnummer"],
  ["_adresse", "Adresse"], ["_post", "Postadresse"], ["Bundesland", "Bundesland"],
  ["Telefon", "Telefon"], ["Fax", "Fax"], ["E-Mail", "E-Mail"], ["Homepage", "Homepage"],
  ["Gründungsdatum", "Gründungsdatum"],
];

function showDetail(b, note) {
  const v = {
    ...b,
    _adresse: [b["Straße"], [b.PLZ, b.Ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    _post: [b["Postadresse / Straße"], b.Postfach && `Postfach ${b.Postfach}`,
      [b["Postadresse / PLZ"], b["Postadresse / Ort"]].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  };
  const val = (key, copy) => {
    const s = v[key];
    if (!s || s === "nullnull") return null;
    let html = esc(s);
    if (key === "E-Mail") html = `<a href="mailto:${esc(s)}">${html}</a>`;
    if (key === "Homepage") html = `<a href="${esc(/^https?:/.test(s) ? s : "https://" + s)}" target="_blank" rel="noopener">${html}</a>`;
    if (key === "LEI") html = `<span class="mono">${html}</span> · <a href="https://search.gleif.org/#/record/${encodeURIComponent(s)}" target="_blank" rel="noopener">GLEIF</a>`;
    else if (copy) html = `<span class="mono">${html}</span>`;
    if (copy) html += ` <button class="copy" data-copy="${esc(s)}">Kopieren</button>`;
    return html;
  };
  const rows = DETAIL_FIELDS.map(([k, label, copy]) => { const h = val(k, copy); return h ? `<dt>${label}</dt><dd>${h}</dd>` : ""; }).join("");
  $("#detail-body").innerHTML = `<h2>${esc(b.Bankenname)}</h2>${note ? `<p class="hint">${note}</p>` : ""}<dl class="kv">${rows}</dl>`;
  $("#detail").showModal();
}

/* ---------- Änderungen ---------- */

function renderDays() {
  const box = $("#days");
  if (!state.days.length) {
    box.innerHTML = `<p class="empty">Noch keine Änderungen seit Beginn der Aufzeichnung.</p>`;
    return;
  }
  box.innerHTML = state.days.map((d, i) => `
    <details class="day" data-day="${d.datum}" ${i === 0 ? "open" : ""}>
      <summary><strong>${fmtDate(d.datum)}</strong>
        ${d.neu ? `<span class="tag neu">${d.neu} neu</span>` : ""}
        ${d.geaendert ? `<span class="tag geändert">${d.geaendert} geändert</span>` : ""}
        ${d.entfernt ? `<span class="tag entfernt">${d.entfernt} entfernt</span>` : ""}
      </summary>
      <div class="day-body"><p class="loading">lädt …</p></div>
    </details>`).join("");
  box.querySelectorAll("details").forEach((el) => {
    el.addEventListener("toggle", () => el.open && loadDay(el));
    if (el.open) loadDay(el);
  });
}

async function loadDay(el) {
  const day = el.dataset.day;
  if (state.loadedDays.has(day)) return;
  state.loadedDays.set(day, null);
  const body = el.querySelector(".day-body");
  try {
    const rows = parseCSV(await fetchText(`changes/${day}.csv`));
    state.loadedDays.set(day, rows);
    body.innerHTML = `<p class="mono" style="margin:0;padding:6px 14px 0;text-align:right"><a href="changes/${day}.csv" download>CSV</a></p>` +
      rows.map((r, i) => {
        const fields = r["Geänderte Felder"] ? r["Geänderte Felder"].split(" | ").map((f) => {
          const m = f.match(/^(.*?): (.*) -> (.*)$/);
          return m ? `<div>${esc(m[1])}: <del>${esc(m[2]) || "(leer)"}</del> → <ins>${esc(m[3]) || "(leer)"}</ins></div>` : `<div>${esc(f)}</div>`;
        }).join("") : "";
        return `<div class="change"><span><span class="tag ${esc(r["Änderung"])}">${esc(r["Änderung"])}</span></span>
          <span><a href="#" data-day-row="${i}"><span class="mono">${esc(r.Bankleitzahl)}</span> · ${esc(r.Bankenname)}</a>
          <span class="mono">${esc(r["SWIFT-Code"])}</span></span>
          ${fields ? `<div class="fields">${fields}</div>` : ""}</div>`;
      }).join("");
    body.querySelectorAll("[data-day-row]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const r = rows[+a.dataset.dayRow];
      const note = r["Änderung"] === "entfernt" ? `Am ${fmtDate(day)} aus dem OeNB-Verzeichnis entfernt – letzter bekannter Stand.` : "";
      showDetail(r, note);
    }));
  } catch (err) {
    state.loadedDays.delete(day);
    body.innerHTML = `<p class="loading">Fehler beim Laden: ${esc(err.message)}</p>`;
  }
}

/* ---------- Tabs & Start ---------- */

function selectTab(name) {
  for (const t of ["suche", "aenderungen"]) {
    $(`#tab-${t}`).setAttribute("aria-selected", String(t === name));
    $(`#view-${t}`).hidden = t !== name;
  }
}

async function init() {
  $("#tab-suche").addEventListener("click", () => selectTab("suche"));
  $("#tab-aenderungen").addEventListener("click", () => selectTab("aenderungen"));
  $("#q").addEventListener("input", applyFilter);
  $("#f-land").addEventListener("change", applyFilter);
  $("#f-sektor").addEventListener("change", applyFilter);
  $("#more-btn").addEventListener("click", () => renderMore());
  const openRow = (tr) => { const b = state.banks.find((x) => x.Bankleitzahl === tr.dataset.blz); if (b) showDetail(b); };
  $("#rows").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-blz]"); if (tr) openRow(tr); });
  $("#rows").addEventListener("keydown", (e) => { const tr = e.target.closest("tr[data-blz]"); if (tr && e.key === "Enter") openRow(tr); });
  $("#detail").addEventListener("click", (e) => {
    if (e.target === $("#detail")) $("#detail").close();
    const btn = e.target.closest("[data-copy]");
    if (btn) navigator.clipboard?.writeText(btn.dataset.copy).then(() => { btn.textContent = "Kopiert"; setTimeout(() => (btn.textContent = "Kopieren"), 1200); });
  });

  const m = location.hash.match(/^#q=(.*)$/);
  if (m) $("#q").value = decodeURIComponent(m[1]);

  const [banksRes, daysRes, buildRes] = await Promise.allSettled([
    fetchText("data/sepa-zv-vz_gesamt.csv"),
    fetchText("changes/index.json"),
    fetchText("build.json"),
  ]);

  if (banksRes.status === "rejected") {
    $("#rows").innerHTML = `<tr><td colspan="5" class="empty">Daten konnten nicht geladen werden (${esc(banksRes.reason.message)}).</td></tr>`;
    $("#meta").textContent = "Daten nicht verfügbar";
    return;
  }
  state.banks = parseCSV(banksRes.value).map((b) => ({
    ...b,
    _search: norm([b.Bankleitzahl, b["SWIFT-Code"], b.Bankenname, b.PLZ, b.Ort, b.LEI, b.Bundesland, b.Sektor].join(" ")),
  }));
  state.banks.sort((a, b) => a.Bankleitzahl.padStart(10, "0").localeCompare(b.Bankleitzahl.padStart(10, "0")));

  const fill = (sel, key) => [...new Set(state.banks.map((b) => b[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"))
    .forEach((v) => sel.insertAdjacentHTML("beforeend", `<option>${esc(v)}</option>`));
  fill($("#f-land"), "Bundesland");
  fill($("#f-sektor"), "Sektor");

  state.days = daysRes.status === "fulfilled" ? JSON.parse(daysRes.value) : [];
  if (state.days.length) $("#changes-badge").textContent = state.days.length;

  let meta = `${state.banks.length.toLocaleString("de-AT")} Einträge`;
  if (buildRes.status === "fulfilled") {
    try { const b = JSON.parse(buildRes.value); if (b.geprueft) meta += ` · geprüft am ${fmtDate(b.geprueft)}`; } catch {}
  }
  if (state.days.length) meta += ` · letzte Änderung ${fmtDate(state.days[0].datum)}`;
  $("#meta").textContent = meta;

  applyFilter();
  renderDays();
}

init();
