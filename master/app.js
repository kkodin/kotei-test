/* マスター（2026-11-21 ユーザー：人・現場・外注・機械 ほか、マスターを編集する機能をランチャーに）
   名簿（meibo/）と同じ形：元の一覧は直さず、直した・足した・外した分だけを 工程データ\マスタ\ に置く（毎朝作り直されても残る）。
     現場  … 元：稼働データ\現場一覧.json（毎朝 NAS の受注台帳などから作る）＋ 工程データ\マスタ.json の現場（全体工程表）→ 現場_手直し.json
     外注  … 元：工程データ\マスタ.json の外注業者（配置表の名簿）＋ マスタ\人.json の外注の会社（作業員名簿）→ 外注_手直し.json
     機械  … 元：稼働データ\稼働データ.json の機械（自社機械稼働表が持つ。ここからは書かない）→ 機械_手直し.json
     元請  … 元：上の現場の 元請・発注者 → 元請_手直し.json
     工種・作業内容／材料 … 元の一覧は無い。ここで足したものだけ → 工種.json・材料.json
     人    … 名簿（meibo/）へ移る
   合わせ方は共通の部品（common/master.js の HX.mergeRows）。書く直前に読み直して1行分だけ入れる（ほかの人と同時に直しても消し合わない・eTag）。
   各アプリはまだ今までのマスタを読む（段階 D で、ここで直した分を読むように切り替える）。
   この画面には本物の名前を書かない（公開の置き場に置くため）。名前はサインインしてから OneDrive から読む。 */
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DEMO = HX.demo, nk = HX.normName;
const nowStr = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const newKey = () => "a:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const SRC = { 工程: null, 人: null, 現場一覧: null, 稼働: null, err: [] };
const S = { kind: "genba", f: "all", q: "", me: "", fix: {}, tag: {} };
let app = null, mst = null, kroot = null, kik = null;

function toast(t, ms) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, ms || 3500); }

