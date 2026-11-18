/* 日報スマホ（試作。2026-11-18 ユーザー）
   ・PC の作業日報（詳細日報）と同じ中身をスマホで打てるように：上の欄（元請業者・現場名・日付・天気・気温・記入者・区分）／作業予定・完了報告／
     作業員・使用機材・材料／外注／高速・燃料。スマホではタブで分ける（基本・作業・作業員・機械・材料・外注・高速・燃料）。
   ・予定か報告か：上の「予定｜報告」で、作業の欄に書くのが作業予定か完了報告かを決める（PC の「作業予定を完了報告へコピー」と同じボタンもある）。
   ・全体工程からの入力支援：選んだ現場・日付の工程（工種・人数・社員・外注）を出し、押すと作業予定・作業員・外注に入れる。
   ・外注は会社を先に選び、その会社の人だけを出す（ほかの会社の人を出さない。名簿の 会社 と違う人は保存できない）。
   ・【大事】スマホで文字を打てるプルダウンを使わない（キーボードが候補を隠す。2026-11-18 ユーザー）。候補は「押すと下から出る窓」で選ぶ。
     候補に無いものを書くときだけ「書く」を押してキーボードを出す。
   ・保存はこのブラウザの中だけ（spn_proto_v1）。本物の日報には書かない。「作業日報の形で見る」で PC の用紙の並び（上・下・外注・車）を確かめる。
   ・公開の置き場に置くので、この中に本当の人の名前・会社名を書かない（名前はサインインして OneDrive から読む。試しは作りもの）。 */
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nk = s => HX.nameKey(s);
const DEMO = HX.demo;
const SELF = "ハシックス";   // 自社の会社名（詳細日報と同じ）
const LKEY = "spn_proto_v1";
const WX = ["晴", "曇", "雨", "雪", "晴/曇", "曇/晴", "曇/雨", "雨/曇", "晴/雨"];
const WD = "日月火水木金土";
const TEIJI = { 昼: ["8:00", "17:00"], 夜: ["21:00", "6:00"] };   // 定時（現場ごとの定時は詳細日報の現場の設定。試作は決め打ち）
const COLORS = { 青: "#1e88e5", 赤: "#e53935", 緑: "#43a047", 橙: "#fb8c00", 紫: "#8e24aa", 黄: "#fdd835", 茶: "#6d4c41", 灰: "#757575", 水: "#00acc1", 桃: "#ec407a" };

const pad = n => String(n).padStart(2, "0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => keyOf(new Date());
const dateOf = k => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const jpd = k => k ? `${+k.slice(5, 7)}/${+k.slice(8)}（${WD[dateOf(k).getDay()]}）` : "";
const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// 全角の数字・記号を半角に（入力欄のIMEルール：スマホ・Chrome は IME を止められないので受ける側で直す）
const han = s => String(s ?? "").replace(/[０-９．，：－]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[ー−]/g, "-").trim();
const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
const normTime = v => { const m = /^0?(\d{1,2}):(\d{2})/.exec(han(v)); return m ? `${+m[1]}:${m[2]}` : ""; };
const t2input = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? pad(+m[1]) + ":" + m[2] : ""; };
// 残（時間）：定時より早く始めた分＋遅く終わった分。夜をまたぐ終業は＋24時間（詳細日報の otParts と同じ考え）
function zan(st, en, sh) {
  const [ts, te] = TEIJI[sh === "夜" ? "夜" : "昼"];
  const a = toMin(st), b0 = toMin(en), A = toMin(ts), B0 = toMin(te);
  if (a == null || b0 == null) return "";
  const b = b0 < a ? b0 + 1440 : b0, B = B0 <= A ? B0 + 1440 : B0;
  const a2 = A - a > 720 ? a + 1440 : a, b2 = A - a > 720 ? b + 1440 : b;
  const m = Math.max(0, A - a2) + Math.max(0, b2 - B);
  return m ? String(Math.round(m / 60 * 100) / 100) : "";
}

/* ================= 状態 ================= */
const S = {
  mode: "予定", tab: "kihon", rec: null, dirty: false,
  M: { 社員: [], 従業員: [], 外注業者: [], 現場: [], 機械: [], 車両: [] },
  people: [],      // 名簿（HX.people。区分・会社）
  sites: [],       // 全体工程の現場（段・バー）
  genba: [],       // 現場一覧（元請）
  me: ""
};
function blank() {
  return { id: uid(), 日付: today(), 勤務: "昼", 元請: "", 現場: "", 記入者: S.me, 区分: "請負", 天気: "", 気温: "",
    作業: [{ 予定: "", 報告: "" }], 作業員: [], 機械: [], 材料: [], 外注: [], 車: [], 更新: "" };
}
const recs = () => { try { return (JSON.parse(localStorage.getItem(LKEY)) || {}).recs || []; } catch (e) { return []; } };
const putRecs = a => { try { localStorage.setItem(LKEY, JSON.stringify({ recs: a })); return true; } catch (e) { toast("このブラウザに保存できません：" + e.message); return false; } };
function toast(t, ms) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, ms || 3000); }
function touch() { S.dirty = true; }