/* ---------- 種類ごとの決まり ---------- */
const nameKey = r => r.名前 ? "n:" + nk(r.名前) : null;
const T = (f, label, o) => ({ f, label, ...(o || {}) });
const KINDS = [
  { id: "hito", name: "人", link: "meibo", note: "名簿へ" },
  {
    id: "genba", name: "現場", file: "現場_手直し.json", unit: "件",
    key: r => r.コード ? "c:" + r.コード : nameKey(r),
    fields: [T("コード", "工事コード", { half: 1, num: 1, ph: "例：520001" }), T("名前", "略称（候補に出る名前）", { half: 1, req: 1 }), T("正式名", "正式名"),
      T("元請", "元請", { half: 1 }), T("発注者", "発注者", { half: 1 }), T("担当", "担当", { half: 1 }), T("場所", "場所", { half: 1 }),
      T("工期自", "工期（から）", { half: 1, type: "date" }), T("工期至", "工期（まで）", { half: 1, type: "date" }), T("別名", "別名（表記ゆれ。「、」で区切る）", { ph: "例：阿久和、阿久和南道路" })],
    cols: [["工事コード", r => r.コード], ["略称", r => r.名前, 1], ["正式名", r => r.正式名], ["元請", r => r.元請], ["担当", r => r.担当], ["工期", r => [r.工期自, r.工期至].filter(Boolean).join("〜")], ["元", r => r.元.join("・")]],
    base() {
      const out = [], byCode = new Map();
      for (const g of (SRC.現場一覧 && SRC.現場一覧.現場) || []) { const r = { コード: g.コード || "", 名前: g.名前 || "", 正式名: g.正式名 || "", 元請: g.元請 || "", 発注者: g.発注者 || "", 担当: g.担当 || "", 場所: g.場所 || "", 工期自: g.工期自 || "", 工期至: g.工期至 || "", 元: ["現場一覧"] }; out.push(r); if (r.コード) byCode.set(r.コード, r); }
      for (const m of (SRC.工程 && SRC.工程.現場) || []) {
        const c = m.コード || "", same = c ? byCode.get(c) : out.find(r => nk(r.名前) === nk(m.略称 || m.名前) || nk(r.正式名) === nk(m.名前));
        if (same) { if (!same.元.includes("全体工程表")) same.元.push("全体工程表"); continue; }
        out.push({ コード: c, 名前: m.略称 || m.名前 || "", 正式名: m.略称 ? m.名前 || "" : "", 担当: m.担当 || "", 元請: m.元請 || "", 元: ["全体工程表"] });
      }
      return out;
    },
    info: "元は 現場一覧（毎朝 NAS の受注台帳などから作る）と全体工程表の現場。ここで直した分は翌朝も残ります。"
  },
  {
    id: "gaichu", name: "外注", file: "外注_手直し.json", unit: "社",
    key: nameKey,
    fields: [T("名前", "会社名", { req: 1, ph: "例：○○工業" }), T("略称", "略称", { half: 1 }), T("ふりがな", "ふりがな", { half: 1 }), T("職種", "職種（主な仕事）"), T("別名", "別名（表記ゆれ。「、」で区切る）", { ph: "例：(株)○○工業、○○" })],
    cols: [["会社名", r => r.名前, 1], ["略称", r => r.略称], ["ふりがな", r => r.ふりがな], ["職種", r => r.職種], ["名簿の人数", r => r.人数 || "", 0, "num"], ["元", r => r.元.join("・")]],
    base() {
      const m = new Map(), add = (name, src) => { const k = nk(name); if (!k) return null; let r = m.get(k); if (!r) { r = { 名前: name, 元: [], 人数: 0 }; m.set(k, r); } if (!r.元.includes(src)) r.元.push(src); return r; };
      for (const n of (SRC.工程 && SRC.工程.外注業者) || []) add(n, "配置表");
      for (const p of (SRC.人 && SRC.人.人) || []) if (p.区分 === "外注" && p.会社) { const r = add(p.会社, "作業員名簿"); if (r) r.人数++; }
      return [...m.values()];
    },
    info: "元は 配置表の外注業者と作業員名簿の会社。名簿の人数は作業員名簿の人（人は「人」のタブ＝名簿で直します）。"
  },
  {
    id: "kikai", name: "機械", file: "機械_手直し.json", unit: "台",
    key: r => r.id ? "i:" + r.id : null,
    fields: [T("名前", "名前", { req: 1, half: 1, ph: "例：バックホウ" }), T("規格", "規格", { half: 1, ph: "例：0.25㎥" }), T("分類", "分類", { half: 1, ph: "例：重機" }), T("台数", "台数", { half: 1, num: 1 }), T("別名", "別名（表記ゆれ。「、」で区切る）", { ph: "例：BH、バックホー" })],
    cols: [["名前", r => r.名前, 1], ["規格", r => r.規格], ["分類", r => r.分類], ["台数", r => r.台数 || "", 0, "num"], ["元", r => r.元.join("・")]],
    base: () => ((SRC.稼働 && SRC.稼働.機械) || []).filter(x => x && x.名前).map(x => ({ id: x.id, 名前: x.名前, 規格: x.規格 || "", 分類: x.分類 || "", 台数: x.台数 != null ? String(x.台数) : "", 使わない: !!x.使わない, 元: ["自社機械稼働表"] })),
    info: "元は 自社機械稼働表の機械。予定・単価は自社機械稼働表で直します。ここは日報などの候補に出す名前・規格・分類と、候補から外す機械を決めます。"
  },
  {
    id: "motouke", name: "元請", file: "元請_手直し.json", unit: "社",
    key: nameKey,
    fields: [T("名前", "名前", { req: 1, ph: "例：○○建設" }), T("略称", "略称", { half: 1 }), T("ふりがな", "ふりがな", { half: 1 }), T("別名", "別名（表記ゆれ。「、」で区切る）", { ph: "例：(株)○○建設、○○建設横浜支店" })],
    cols: [["名前", r => r.名前, 1], ["略称", r => r.略称], ["ふりがな", r => r.ふりがな], ["現場数", r => r.現場数 || "", 0, "num"], ["元", r => r.元.join("・")]],
    base() {
      const m = new Map(), add = (name, src) => { const k = nk(name); if (!k) return; let r = m.get(k); if (!r) { r = { 名前: name, 元: [], 現場数: 0 }; m.set(k, r); } if (!r.元.includes(src)) r.元.push(src); r.現場数++; };
      for (const g of rowsOf("genba").filter(r => !r.外す)) { if (g.元請) add(g.元請, "現場の元請"); if (g.発注者 && nk(g.発注者) !== nk(g.元請)) add(g.発注者, "現場の発注者"); }
      return [...m.values()];
    },
    info: "元は 現場の元請・発注者（現場のタブで直した値を使います）。"
  },
  {
    id: "koushu", name: "工種・作業内容", file: "工種.json", unit: "件",
    key: () => null,
    fields: [T("名前", "名前", { req: 1, ph: "例：布設工" }), T("分類", "分類", { half: 1, type: "select", opts: ["工種", "作業内容"] }), T("ふりがな", "ふりがな", { half: 1 }), T("別名", "別名（表記ゆれ。「、」で区切る）")],
    cols: [["名前", r => r.名前, 1], ["分類", r => r.分類], ["ふりがな", r => r.ふりがな], ["別名", r => r.別名]],
    base: () => [],
    info: "日報・工程で選ぶ工種・作業内容の一覧。ここで足したものだけが入ります。"
  },
  {
    id: "zairyo", name: "材料", file: "材料.json", unit: "件",
    key: () => null,
    fields: [T("名前", "名前", { req: 1, ph: "例：再生砕石" }), T("規格", "規格", { half: 1, ph: "例：RC-40" }), T("単位", "単位", { half: 1, ph: "例：㎥" }), T("分類", "分類", { half: 1, ph: "例：骨材" }), T("ふりがな", "ふりがな", { half: 1 }), T("別名", "別名（表記ゆれ。「、」で区切る）")],
    cols: [["名前", r => r.名前, 1], ["規格", r => r.規格], ["単位", r => r.単位], ["分類", r => r.分類], ["別名", r => r.別名]],
    base: () => [],
    info: "日報の材料・仕入の候補。ここで足したものだけが入ります。"
  }
];
const kindOf = id => KINDS.find(k => k.id === id);
function rowsOf(id) {
  const K = kindOf(id);
  const rows = HX.mergeRows(K.base(), S.fix[id], K.key, K.fields.map(x => x.f));
  return rows.sort((a, b) => (id === "genba" ? String(b.コード || "").localeCompare(String(a.コード || "")) : 0) || String(a.ふりがな || a.名前 || "").localeCompare(String(b.ふりがな || b.名前 || ""), "ja"));
}

/* ---------- 試し（?demo）：ブラウザの中だけ。名前は作りもの ---------- */
function seedDemo() {
  const KEY = "master_demo_store";
  try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }
  const P = (名前, 区分, 会社) => ({ 名前, 区分, 会社 });
  const d = {
    "マスタ.json": { 社員: ["試し　太郎"], 従業員: ["見本　一郎"], 外注業者: ["Ａ工業", "Ｂ建設", "Ｃ組"], 現場: [{ 名前: "E現場 新設工事", 略称: "E新設", コード: "520009", 担当: "試し" }, { 名前: "A町配水管布設工事", 略称: "A現場 配水管", コード: "510001" }] },
    "マスタ/人.json": { 形式: "人", 人: [P("例題　太郎", "外注", "Ａ工業"), P("例題　次郎", "外注", "Ａ工業"), P("見積　一夫", "外注", "Ｂ建設"), P("仮名　五郎", "外注", "Ｄ興業")] },
    "機械/現場一覧.json": { 現場: [{ コード: "510001", 名前: "A現場 配水管", 正式名: "A町配水管布設工事", 元請: "見本市水道局", 発注者: "見本市水道局", 担当: "試し", 工期自: "2026-04-01", 工期至: "2027-03-31" },
      { コード: "510002", 名前: "B現場 道路改良", 正式名: "B線道路改良工事", 元請: "甲建設(株)", 発注者: "見本県", 担当: "見本", 工期自: "2026-06-01", 工期至: "2026-12-25" },
      { コード: "510003", 名前: "C現場 下水", 正式名: "C地区下水道工事", 元請: "株式会社甲建設", 発注者: "見本市", 工期自: "2026-09-01", 工期至: "2027-02-28" }] },
    "機械/稼働データ.json": { 機械: [{ id: "m1", 名前: "バックホウ", 規格: "0.25㎥", 分類: "重機" }, { id: "m2", 名前: "バックホウ", 規格: "0.45㎥", 分類: "重機", 台数: 2 }, { id: "m3", 名前: "ダンプ", 規格: "4t", 分類: "車両" }, { id: "m4", 名前: "発電機", 規格: "25kVA", 分類: "小物", 使わない: true }] }
  };
  const a = {}; for (const [n, v] of Object.entries(d)) a[n] = { data: v, eTag: "d0" };
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { }
}