/* ================= 名簿・候補 ================= */
const ym = () => today().slice(0, 7);
function own() {   // 自社（社員・従業員）
  const out = new Map();
  for (const p of S.people) if ((p.区分 === "社員" || p.区分 === "従業員") && HX.activeOn(p, ym())) out.set(nk(p.名前), { 名前: p.名前, 区分: p.区分, かな: p.ふりがな || "" });
  for (const k of ["社員", "従業員"]) for (const n of S.M[k]) if (!out.has(nk(n)) && !S.people.some(p => nk(p.名前) === nk(n) && !HX.activeOn(p, ym()))) out.set(nk(n), { 名前: n, 区分: k, かな: "" });
  return [...out.values()];
}
function companies() {
  const set = new Map();
  S.M.外注業者.forEach(n => n && set.set(nk(n), n));
  S.people.forEach(p => { if (p.区分 === "外注" && p.会社 && !set.has(nk(p.会社))) set.set(nk(p.会社), p.会社); });
  return [...set.values()].sort((a, b) => a.localeCompare(b, "ja"));
}
// その会社の人だけ（ほかの会社の人は出さない）
const membersOf = co => S.people.filter(p => p.区分 === "外注" && nk(p.会社) === nk(co) && HX.activeOn(p, ym())).map(p => ({ 名前: p.名前, かな: p.ふりがな || "" }));
const companyOfPerson = n => { const p = S.people.find(x => nk(x.名前) === nk(n)); return p ? (p.区分 === "外注" ? p.会社 || "" : SELF) : null; };
// 現場の候補。2026-11-18 ユーザー：候補が多くてわかりにくい → 現場一覧・マスタ・全体工程の同じ現場は1つにまとめる
// （名前がほぼ同じ＝片方がもう片方を含む ものも同じ現場。名前は現場一覧 → マスタ → 全体工程 の順で先に出たもの）
const sameSite = (a, b) => { a = nk(a); b = nk(b); return !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)))); };
function siteNames() {
  const out = [];
  const add = (名前, 元請, 元, x0) => {
    if (!名前) return;
    let x = out.find(s => sameSite(s.名前, 名前));
    if (!x) { x = { 名前, 元請: "", 元: [], 工期自: "", 工期至: "" }; out.push(x); }
    if (元請 && !x.元請) x.元請 = 元請;
    if (!x.元.includes(元)) x.元.push(元);
    if (x0 && x0.工期自 && !x.工期自) { x.工期自 = x0.工期自; x.工期至 = x0.工期至 || ""; }
  };
  S.genba.forEach(g => add(g.名前 || g.正式名, g.元請 || "", "現場一覧", g));
  S.M.現場.forEach(s => add(s.名前, s.元請 || "", "マスタ"));
  S.sites.forEach(s => add(s.名前, "", "工程"));
  return out;
}
// その日に全体工程表で工程がある現場か（休みの日は除く）
const workingOn = (name, k) => S.sites.some(s => sameSite(s.名前, name) && (s.バー || []).some(b => b.開始 <= k && k <= b.終了 && !(b.休み || []).includes(k)));
// 現場を選ぶ窓のまとまり：その日に工程がある → 前に書いた → 工期中 → ほか（押したときだけ出す）。元請を選んでいれば、その元請の現場だけを上に
function siteGroups(r) {
  const all = siteNames(), k = r.日付, seen = new Set(), sub = s => s.元請 || "";
  const moto = r.元請 && S.autoMoto !== r.id ? r.元請 : "";   // 現場を選んだときに自動で入った元請では絞らない（選び直しやすく）
  const take = (name, list, fold) => { const items = list.filter(s => !seen.has(s)); items.forEach(s => seen.add(s)); return items.length ? { name, fold, items: items.map(s => ({ v: s.名前, sub: sub(s) })) } : null; };
  const pool = moto ? all.filter(s => nk(s.元請) === nk(moto)) : all;
  const used = []; recs().slice().sort((a, b) => String(b.更新).localeCompare(String(a.更新))).forEach(x => { const s = pool.find(y => sameSite(y.名前, x.現場)); if (s && !used.includes(s) && used.length < 6) used.push(s); });
  const g = [
    take(jpd(k) + " に全体工程表で工程がある現場", pool.filter(s => workingOn(s.名前, k))),
    take("前に書いた現場", used),
    take("工期中の現場", pool.filter(s => s.工期自 && s.工期自 <= k && (!s.工期至 || k <= s.工期至))),
    take(moto ? moto + " のほかの現場" : "ほかの現場（工期の外・工期の分からないもの）", pool, true)
  ];
  if (moto) g.push(take("ほかの元請の現場", all, true));
  return g.filter(Boolean);
}
const motoList = () => [...new Set(siteNames().map(s => s.元請).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
// 使ったことのある値（このブラウザの保存から）：材料名・区間・工種 など
function usedVals(list, f) { const set = new Set(); recs().forEach(r => (r[list] || []).forEach(x => x[f] && set.add(x[f]))); return [...set]; }

/* ================= 全体工程から ================= */
function koteiSite(name) {
  const a = nk(name); if (!a) return null;
  return S.sites.find(s => nk(s.名前) === a) || S.sites.find(s => { const b = nk(s.名前); return b.length >= 3 && (a.includes(b) || b.includes(a)); }) || null;
}
const laneWork = ln => !ln ? "" : ln.区分 ? (ln.名前 || "") : String(ln.名前 || "").replace(/昼間|夜間/g, "").trim();
function planOf(r) {
  const s = koteiSite(r.現場), k = r.日付; if (!s) return null;
  const out = [];
  for (const b of s.バー || []) {
    if (!(b.開始 <= k && k <= b.終了)) continue;
    if ((b.休み || []).includes(k)) continue;
    const ln = (s.段 || []).find(l => l.id === b.段) || {};
    const 作業 = b.作業 || ln.作業 || laneWork(ln) || "";
    const 夜 = /夜/.test(ln.名前 || "") || ln.区分 === "夜";
    const gaiOnly = ln.種別 === "外注";
    const 人数 = gaiOnly ? "" : String((b.人数日 && b.人数日[k]) || b.人数 || ln.人数 || "");
    let 社員 = (b.社員 && b.社員.length ? b.社員 : ln.社員 || []).slice();
    for (const x of b.不在 || []) if (x.開始 <= k && k <= x.終了) { 社員 = x.社員 ? 社員.filter(n => nk(n) !== nk(x.社員)) : []; (x.代わり || []).forEach(n => 社員.includes(n) || 社員.push(n)); }
    const 外注 = gaiOnly ? { 業者: ln.業者 || "", 人数: String((b.人数日 && b.人数日[k]) || b.人数 || ln.人数 || "") } : (ln.業者 || ln.外注人数) ? { 業者: ln.業者 || "", 人数: String(ln.外注人数 || "") } : null;
    out.push({ id: b.id, 作業, 夜, 人数, 社員, 外注, 色: COLORS[b.色] || b.色 || "#999" });
  }
  return { site: s, list: out };
}
function planHtml(r, what) {
  if (!r.現場) return "";
  const p = planOf(r);
  if (!p) return `<div class="plan"><div class="pt">全体工程から</div><div class="hint">この現場は全体工程表にありません。</div></div>`;
  if (!p.list.length) return `<div class="plan"><div class="pt">全体工程から（${jpd(r.日付)}）</div><div class="hint">この日の工程はありません。</div></div>`;
  return `<div class="plan"><div class="pt">全体工程から（${jpd(r.日付)}）　押すと入ります</div>` + p.list.map((x, i) => {
    const sub = [x.夜 ? "夜" : "昼", x.人数 ? "作業員 " + x.人数 + "名" : "", x.社員.length ? "社員 " + x.社員.join("・") : "", x.外注 ? "外注 " + (x.外注.業者 || "（業者未定）") + (x.外注.人数 ? " " + x.外注.人数 + "名" : "") : ""].filter(Boolean).join("　");
    const btn = what === "gai" ? (x.外注 && x.外注.業者 ? `<button type="button" class="sub small" data-act="planGai" data-i="${i}">選ぶ</button>` : "")
      : what === "hito" ? (x.社員.length ? `<button type="button" class="sub small" data-act="planHito" data-i="${i}">入れる</button>` : "")
      : `<button type="button" class="sub small" data-act="planAll" data-i="${i}">入れる</button>`;
    return `<div class="pi"><span class="sw" style="background:${esc(x.色)}"></span><div class="tx"><b>${esc(x.作業 || "（作業名なし）")}</b><small>${esc(sub)}</small></div>${btn}</div>`;
  }).join("") + `</div>`;
}
function addWorkers(names, 工種, sh) {
  let n = 0;
  for (const nm of names) {
    if (S.rec.作業員.some(w => nk(w.名前) === nk(nm) && w.昼夜 === sh) || S.rec.外注.some(w => nk(w.名前) === nk(nm) && w.昼夜 === sh)) continue;
    S.rec.作業員.push({ 会社: SELF, 名前: nm, 昼夜: sh, 始業: TEIJI[sh][0], 終業: TEIJI[sh][1], 工種: 工種 || "", 残: "" }); n++;
  }
  return n;
}
function applyPlan(i, part) {
  const p = planOf(S.rec), x = p && p.list[+i]; if (!x) return;
  const sh = x.夜 ? "夜" : "昼", r = S.rec, msg = [];
  if (part === "all" || part === "sagyo") {
    const col = S.mode === "報告" ? "報告" : "予定";
    if (x.作業 && !r.作業.some(w => w[col].split(/\s+/).includes(x.作業))) {
      const e = r.作業.find(w => !w[col]); if (e) e[col] = x.作業; else r.作業.push({ 予定: col === "予定" ? x.作業 : "", 報告: col === "報告" ? x.作業 : "" });
      msg.push("作業" + (col === "予定" ? "予定" : "完了報告") + "に「" + x.作業 + "」");
    }
    if (part === "all" && r.勤務 !== sh && !r.作業員.length) r.勤務 = sh;
  }
  if (part === "all" || part === "hito") {
    const known = x.社員.filter(n => own().some(o => nk(o.名前) === nk(n)));
    const n = addWorkers(known, x.作業, sh); if (n) msg.push("作業員 " + n + "人");
    if (known.length < x.社員.length) msg.push("名簿に無い社員は入れていません：" + x.社員.filter(n => !known.includes(n)).join("・"));
  }
  touch(); render();
  if (part === "all" && x.外注 && x.外注.業者) msg.push("外注（" + x.外注.業者 + "）は「外注」のタブで名前を選んでください");
  toast(msg.join("／") || "もう入っています", 4500);
}

/* ================= 下から出る窓（選ぶ） ================= */
let SH = null;
function openSheet(title, html, onOk, okLabel) {
  SH = { onOk }; $("sBody").onclick = null;
  $("sTitle").textContent = title; $("sBody").innerHTML = html;
  $("sOk").hidden = !onOk; $("sOk").textContent = okLabel || "決める";
  $("sheet").hidden = false; document.body.classList.add("lock");
  $("sBody").scrollTop = 0;
}
function closeSheet() { $("sheet").hidden = true; document.body.classList.remove("lock"); SH = null; }
$("sClose").onclick = closeSheet;
$("sOk").onclick = () => { const f = SH && SH.onOk; if (f && f() === false) return; closeSheet(); };
const KANA = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"];
const kanaRow = s => { const c = String(s || "").replace(/^[\s　]+/, "")[0] || ""; if (!/[ぁ-ん]/.test(c)) return "他"; const order = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん"; const n = "ぁぃぅぇぉがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゃゅょっゎ"; const m = "あいうえおかきくけこさしすせそたちつてとはひふへほはひふへほやゆよつわ"; const cc = n.includes(c) ? m[n.indexOf(c)] : c; const i = order.indexOf(cc); return i < 0 ? "他" : KANA[Math.min(9, i < 45 ? Math.floor(i / 5) : i < 48 ? 7 : i < 53 ? 8 : 9)]; };
/* 候補から選ぶ。groups=[{name, items:[{v, label, sub, used}]}]。multi＝いくつも。free＝候補に無いものを書ける（「書く」を押したときだけキーボード） */
function pick(o) {
  const sel = new Set(o.multi ? (o.value || []) : []);
  const all = o.groups.flatMap(g => g.items);
  const useKana = all.length > 24 && all.some(x => x.kana);
  let kana = "";
  const opened = new Set();   // たたんだまとまり（fold）のうち、開いたもの
  const draw = () => {
    const chips = g => g.items.filter(x => !kana || kanaRow(x.kana) === kana).map(x => `<button type="button" data-v="${esc(x.v)}" class="${sel.has(x.v) || (!o.multi && x.v === o.value) ? "on" : ""} ${x.used ? "used" : ""}" ${x.used ? 'title="もう入っています"' : ""}>${esc(x.label || x.v)}${x.sub ? `<small> ${esc(x.sub)}</small>` : ""}</button>`).join("");
    const body = o.groups.map((g, gi) => { const c = chips(g); if (!c) return "";
      if (g.fold && !opened.has(gi) && !g.items.some(x => x.v === o.value)) return `<div class="free"><button type="button" class="sub" data-fold="${gi}">${esc(g.name)}を出す（${g.items.length}）</button></div>`;
      return (g.name ? `<div class="grp">${esc(g.name)}</div>` : "") + `<div class="chips">${c}</div>`; }).join("") || `<div class="empty">${esc(o.empty || "候補がありません")}</div>`;
    $("sBody").innerHTML = (o.note ? `<div class="hint">${o.note}</div>` : "") +
      (useKana ? `<div class="kana">${["", ...KANA, "他"].map(k => `<button type="button" data-kana="${k}" class="${k === kana ? "on" : ""}">${k || "全部"}</button>`).join("")}</div>` : "") + body +
      (o.clear && !o.multi && o.value ? `<div class="free"><button type="button" class="sub" data-clear="1">空にする</button></div>` : "") +
      (o.free ? `<div class="free"><button type="button" class="sub" data-free="1">候補に無いものを書く</button><div id="freeBox" hidden><input type="text" id="freeIn" ${o.freeMode ? `inputmode="${o.freeMode}"` : ""}><button type="button" class="pri small" data-freeok="1" style="margin-top:6px">これにする</button></div></div>` : "");
  };
  openSheet(o.title, "", o.multi ? () => { o.done([...sel]); } : null, o.multi ? "入れる" : "");
  draw();
  $("sBody").onclick = e => {
    const k = e.target.closest("[data-kana]"); if (k) { kana = k.dataset.kana; draw(); return; }
    const fd = e.target.closest("[data-fold]"); if (fd) { opened.add(+fd.dataset.fold); draw(); return; }
    if (e.target.closest('[data-act2="chgco"]') && o.chgco) { closeSheet(); o.chgco(); return; }
    if (e.target.closest("[data-clear]")) { o.done(""); closeSheet(); return; }
    if (e.target.closest("[data-free]")) { $("freeBox").hidden = false; $("freeIn").focus(); return; }   // ここで初めてキーボード
    if (e.target.closest("[data-freeok]")) { const v = $("freeIn").value.trim(); if (!v) return; o.done(o.multi ? [...sel, v] : v); closeSheet(); return; }
    const b = e.target.closest("[data-v]"); if (!b) return;
    const v = b.dataset.v;
    if (o.multi) { if (b.classList.contains("used") && !sel.has(v)) { toast("もう入っています"); return; } sel.has(v) ? sel.delete(v) : sel.add(v); b.classList.toggle("on"); }
    else { o.done(v); closeSheet(); }
  };
}
const pkBtn = (v, ph, attrs, ng) => `<button type="button" class="pk ${v ? "" : "ph"} ${ng ? "ng" : ""}" ${attrs}>${esc(v || ph)}</button>`;

/* ================= 見せる ================= */
function render() {
  const r = S.rec;
  document.querySelectorAll("#mode button").forEach(b => b.classList.toggle("on", b.dataset.mode === S.mode));
  const n = { sagyo: r.作業.filter(w => w.予定 || w.報告).length, hito: r.作業員.length, kikai: r.機械.length, zai: r.材料.length, gai: r.外注.length, car: r.車.length };
  document.querySelectorAll("#tabs button").forEach(b => { b.classList.toggle("on", b.dataset.tab === S.tab); const c = n[b.dataset.tab]; b.innerHTML = b.textContent.replace(/\d+$/, "") + (c ? `<span class="n">${c}</span>` : ""); });
  $("cur").innerHTML = `<b>${jpd(r.日付)}</b>　${r.勤務}　${r.現場 ? `<b>${esc(r.現場)}</b>` : '<span class="ng">現場を選んでください</span>'}　${r.区分 === "常用" ? "<b>常用</b>" : "請負"}${S.dirty ? "　<small>（保存していません）</small>" : ""}`;
  $("pane").innerHTML = ({ kihon, sagyo, hito, kikai, zai, gai, car })[S.tab](r);
}
const fh = (t, req, note, right) => `<div class="fh">${t}${req ? ' <span class="req">＊</span>' : ""}${note ? ` <span class="note">${note}</span>` : ""}${right ? `<span class="r">${right}</span>` : ""}</div>`;
const segH = (f, list, cur, l, i) => `<div class="seg">${list.map(v => `<button type="button" data-seg="${f}" data-v="${esc(v)}" ${l ? `data-l="${l}" data-i="${i}"` : ""} class="${v === cur ? "on" : ""}">${esc(v)}</button>`).join("")}</div>`;
const inp = (l, i, f, v, extra) => `<input type="text" data-l="${l}" data-i="${i}" data-f="${f}" value="${esc(v)}" ${extra || ""}>`;
const num = (l, i, f, v, ph) => inp(l, i, f, v, `inputmode="decimal" placeholder="${esc(ph || "")}"`);
const tim = (l, i, f, v) => `<input type="time" data-l="${l}" data-i="${i}" data-f="${f}" value="${t2input(v)}">`;

function kihon(r) {
  return fh("日付", true) + `<div class="fv"><div class="row2"><input type="date" data-l="" data-f="日付" value="${r.日付}"><div>${segH("勤務", ["昼", "夜"], r.勤務)}</div></div><div class="hint">昼夜は、作業員・外注を足すときの始めの値（人ごとに変えられます）。</div></div>` +
    fh("元請業者") + `<div class="fv">${pkBtn(r.元請, "押して選ぶ", 'data-act="pickMoto"')}</div>` +
    fh("現場名", true) + `<div class="fv">${pkBtn(r.現場, "押して選ぶ", 'data-act="pickSite"', !r.現場)}</div>` +
    fh("区分", false, "常用の日だけ印を付ける。付けない日＝請負") + `<div class="fv"><button type="button" class="chk ${r.区分 === "常用" ? "on" : ""}" data-act="joyo" aria-pressed="${r.区分 === "常用"}">${r.区分 === "常用" ? "✅" : "☐"} 常用</button></div>` +
    fh("天気") + `<div class="fv">${segH("天気", WX, r.天気)}</div>` +
    fh("気温", false, "℃") + `<div class="fv" style="max-width:160px">${num("", "", "気温", r.気温, "例 12")}</div>` +
    fh("記入者") + `<div class="fv">${pkBtn(r.記入者, "押して選ぶ", 'data-act="pickMe"')}</div>` +
    `<div class="fv hint">保存はこのブラウザの中だけです（試作）。本物の日報には書きません。</div>`;
}
function sagyo(r) {
  const col = S.mode === "報告" ? "報告" : "予定", other = col === "報告" ? "予定" : "報告";
  return planHtml(r, "sagyo") +
    fh(col === "予定" ? "作業予定" : "完了報告", false, "1行に1つ", col === "報告" ? `<button type="button" class="sub small" data-act="copyPlan">作業予定を完了報告へコピー</button>` : "") +
    r.作業.map((w, i) => `<div class="card"><div class="ch">${i + 1}<button type="button" class="x" data-act="del" data-l="作業" data-i="${i}" title="この行を消す">✕</button></div>` +
      (w[other] ? `<div class="ref">${other === "予定" ? "作業予定" : "完了報告"}：${esc(w[other])}</div>` : "") +
      `<textarea data-l="作業" data-i="${i}" data-f="${col}" rows="2" placeholder="${col === "予定" ? "作業予定" : "完了報告"}">${esc(w[col])}</textarea></div>`).join("") +
    `<button type="button" class="add" data-act="addSagyo">＋ 行を足す</button>`;
}
function personCard(l, w, i) {
  const ng = rowErr(l, w, i);
  const auto = zan(w.始業, w.終業, w.昼夜);
  return `<div class="card ${ng ? "ng" : ""}"><div class="ch">${pkBtn(w.名前, "名前を選ぶ", `data-act="pickName" data-l="${l}" data-i="${i}"`, !w.名前)}<button type="button" class="x" data-act="del" data-l="${l}" data-i="${i}" title="消す">✕</button></div>` +
    `<div class="ch" style="margin-top:4px"><span class="co">${esc(w.会社 || "会社なし")}</span></div>` +
    `<label class="lb">昼夜</label>${segH("昼夜", ["昼", "夜"], w.昼夜, l, i)}` +
    `<div class="grid3"><div><label class="lb">始業時間</label>${tim(l, i, "始業", w.始業)}</div><div><label class="lb">終業時間</label>${tim(l, i, "終業", w.終業)}</div><div><label class="lb">残（時間）</label>${num(l, i, "残", w.残, auto || "0")}</div></div>` +
    `<label class="lb">工種</label>${pkBtn(w.工種, "押して選ぶ", `data-act="pickKoshu" data-l="${l}" data-i="${i}"`)}` +
    (ng ? `<div class="msg">${esc(ng)}</div>` : "") + `</div>`;
}
function rowErr(l, w, i) {
  const r = S.rec;
  if (!w.名前) return "名前を選んでください";
  if (l === "外注") {
    const co = companyOfPerson(w.名前);
    if (!w.会社) return "会社を選んでください";
    if (co != null && nk(co) !== nk(w.会社)) return `名簿ではこの人の会社は「${co || "なし"}」です（${w.会社} の人ではありません）`;
    if (co == null) return "名簿にいない人です（名簿で足してください）";
  }
  const same = (a, j, l2) => a.some((x, k) => (l2 !== l || k !== j) && nk(x.名前) === nk(w.名前) && x.昼夜 === w.昼夜);
  if (same(r.作業員, i, "作業員") || same(r.外注, i, "外注")) return "同じ人が同じ昼夜に2回入っています（作業員と外注にも重ねられません）";
  return "";
}
function hito(r) {
  const by = {};
  r.作業員.concat(r.外注).forEach(w => { const k = (w.工種 || "（工種なし）") + "｜" + w.昼夜; by[k] = (by[k] || 0) + 1; });
  const sum = Object.keys(by).length ? `<div class="sum"><b>工種別の集計</b>（作業員＋外注）<table><tr><th>工種</th><th>昼夜</th><th>人員</th></tr>${Object.entries(by).map(([k, v]) => { const [a, b] = k.split("｜"); return `<tr><td>${esc(a)}</td><td>${b}</td><td>${v}</td></tr>`; }).join("")}</table></div>` : "";
  return planHtml(r, "hito") + fh("作業員", false, "自社の人（社員・従業員）") +
    (r.作業員.length ? r.作業員.map((w, i) => personCard("作業員", w, i)).join("") : `<div class="empty">まだいません。</div>`) +
    `<button type="button" class="add" data-act="addHito">＋ 作業員を選ぶ</button>` + sum;
}
function kikai(r) {
  return fh("使用機材", false, "作業員の表の 使用機材・規格・所有者・数量") +
    (r.機械.length ? r.機械.map((m, i) => `<div class="card"><div class="ch">${pkBtn(m.使用機材, "使用機材を選ぶ", `data-act="pickKiki" data-i="${i}"`, !m.使用機材)}<button type="button" class="x" data-act="del" data-l="機械" data-i="${i}">✕</button></div>` +
      `<div class="grid2"><div><label class="lb">規格・形式</label>${pkBtn(m.規格, "選ぶ", `data-act="pickKikaku" data-i="${i}"`)}</div><div><label class="lb">所有者</label>${pkBtn(m.所有者, "選ぶ", `data-act="pickOwner" data-i="${i}"`)}</div></div>` +
      `<div style="max-width:140px"><label class="lb">数量</label>${num("機械", i, "数量", m.数量, "1")}</div></div>`).join("") : `<div class="empty">まだありません。</div>`) +
    `<button type="button" class="add" data-act="addKikai">＋ 機械を足す</button>`;
}
function zai(r) {
  return fh("材料", false, "材料名・数量・実費（領収書の金額など）") +
    (r.材料.length ? r.材料.map((m, i) => `<div class="card"><div class="ch">${pkBtn(m.材料名, "材料名を選ぶ", `data-act="pickZai" data-i="${i}"`, !m.材料名)}<button type="button" class="x" data-act="del" data-l="材料" data-i="${i}">✕</button></div>` +
      `<div class="grid2"><div><label class="lb">数量</label>${num("材料", i, "数量", m.数量)}</div><div><label class="lb">実費（円）</label>${num("材料", i, "実費", m.実費)}</div></div></div>`).join("") : `<div class="empty">まだありません。</div>`) +
    `<button type="button" class="add" data-act="addZai">＋ 材料を足す</button>`;
}
function gai(r) {
  return planHtml(r, "gai") + fh("外注", false, "外注として来た人。会社を選ぶとその会社の人だけが出ます") +
    (r.外注.length ? r.外注.map((w, i) => personCard("外注", w, i)).join("") : `<div class="empty">まだいません。</div>`) +
    `<button type="button" class="add" data-act="addGai">＋ 会社を選んで人を足す</button>`;
}
function car(r) {
  return fh("高速・燃料", false, "高速＝往路・復路・往復と区間／燃料＝軽油・ガソリンと給油(L)。実費を入れるとその金額") +
    (r.車.length ? r.車.map((c, i) => `<div class="card"><div class="ch">${segH("種類", ["高速", "軽油", "ガソリン"], c.種類, "車", i)}<button type="button" class="x" data-act="del" data-l="車" data-i="${i}">✕</button></div>` +
      (c.種類 === "高速" ? `<label class="lb">往復</label>${segH("往復", ["往路", "復路", "往復"], c.往復, "車", i)}<label class="lb">高速の区間</label>${pkBtn(c.区間, "区間を選ぶ", `data-act="pickKukan" data-i="${i}"`)}`
        : `<div style="max-width:160px"><label class="lb">給油(L)</label>${num("車", i, "給油", c.給油)}</div>`) +
      `<div style="max-width:180px"><label class="lb">実費（円）</label>${num("車", i, "実費", c.実費)}</div>` +
      `<label class="lb">だれ（会社・名前）</label>${pkBtn(c.名前 ? c.名前 + "（" + (c.会社 || "") + "）" : "", "押して選ぶ", `data-act="pickDriver" data-i="${i}"`)}` +
      `<div class="grid2"><div><label class="lb">車両名</label>${pkBtn(c.車両名, "選ぶ", `data-act="pickCar" data-i="${i}"`)}</div><div><label class="lb">車番</label>${inp("車", i, "車番", c.車番)}</div></div>` +
      `<label class="lb">メモ</label>${inp("車", i, "メモ", c.メモ)}</div>`).join("") : `<div class="empty">まだありません。</div>`) +
    `<button type="button" class="add" data-act="addCar">＋ 高速・燃料を足す</button>`;
}

/* ================= 入力 ================= */
$("mode").onclick = e => { const b = e.target.closest("[data-mode]"); if (!b) return; S.mode = b.dataset.mode; if (S.tab === "kihon") S.tab = "sagyo"; render(); };
$("tabs").onclick = e => { const b = e.target.closest("[data-tab]"); if (!b) return; S.tab = b.dataset.tab; render(); scrollTo(0, 0); };
function target(el) { const l = el.dataset.l; return l ? S.rec[l][+el.dataset.i] : S.rec; }
$("pane").addEventListener("input", e => {
  const el = e.target; if (!el.dataset.f) return;
  const o = target(el); if (!o) return;
  let v = el.value;
  if (el.inputMode === "decimal") v = han(v);
  if (el.type === "time") v = normTime(v);
  o[el.dataset.f] = v; touch();
  if (el.dataset.f === "日付") render();
  if (el.type === "time") { const card = el.closest(".card"); const z = card && card.querySelector('[data-f="残"]'); const w = target(el); if (z && w) z.placeholder = zan(w.始業, w.終業, w.昼夜) || "0"; }
});
$("pane").addEventListener("change", e => { const el = e.target; if (el.inputMode === "decimal" && el.value !== han(el.value)) el.value = han(el.value); if (el.dataset.f && el.tagName !== "TEXTAREA") render(); });
$("pane").addEventListener("click", e => {
  const sg = e.target.closest("[data-seg]");
  if (sg) { const o = sg.dataset.l ? S.rec[sg.dataset.l][+sg.dataset.i] : S.rec, f = sg.dataset.seg; o[f] = o[f] === sg.dataset.v && (f === "天気" || f === "区分") ? "" : sg.dataset.v; touch(); render(); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const r = S.rec, i = +b.dataset.i, l = b.dataset.l, act = b.dataset.act;
  const set = (o, f) => v => { o[f] = v; touch(); render(); };
  switch (act) {
    case "planAll": return applyPlan(b.dataset.i, "all");
    case "planHito": return applyPlan(b.dataset.i, "hito");
    case "planGai": { const x = planOf(r).list[i]; return addGaiFlow(x.外注.業者, x.作業, x.夜 ? "夜" : "昼"); }
    case "del": { const a = r[l]; const what = l === "作業" ? "この行" : (a[i].名前 || a[i].使用機材 || a[i].材料名 || a[i].種類 || "これ"); if (!confirm(what + " を消しますか？")) return; a.splice(i, 1); if (l === "作業" && !a.length) a.push({ 予定: "", 報告: "" }); touch(); render(); return; }
    case "copyPlan": {
      const n = r.作業.filter(w => w.予定 && !w.報告).length;
      if (!n) { toast("写す作業予定がありません（完了報告が空の行だけ写します）"); return; }
      r.作業.forEach(w => { if (w.予定 && !w.報告) w.報告 = w.予定; }); touch(); render(); toast(n + "行を完了報告へ写しました"); return;
    }
    // 2026-11-18 ユーザー：常用・請負を選ばせるのをやめ、常用の印だけ（触らなければ請負のまま次に進める）
    case "joyo": r.区分 = r.区分 === "常用" ? "請負" : "常用"; S.autoJoyo = null; touch(); render(); return;
    case "addSagyo": r.作業.push({ 予定: "", 報告: "" }); touch(); render(); return;
    case "pickMoto": return pick({ title: "元請業者", groups: [{ items: motoList().map(v => ({ v })) }], value: r.元請, clear: true, free: true, empty: "元請の一覧がありません", done: v => { r.元請 = v; S.autoMoto = null; touch(); render(); } });
    case "pickSite": {
      const all = siteNames();
      return pick({ title: "現場名", groups: siteGroups(r), value: r.現場, free: true, done: v => {
        r.現場 = v; const s = all.find(x => x.名前 === v); if (s && s.元請 && (!r.元請 || S.autoMoto === r.id)) { r.元請 = s.元請; S.autoMoto = r.id; }
        // 常用かどうかは、この現場で前に書いた日報と同じにする（PC の詳細日報の「前回の設定を保持」と同じ考え）
        const last = recs().filter(x => x.id !== r.id && sameSite(x.現場, v)).sort((a, b) => String(b.更新).localeCompare(String(a.更新)))[0];
        if (last) { r.区分 = last.区分 === "常用" ? "常用" : "請負"; S.autoJoyo = r.id; }
        else if (S.autoJoyo === r.id) { r.区分 = "請負"; S.autoJoyo = null; }   // 前の現場から自動で入れた印は持ち越さない
        touch(); render();
      } });
    }
    case "pickMe": { const a = own(); return pick({ title: "記入者", groups: ["社員", "従業員"].map(k => ({ name: k, items: a.filter(p => p.区分 === k).map(p => ({ v: p.名前, kana: p.かな })) })), value: r.記入者, done: set(r, "記入者") }); }
    case "addHito": return pickWorkers();
    case "pickName": {
      const w = r[l][i];
      if (l === "外注") {
        if (!w.会社) return pickCompany(co => { w.会社 = co; w.名前 = ""; touch(); render(); });
        const m = membersOf(w.会社);
        return pick({ title: w.会社 + " の人", groups: [{ items: m.map(p => ({ v: p.名前, kana: p.かな, used: usedName(p.名前, w.昼夜) && nk(p.名前) !== nk(w.名前) })) }], value: w.名前,
          note: `${esc(w.会社)} の人だけを出しています。<button type="button" class="sub small" data-act2="chgco">会社を変える</button>`, empty: "この会社の人は名簿にいません（名簿の画面で足してください）", done: set(w, "名前"),
          chgco: () => pickCompany(co => { if (nk(co) !== nk(w.会社)) { w.会社 = co; w.名前 = ""; } touch(); render(); document.querySelector(`[data-act="pickName"][data-l="外注"][data-i="${i}"]`).click(); }) });
      }
      const a = own();
      return pick({ title: "作業員", groups: ["社員", "従業員"].map(k => ({ name: k, items: a.filter(p => p.区分 === k).map(p => ({ v: p.名前, kana: p.かな, used: usedName(p.名前, w.昼夜) && nk(p.名前) !== nk(w.名前) })) })), value: w.名前, done: set(w, "名前") });
    }
    case "pickKoshu": {
      const w = r[l][i], p = planOf(r);
      const fromPlan = p ? [...new Set(p.list.map(x => x.作業).filter(Boolean))] : [];
      const used = usedVals("作業員", "工種").concat(usedVals("外注", "工種")).filter(v => !fromPlan.includes(v));
      return pick({ title: "工種", groups: [{ name: "この日の工程", items: fromPlan.map(v => ({ v })) }, { name: "前に使った工種", items: [...new Set(used)].map(v => ({ v })) }], value: w.工種, clear: true, free: true, empty: "候補がありません。「候補に無いものを書く」で入れてください", done: set(w, "工種") });
    }
    case "addGai": return pickCompany(co => addGaiFlow(co, "", r.勤務));
    case "addKikai": r.機械.push({ 使用機材: "", 規格: "", 所有者: "", 数量: "1" }); touch(); render(); return b.ownerDocument.querySelector(`[data-act="pickKiki"][data-i="${r.機械.length - 1}"]`).click();
    case "pickKiki": { const m = r.機械[i]; const names = [...new Set(S.M.機械.map(x => x.名前))]; return pick({ title: "使用機材", groups: [{ name: "自社機械", items: names.map(v => ({ v })) }, { name: "前に使った機材", items: usedVals("機械", "使用機材").filter(v => !names.includes(v)).map(v => ({ v })) }], value: m.使用機材, free: true, done: v => { m.使用機材 = v; const ks = S.M.機械.filter(x => x.名前 === v); if (ks.length === 1) { m.規格 = ks[0].規格; if (!m.所有者) m.所有者 = SELF; } touch(); render(); } }); }
    case "pickKikaku": { const m = r.機械[i]; const ks = [...new Set(S.M.機械.filter(x => !m.使用機材 || x.名前 === m.使用機材).map(x => x.規格).filter(Boolean))]; return pick({ title: "規格・形式", groups: [{ items: ks.map(v => ({ v })) }], value: m.規格, clear: true, free: true, done: set(m, "規格") }); }
    case "pickOwner": { const m = r.機械[i]; return pick({ title: "所有者", groups: [{ name: "自社", items: [{ v: SELF }] }, { name: "外注業者", items: companies().map(v => ({ v })) }, { name: "前に使った所有者（リース会社など）", items: usedVals("機械", "所有者").filter(v => v !== SELF && !companies().includes(v)).map(v => ({ v })) }], value: m.所有者, clear: true, free: true, done: set(m, "所有者") }); }
    case "addZai": r.材料.push({ 材料名: "", 数量: "", 実費: "" }); touch(); render(); return document.querySelector(`[data-act="pickZai"][data-i="${r.材料.length - 1}"]`).click();
    case "pickZai": { const m = r.材料[i]; return pick({ title: "材料名", groups: [{ name: "前に使った材料", items: usedVals("材料", "材料名").map(v => ({ v })) }], value: m.材料名, free: true, empty: "まだ候補がありません。「候補に無いものを書く」で入れてください", done: set(m, "材料名") }); }
    case "addCar": r.車.push({ 種類: "高速", 往復: "往復", 区間: "", 給油: "", 実費: "", 会社: "", 名前: "", 車両名: "", 車番: "", メモ: "" }); touch(); render(); return;
    case "pickKukan": { const c = r.車[i]; return pick({ title: "高速の区間", groups: [{ name: "前に使った区間", items: usedVals("車", "区間").map(v => ({ v })) }], value: c.区間, clear: true, free: true, done: set(c, "区間") }); }
    case "pickDriver": {
      const c = r.車[i], list = r.作業員.concat(r.外注).filter(w => w.名前);
      return pick({ title: "だれ（今日の作業員・外注から）", groups: [{ items: list.map(w => ({ v: w.名前 + "\t" + (w.会社 || ""), label: w.名前, sub: w.会社 })) }], value: c.名前 + "\t" + c.会社, clear: true, empty: "先に作業員・外注を入れてください", done: v => { const [n, co] = String(v).split("\t"); c.名前 = n || ""; c.会社 = co || ""; touch(); render(); } });
    }
    case "pickCar": { const c = r.車[i]; return pick({ title: "車両名", groups: [{ name: "自社車両", items: S.M.車両.map(x => ({ v: x.車両名, sub: x.車番 })) }, { name: "前に使った車両", items: usedVals("車", "車両名").filter(v => !S.M.車両.some(x => x.車両名 === v)).map(v => ({ v })) }], value: c.車両名, clear: true, free: true, done: v => { c.車両名 = v; const x = S.M.車両.find(y => y.車両名 === v); if (x && x.車番) c.車番 = x.車番; touch(); render(); } }); }
  }
});
const usedName = (n, sh) => S.rec.作業員.some(w => nk(w.名前) === nk(n) && w.昼夜 === sh) || S.rec.外注.some(w => nk(w.名前) === nk(n) && w.昼夜 === sh);
function pickWorkers() {
  const r = S.rec, a = own(), sh = r.勤務;
  pick({ title: `作業員を選ぶ（${sh}）`, multi: true, note: "いくつも選べます。選んだら「入れる」。",
    groups: ["社員", "従業員"].map(k => ({ name: k, items: a.filter(p => p.区分 === k).map(p => ({ v: p.名前, kana: p.かな, used: usedName(p.名前, sh) })) })),
    done: list => { const n = addWorkers(list, "", sh); touch(); render(); if (n) toast(n + "人を入れました"); } });
}
function pickCompany(done) {
  const cs = companies();
  pick({ title: "外注の会社", groups: [{ items: cs.map(v => ({ v, sub: membersOf(v).length + "人" })) }], empty: "外注業者の一覧がありません", done });
}
function addGaiFlow(co, 工種, sh) {
  const m = membersOf(co);
  if (!m.length) { toast(`名簿に「${co}」の人がいません。名簿の画面で足してください`, 5000); return; }
  pick({ title: `${co} の人（${sh}）`, multi: true, note: `<b>${esc(co)}</b> の人だけを出しています（ほかの会社の人は出しません）。`,
    groups: [{ items: m.map(p => ({ v: p.名前, kana: p.かな, used: usedName(p.名前, sh) })) }],
    done: list => {
      let n = 0;
      for (const nm of list) { if (usedName(nm, sh)) continue; S.rec.外注.push({ 会社: co, 名前: nm, 昼夜: sh, 始業: TEIJI[sh][0], 終業: TEIJI[sh][1], 工種: 工種 || "", 残: "" }); n++; }
      touch(); S.tab = "gai"; render(); if (n) toast(`${co} の ${n}人を入れました`);
    } });
}

/* ================= 作業日報の形（PC の用紙の並び） ================= */
function toForm(r) {
  const 上 = r.作業.filter(w => w.予定 || w.報告).map(w => ["", w.予定, "", "", w.報告]);
  while (上.length < 5) 上.push(["", "", "", "", ""]);
  const n = Math.max(r.作業員.length, r.機械.length, r.材料.length), 下 = [];
  for (let i = 0; i < n; i++) {
    const row = Array(16).fill(""), w = r.作業員[i], m = r.機械[i], z = r.材料[i];
    if (w) { row[0] = w.名前; row[1] = w.始業; row[2] = w.終業; row[3] = w.工種; row[4] = w.残 || zan(w.始業, w.終業, w.昼夜); row[12] = w.会社; row[14] = w.昼夜; }
    if (m) { row[5] = m.使用機材; row[6] = m.規格; row[7] = m.数量; row[13] = m.所有者; }
    if (z) { row[9] = z.材料名; row[10] = z.数量; row[15] = z.実費; }
    下.push(row);
  }
  const 外注 = r.外注.map(w => { const row = Array(16).fill(""); row[0] = w.名前; row[1] = w.始業; row[2] = w.終業; row[3] = w.工種; row[4] = w.残 || zan(w.始業, w.終業, w.昼夜); row[12] = w.会社; row[14] = w.昼夜; return row; });
  const 車 = r.車.map(c => [c.種類, c.種類 === "高速" ? c.往復 : "", c.種類 === "高速" ? c.区間 : "", c.種類 === "高速" ? "" : c.給油, c.実費, c.会社, c.名前, c.車両名, c.車番, c.メモ]);
  return { 元請業者: r.元請, 現場名: r.現場, 日付: r.日付, 日: { 天気: r.天気, 気温: r.気温, 担当者: r.記入者, 形態: r.区分 === "常用" ? "常用" : "請負", 上, 下, 外注, 車 } };
}
function showForm() {
  const f = toForm(S.rec), d = f.日;
  const tb = (heads, rows) => `<div class="tw"><table><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${heads.length}">（なし）</td></tr>`}</table></div>`;
  const DN = [[12, "会社"], [0, "作業員名"], [14, "昼夜"], [1, "始業時間"], [2, "終業時間"], [3, "工種"], [4, "残"], [5, "使用機材"], [6, "規格・形式"], [13, "所有者"], [7, "数量"], [9, "材料名"], [10, "数量"], [15, "実費"]];
  openSheet("作業日報の形", `<div class="fm">
    <div class="hint">PC の作業日報と同じ並びです（列の名前も同じ）。この形で詳細日報に入れられます。</div>
    <div class="tw"><table class="kv"><tr><td>元請業者</td><td>${esc(f.元請業者)}</td><td>日付</td><td>${esc(f.日付)}（${WD[dateOf(f.日付).getDay()]}）</td></tr>
    <tr><td>現場名</td><td>${esc(f.現場名)}</td><td>天気・気温</td><td>${esc(d.天気)} ${d.気温 ? esc(d.気温) + "℃" : ""}</td></tr>
    <tr><td>記入者</td><td>${esc(d.担当者)}</td><td>区分</td><td>${esc(d.形態 === "常用" ? "常用" : "請負")}</td></tr></table></div>
    <h3>作業予定・完了報告</h3>${tb(["作業予定", "完了報告"], d.上.map(r => [r[1], r[4]]))}
    <h3>作業員・使用機材・材料</h3>${tb(DN.map(x => x[1]), d.下.map(r => DN.map(x => r[x[0]])))}
    <h3>外注</h3>${tb(["会社", "作業員名", "昼夜", "始業時間", "終業時間", "工種", "残"], d.外注.map(r => [r[12], r[0], r[14], r[1], r[2], r[3], r[4]]))}
    <h3>高速・燃料</h3>${tb(["種類", "往復", "高速の区間", "給油(L)", "実費", "会社", "名前", "車両名", "車番", "メモ"], d.車)}
  </div>`);
}
$("bForm").onclick = showForm;

/* ================= 保存（このブラウザの中だけ） ================= */
function problems(r) {
  const p = [];
  if (!r.現場) p.push("現場名を選んでください");
  r.作業員.forEach((w, i) => { const e = rowErr("作業員", w, i); if (e) p.push("作業員 " + (w.名前 || (i + 1) + "人目") + "：" + e); });
  r.外注.forEach((w, i) => { const e = rowErr("外注", w, i); if (e) p.push("外注 " + (w.名前 || (i + 1) + "人目") + "：" + e); });
  return p;
}
$("bSave").onclick = () => {
  const r = S.rec, p = problems(r);
  if (p.length) { alert("保存できません：\n・" + p.join("\n・")); return; }
  const a = recs(), dup = a.find(x => x.id !== r.id && x.日付 === r.日付 && nk(x.現場) === nk(r.現場) && x.勤務 === r.勤務);
  if (dup && !confirm(`${jpd(r.日付)} の ${r.現場}（${r.勤務}）はもう保存してあります。別の日報として保存しますか？`)) return;
  r.更新 = new Date().toLocaleString("ja-JP");
  const i = a.findIndex(x => x.id === r.id); if (i >= 0) a[i] = JSON.parse(JSON.stringify(r)); else a.push(JSON.parse(JSON.stringify(r)));
  if (putRecs(a)) { S.dirty = false; render(); toast("このブラウザに保存しました（試作）"); }
};
$("bList").onclick = () => {
  const a = recs().sort((x, y) => (y.日付 + y.更新).localeCompare(x.日付 + x.更新));
  openSheet("保存した日報（このブラウザ）", `<div class="list"><button type="button" class="pri small" data-new="1" style="margin:6px 0">＋ 新しく書く</button>` +
    (a.map(r => `<div class="it"><div class="tx" data-open="${r.id}"><b>${jpd(r.日付)} ${esc(r.勤務)}</b> ${esc(r.現場)}${r.作業.some(w => w.予定) ? '<span class="tag y">予定</span>' : ""}${r.作業.some(w => w.報告) ? '<span class="tag h">報告</span>' : ""}<small>${r.区分 === "常用" ? "常用" : "請負"}　作業員 ${r.作業員.length}・外注 ${r.外注.length}　${esc(r.更新)}</small></div><button type="button" class="sub small" data-delrec="${r.id}">消す</button></div>`).join("") || `<div class="empty">まだありません</div>`) + `</div>`);
  $("sBody").onclick = e => {
    const leave = () => !S.dirty || confirm("いま書いている日報は保存していません。やめて開きますか？");
    if (e.target.closest("[data-new]")) { if (!leave()) return; S.rec = blank(); S.dirty = false; S.tab = "kihon"; closeSheet(); render(); return; }
    const o = e.target.closest("[data-open]"); if (o) { if (!leave()) return; const r = recs().find(x => x.id === o.dataset.open); if (r) { S.rec = r; S.dirty = false; S.tab = "kihon"; } closeSheet(); render(); return; }
    const d = e.target.closest("[data-delrec]"); if (d) { const r = recs().find(x => x.id === d.dataset.delrec); if (!r || !confirm(`${jpd(r.日付)} ${r.現場} を消しますか？（このブラウザの試作の保存だけ）`)) return; putRecs(recs().filter(x => x.id !== r.id)); closeSheet(); $("bList").click(); }
  };
};
window.addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

/* ================= 読む ================= */
function seedDemo() {   // 試し：作りものの名前・会社（公開の置き場に置くので本物は書かない）
  const KEY = "spn_demo_store";
  try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }
  const k = today(), P = (名前, ふりがな, 区分, 会社) => ({ 名前, ふりがな, 区分, 会社 });
  const a = {
    "マスタ.json": { 社員: ["試し　太郎", "試し　次郎"], 従業員: ["見本　一郎", "見本　二郎", "見本　三郎"], 外注業者: ["Ａ工業", "Ｂ建設", "Ｃ組"],
      現場: [{ 名前: "A現場 配水管", 元請: "甲建設" }, { 名前: "B現場 道路改良", 元請: "乙土木" }, { 名前: "C現場 下水", 元請: "甲建設" },
        { 名前: "D現場 舗装", 元請: "乙土木" }, { 名前: "E現場 水道", 元請: "丙工務" }, { 名前: "F現場 造成", 元請: "丙工務" }, { 名前: "G現場 護岸", 元請: "甲建設" }] },
    "マスタ/人.json": { 形式: "人", 人: [P("試し　太郎", "ためし　たろう", "社員", ""), P("試し　次郎", "ためし　じろう", "社員", ""), P("見本　一郎", "みほん　いちろう", "従業員", ""), P("見本　二郎", "みほん　じろう", "従業員", ""), P("見本　三郎", "みほん　さぶろう", "従業員", ""),
      P("例題　太郎", "れいだい　たろう", "外注", "Ａ工業"), P("例題　次郎", "れいだい　じろう", "外注", "Ａ工業"), P("見積　一夫", "みつもり　かずお", "外注", "Ｂ建設"), P("見積　二夫", "みつもり　つぎお", "外注", "Ｂ建設"), P("仮名　五郎", "かめい　ごろう", "外注", "Ｃ組")] },
    "現場_s1.json": { id: "s1", 名前: "A現場 配水管", 段: [{ id: "l1", 名前: "昼間", 社員: ["試し　太郎"] }, { id: "l2", 名前: "昼間 掘削", 種別: "外注", 業者: "Ａ工業", 人数: "2" }, { id: "l3", 名前: "夜間", 社員: ["試し　次郎"], 業者: "Ｂ建設", 外注人数: "2" }],
      バー: [{ id: "b1", 段: "l1", 作業: "布設工", 開始: addDays(k, -3), 終了: addDays(k, 6), 人数: 3, 色: "青" }, { id: "b2", 段: "l2", 作業: "掘削", 開始: addDays(k, -1), 終了: addDays(k, 2), 人数: "2", 色: "橙" }, { id: "b3", 段: "l3", 作業: "推進工", 開始: addDays(k, -5), 終了: addDays(k, 5), 人数: 2, 色: "紫" }] },
    "現場_s2.json": { id: "s2", 名前: "B現場 道路改良", 段: [{ id: "m1", 名前: "昼間", 社員: ["試し　次郎"] }], バー: [{ id: "c1", 段: "m1", 作業: "舗装", 開始: addDays(k, -2), 終了: addDays(k, 3), 人数: 5, 色: "緑", 不在: [{ 社員: "試し　次郎", 開始: k, 終了: k, 代わり: ["試し　太郎"] }] }] }
  };
  const st = {}; for (const [n, d] of Object.entries(a)) st[n] = { data: d, eTag: "d0" };
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { }
}
async function load(kst, mst, kk) {
  const opt = p => p.then(x => x ? x.data : null).catch(e => { console.warn(e); return null; });
  const [m, base, fix, ret, cars, genba, kado, files] = await Promise.all([opt(kst.get("マスタ.json")), opt(mst.get("人.json")), opt(mst.get("人_手直し.json")), opt(kst.get("退職者.json")), opt(kst.get("自社車両.json")),
    kk ? opt(kk.get("現場一覧.json")) : null, kk ? opt(kk.get("稼働データ.json")) : null, kst.list().catch(() => [])]);
  S.M = { 社員: (m && m.社員) || [], 従業員: (m && m.従業員) || [], 外注業者: (m && m.外注業者) || [], 現場: (m && m.現場) || [],
    機械: ((kado && kado.機械) || []).filter(x => x && x.名前 && !x.使わない).map(x => ({ 名前: x.名前, 規格: x.規格 || "" })),
    車両: ((cars && cars.車両) || []).filter(x => x && x.車両名).map(x => ({ 車両名: x.車両名, 車番: x.車番 || x.登録番号 || "" })) };
  if (DEMO && !S.M.機械.length) S.M.機械 = [{ 名前: "バックホウ", 規格: "0.25㎥" }, { 名前: "バックホウ", 規格: "0.45㎥" }, { 名前: "ダンプ", 規格: "4t" }];
  if (DEMO && !S.M.車両.length) S.M.車両 = [{ 車両名: "試しの車（バン）", 車番: "試し 1" }];
  S.people = HX.people(base, fix, ret);
  S.genba = (genba && genba.現場) || [];
  const names = files.map(f => f.name).filter(n => /^現場_.+\.json$/.test(n));
  const got = [];
  for (let i = 0; i < names.length; i += 8) got.push(...await Promise.all(names.slice(i, i + 8).map(n => opt(kst.get(n)))));
  S.sites = got.filter(s => s && s.名前).map(s => ({ 名前: s.名前, 段: s.段 || [], バー: s.バー || [] }));
}
async function start() {
  if ($("ver").textContent.includes("__VER__")) $("ver").textContent = "開発中";
  let kst, mst, kk = null;
  if (DEMO) {
    seedDemo(); kst = HX.demoStore("spn_demo_store", ""); mst = HX.demoStore("spn_demo_store", "マスタ/"); S.me = "試し　太郎";
  } else {
    let s;
    try { s = await HX.signIn(); } catch (e) { console.warn(e); }
    if (!s || !s.account) { $("signin").hidden = false; $("bSignIn").onclick = () => s && HX.login(s.app); return; }
    kst = HX.store(s.app, "kotei"); mst = HX.store(s.app, "kotei", "マスタ"); kk = window.HX_CONFIG.kikai && window.HX_CONFIG.kikai.itemId ? HX.store(s.app, "kikai") : null;
    S.me = s.account.name || "";
  }
  $("app").hidden = false; $("act").hidden = false;
  S.rec = blank(); render();
  toast("現場・名簿・全体工程を読んでいます…", 6000);
  try { await load(kst, mst, kk); } catch (e) { console.warn(e); toast("読めませんでした：" + e.message, 6000); }
  // 記入者：サインインした人が名簿にいればその人
  const me = own().find(p => nk(p.名前) === nk(S.me)); S.me = me ? me.名前 : ""; if (!S.rec.記入者 || !me) S.rec.記入者 = S.me;
  render(); toast(`読みました：現場 ${siteNames().length}・工程 ${S.sites.length}・名簿 ${S.people.length}人`);
}
start();