/* ---------- 読む ---------- */
async function loadSources() {
  SRC.err = [];
  const safe = (p, what) => p.catch(e => { SRC.err.push(what + "（" + e.message + "）"); return null; });
  const [m, h, g, k] = await Promise.all([safe(kroot.get("マスタ.json"), "マスタ.json"), safe(mst.get("人.json"), "人.json"), safe(kik.get("現場一覧.json"), "現場一覧.json"), safe(kik.get("稼働データ.json"), "稼働データ.json")]);
  SRC.工程 = m && m.data; SRC.人 = h && h.data; SRC.現場一覧 = g && g.data; SRC.稼働 = k && k.data;
}
async function loadFix(id) {
  const K = kindOf(id); if (!K.file) return;
  const f = await mst.get(K.file);
  S.fix[id] = f ? f.data : null; S.tag[id] = f ? f.eTag : null;
}
async function loadAll() {
  await loadSources();
  await Promise.all(KINDS.filter(k => k.file).map(k => loadFix(k.id).catch(e => SRC.err.push(k.file + "（" + e.message + "）"))));
  render();
}

/* ---------- 見せる ---------- */
function renderKinds() {
  $("kinds").innerHTML = KINDS.map(k => {
    const n = k.file ? rowsOf(k.id).filter(r => !r.外す).length : "";
    return `<button type="button" data-kind="${k.id}" class="${S.kind === k.id ? "on" : ""}" title="${k.link ? "人の名簿（名簿の画面へ移ります）" : esc(k.info)}">${esc(k.name)}<small>${k.link ? k.note : n}</small></button>`;
  }).join("");
}
function shown(rows) {
  const q = nk(S.q);
  return rows.filter(r => {
    if (S.f === "out" && !r.外す) return false;
    if (S.f === "fix" && !(r.直した.length || r.追加)) return false;
    if (q && ![r.名前, r.コード, r.正式名, r.略称, r.ふりがな, r.別名, r.規格].some(v => nk(v).includes(q))) return false;
    return true;
  });
}
function render() {
  renderKinds();
  const K = kindOf(S.kind), all = rowsOf(S.kind), rows = shown(all);
  $("bAdd").textContent = "＋ " + K.name + "を足す";
  $("info").textContent = `${rows.length}${K.unit}を表示（外したものを除いて ${all.filter(r => !r.外す).length}${K.unit}）。行を押すと直せます。${K.info}` + (SRC.err.length ? `　読めなかったもの：${SRC.err.join("・")}` : "");
  $("tbl").tHead.innerHTML = `<tr>${K.cols.map(c => `<th>${esc(c[0])}</th>`).join("")}</tr>`;
  $("tbl").tBodies[0].innerHTML = rows.map(r => {
    const tags = (r.追加 ? `<span class="tag add">足した</span>` : "") + (r.直した.length ? `<span class="tag fix" title="${esc(r.直した.join("・"))}">直した</span>` : "") + (r.外す ? `<span class="tag">外した</span>` : "") + (r.使わない ? `<span class="tag" title="自社機械稼働表で「使わない」にしてある">稼働表で使わない</span>` : "");
    return `<tr data-k="${esc(r._k)}" class="${r.外す ? "out" : ""}">${K.cols.map(c => `<td class="${c[3] || ""}">${esc(c[1](r))}${c[2] ? tags : ""}</td>`).join("")}</tr>`;
  }).join("") || `<tr><td colspan="${K.cols.length}">${all.length ? "当てはまるものはありません" : "まだありません。「＋ " + esc(K.name) + "を足す」で足してください。"}</td></tr>`;
}

/* ---------- フォーム（§3.5：ハンドルで動かす・ボタンはハンドルの右・外を押しても閉じない・背景を回さない） ---------- */
const DLG = { dirty: false, onSave: null };
function openDlg(title, html, saveLabel, onSave) {
  $("dTitle").textContent = title; $("dSave").textContent = saveLabel; $("dlgBody").innerHTML = html;
  DLG.dirty = false; DLG.onSave = onSave;
  $("dlg").hidden = false; document.body.classList.add("modal");
  const w = $("dwin"); w.style.left = Math.max(8, (innerWidth - w.offsetWidth) / 2) + "px"; w.style.top = Math.max(8, Math.min(60, innerHeight - w.offsetHeight - 8)) + "px";
  const f = $("dlgBody").querySelector("input:not([type=checkbox]),select"); if (f) f.focus({ preventScroll: true });
}
function closeDlg(ask) {
  if (ask && DLG.dirty && !confirm("入れかけの内容を捨てて閉じますか？")) return;
  $("dlg").hidden = true; document.body.classList.remove("modal"); DLG.onSave = null;
}
(function dragSetup() {
  const h = $("dhead"), w = $("dwin"); let st = null;
  h.addEventListener("pointerdown", e => { if (e.target.closest("button")) return; st = { x: e.clientX, y: e.clientY, l: w.offsetLeft, t: w.offsetTop }; h.setPointerCapture(e.pointerId); e.preventDefault(); });
  h.addEventListener("pointermove", e => {
    if (!st) return;
    const l = Math.min(Math.max(st.l + e.clientX - st.x, 60 - w.offsetWidth), innerWidth - 60), t = Math.min(Math.max(st.t + e.clientY - st.y, 0), innerHeight - h.offsetHeight);
    w.style.left = l + "px"; w.style.top = t + "px";
  });
  const end = () => { st = null; }; h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
})();
$("dClose").onclick = () => closeDlg(true);
$("dSave").onclick = () => { if (DLG.onSave) DLG.onSave(); };
$("dlgBody").addEventListener("input", () => { DLG.dirty = true; });
$("dlgBody").addEventListener("submit", e => { e.preventDefault(); if (DLG.onSave) DLG.onSave(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("dlg").hidden) { e.preventDefault(); closeDlg(true); } });
$("dlg").addEventListener("wheel", e => { if (!e.target.closest(".dbody")) e.preventDefault(); }, { passive: false });
document.addEventListener("touchmove", e => {
  if (!document.body.classList.contains("modal")) return;
  const sc = e.target.closest(".dbody");
  if (e.target.closest(".dhead") || !sc || sc.scrollHeight <= sc.clientHeight) e.preventDefault();
}, { passive: false });

/* ---------- 直す・足す ---------- */
function fieldHtml(x, v) {
  const val = esc(v ?? "");
  if (x.type === "select") return `<label>${esc(x.label)}<select name="${x.f}"><option value=""></option>${x.opts.map(o => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
  return `<label>${esc(x.label)}<input name="${x.f}" type="${x.type || "text"}" value="${val}"${x.num ? ' inputmode="numeric"' : ""}${x.ph ? ` placeholder="${esc(x.ph)}"` : ""}></label>`;
}
function formHtml(K, v) {
  const out = []; let half = [];
  const flush = () => { if (half.length) out.push(`<div class="row">${half.join("")}</div>`); half = []; };
  for (const x of K.fields) { const h = fieldHtml(x, v[x.f]); if (x.half) { half.push(h); if (half.length === 2) flush(); } else { flush(); out.push(h); } }
  flush();
  return out.join("");
}
function edit(k) {
  const K = kindOf(S.kind), id = S.kind, all = rowsOf(id);
  const p = k ? all.find(r => r._k === k) : null, isNew = !p;
  const b = p && !p.追加 ? K.base().find(r => K.key(r) === k) || {} : {};
  const v = p || {};
  const has = !isNew && S.fix[id] && S.fix[id].行 && S.fix[id].行[k];
  const html = `${p && !p.追加 ? `<div class="src">元の値（${esc(p.元.join("・"))}）：${esc(K.fields.map(x => b[x.f]).filter(Boolean).join("・")) || "（なし）"}</div>` : ""}
    ${p && p.追加 ? `<div class="src">この画面で足したものです。</div>` : ""}
    ${formHtml(K, v)}
    <label>メモ<input name="メモ" value="${esc(p && p.メモ || "")}"></label>
    ${isNew ? "" : `<label class="chk"><input type="checkbox" name="外す" ${p.外す ? "checked" : ""}> 候補から外す（使わなくなった・間違って入ったもの。元の一覧はそのまま）</label>`}
    ${p && p.更新 ? `<div class="src">最後に直した：${esc(p.更新)}　${esc(p.更新者 || "")}</div>` : ""}
    ${has ? `<button type="button" class="undo" id="bUndo">${p.追加 ? "足したのを取り消す（一覧から消す）" : "直したのをやめる（元のとおりに戻す）"}</button>` : ""}`;
  openDlg(isNew ? K.name + "を足す" : (p.名前 || p.コード || K.name), html, isNew ? "足す" : "直す", async () => {
    const fd = new FormData($("dlgBody")), val = c => { const x = K.fields.find(y => y.f === c); let s = String(fd.get(c) ?? "").trim(); if (x && x.num) s = s.normalize("NFKC").replace(/\s/g, ""); return s; };
    const req = K.fields.find(x => x.req);
    if (req && !val(req.f)) { toast(req.label + "を入れてください"); return; }
    // 同じものがもう無いか（足すとき・名前を変えたとき）
    const dupName = all.find(r => r._k !== k && !r.外す && nk(r.名前) && nk(r.名前) === nk(val("名前")) && (id !== "kikai" || nk(r.規格) === nk(val("規格"))));
    const dupCode = id === "genba" && val("コード") ? all.find(r => r._k !== k && r.コード === val("コード")) : null;
    if (dupCode) { toast("同じ工事コードの現場がもうあります：" + (dupCode.名前 || dupCode.コード)); return; }
    if (dupName && !confirm(`「${dupName.名前}${id === "kikai" && dupName.規格 ? " " + dupName.規格 : ""}」がもうあります。それでも${isNew ? "足し" : "直し"}ますか？`)) return;
    const nkey = isNew ? (K.key(Object.fromEntries(K.fields.map(x => [x.f, val(x.f)]))) || newKey()) : k;
    if (isNew && all.some(r => r._k === nkey)) { toast("同じものがもうあります"); return; }
    const ent = { ...((S.fix[id] && S.fix[id].行 && S.fix[id].行[nkey]) || {}) };
    for (const x of K.fields) { const s = val(x.f); if ((isNew || p.追加) ? s !== "" : s !== String(b[x.f] ?? "")) ent[x.f] = s; else delete ent[x.f]; }
    if (fd.get("外す")) ent.外す = true; else delete ent.外す;
    if (String(fd.get("メモ") || "").trim()) ent.メモ = String(fd.get("メモ")).trim(); else delete ent.メモ;
    if (isNew || p.追加) ent.追加 = true;
    const keys = Object.keys(ent).filter(c => !["更新", "更新者"].includes(c));
    try { await saveOne(id, nkey, keys.length ? ent : null); closeDlg(false); } catch (e) { }
  });
  const u = $("bUndo");
  if (u) u.onclick = async () => {
    if (!confirm(p.追加 ? "この画面で足したものを一覧から消しますか？" : "直した分をやめて、元の一覧のとおりに戻しますか？")) return;
    try { await saveOne(id, k, null); closeDlg(false); } catch (e) { }
  };
}
// 1行分を書く：書く直前に読み直して、その行だけ入れる（ほかの人が同時に直した分を消さない）
async function saveOne(id, k, ent) {
  const K = kindOf(id);
  for (let i = 0; i < 3; i++) {
    const cur = await mst.get(K.file);
    const data = cur ? cur.data : { 形式: K.file.replace(/\.json$/, ""), 版: 1, 説明: `マスターの画面（master/）が書く。${K.name}の${K.file.includes("手直し") ? "直した・足した・外した分" : "一覧"}`, 行: {} };
    data.行 = data.行 || {};
    if (ent) data.行[k] = { ...ent, 更新: nowStr(), 更新者: S.me }; else delete data.行[k];
    try { const r = await mst.put(K.file, data, cur ? cur.eTag : null); S.fix[id] = data; S.tag[id] = r.eTag; break; }
    catch (e) { if ((e.status === 412 || e.status === 409) && i < 2) continue; toast("保存できませんでした：" + e.message, 6000); throw e; }
  }
  toast(ent ? "保存しました（ほかの端末にも届きます）" : "元に戻しました", 4000);
  render();
}

/* ---------- はじめ ---------- */
function setKind(id) {
  const K = kindOf(id); if (!K) return;
  if (K.link) { HX.go(K.link); return; }
  S.kind = id; S.f = "all"; S.q = ""; $("q").value = "";
  $("tabs").querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.f === "all"));
  try { history.replaceState(null, "", "#" + id); } catch (e) { }
  render();
}
async function start() {
  if (DEMO) {
    seedDemo(); S.me = "試し";
    $("who").textContent = "試し（このブラウザの中だけ。OneDrive には書きません）";
    mst = HX.demoStore("master_demo_store", "マスタ/"); kroot = HX.demoStore("master_demo_store", ""); kik = HX.demoStore("master_demo_store", "機械/");
  } else {
    if (location.protocol === "file:") { $("signin").hidden = false; $("bSignIn").hidden = true; $("signinMsg").textContent = "パソコンのファイルを直接開いているため、サインインできません。公開先から開いてください。"; return; }
    const s = await HX.signIn(); app = s.app;
    if (s.error) $("signinMsg").textContent = "サインインできませんでした：" + s.error.message;
    if (!s.account) { $("signin").hidden = false; $("bSignIn").onclick = () => HX.login(app); return; }
    S.me = s.account.name || s.account.username; $("who").textContent = S.me;
    mst = HX.store(app, "kotei", "マスタ"); kroot = HX.store(app, "kotei"); kik = HX.store(app, "kikai");
  }
  const h = location.hash.slice(1); if (kindOf(h) && !kindOf(h).link) S.kind = h;
  $("app").hidden = false;
  $("kinds").onclick = e => { const b = e.target.closest("[data-kind]"); if (b) setKind(b.dataset.kind); };
  $("tabs").onclick = e => { const b = e.target.closest("[data-f]"); if (!b) return; S.f = b.dataset.f; $("tabs").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); render(); };
  $("q").oninput = e => { S.q = e.target.value; render(); };
  $("bAdd").onclick = () => edit(null);
  $("tbl").tBodies[0].onclick = e => { const tr = e.target.closest("tr[data-k]"); if (tr) edit(tr.dataset.k); };
  render();
  try { await loadAll(); } catch (e) { toast("マスターを読めませんでした：" + e.message, 8000); }
}
start();
