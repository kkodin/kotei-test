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
const WX5 = [["晴", "晴"], ["曇", "曇り"], ["雨", "雨"], ["風", "風"], ["雪", "雪"]];   // 2026-11-19 ユーザー：天候は 晴・曇り・雨・風・雪 だけ、いくつでも印
const wxSet = v => String(v || "").split(/[\/・、,\s]+/).filter(Boolean);
const WD = "日月火水木金土";
const TEIJI = { 昼: ["9:00", "17:00"], 夜: ["21:00", "5:00"] };   // 昼夜を押したときの作業時間（2026-11-19 ユーザー：昼 9:00〜17:00・夜 21:00〜5:00。基本タブで変えられる）
// その日の作業時間（基本タブの 始業〜終業）。作業員・外注を足すときの始めの値と、残の基準。日報と昼夜が違う人は TEIJI
const dayTime = sh => { const r = S.rec, k = sh === "夜" ? "夜" : "昼"; return r && r.勤務 === k && r.始業 && r.終業 ? [r.始業, r.終業] : TEIJI[k]; };
// 2026-11-19 ユーザー：昼夜は基本タブで決めたので、作業員・外注には昼夜を出さない → 人の昼夜は日報の昼夜にそろえる。前と同じ時刻の人は新しい時間に
const setShift = (r, sh) => { const o = [r.始業, r.終業]; r.勤務 = sh; [r.始業, r.終業] = TEIJI[sh]; (r.作業員 || []).concat(r.外注 || []).forEach(w => { w.昼夜 = sh; if (w.始業 === o[0] && w.終業 === o[1]) { w.始業 = r.始業; w.終業 = r.終業; } }); };
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
  const [ts, te] = dayTime(sh);
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
  return { id: uid(), 日付: today(), 勤務: "昼", 始業: TEIJI.昼[0], 終業: TEIJI.昼[1], 元請: "", 現場: "", 記入者: S.me, 区分: "請負", 天気: "", 気温: "",
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
// この現場の全体工程にある作業・外注業者（その日のもの／ほかの日のもの）。2026-11-19 ユーザー：作業内容・外注名等は全体工程から候補を出す
const mdOf = k => k ? `${+k.slice(5, 7)}/${+k.slice(8)}` : "";
function siteKotei(r) {
  const s = koteiSite(r.現場), k = r.日付, works = new Map(), cos = new Map();
  if (!s) return { works: [], cos: [] };
  for (const b of s.バー || []) {
    const ln = (s.段 || []).find(l => l.id === b.段) || {};
    const 作業 = b.作業 || ln.作業 || laneWork(ln) || "";
    const on = b.開始 <= k && k <= b.終了 && !(b.休み || []).includes(k);
    const span = mdOf(b.開始) + "〜" + mdOf(b.終了);
    if (作業) { const x = works.get(作業) || { v: 作業, today: false, span: [] }; x.today = x.today || on; x.span.push(span); works.set(作業, x); }
    const co = ln.業者 || "";
    if (co) { const x = cos.get(nk(co)) || { v: co, today: false, 作業: [] }; x.today = x.today || on; if (作業 && !x.作業.includes(作業)) x.作業.push(作業); cos.set(nk(co), x); }
  }
  return { works: [...works.values()], cos: [...cos.values()] };
}
// 前に書いた作業（予定・報告の1行ずつ）
function usedWorks() { const set = new Set(); recs().forEach(r => (r.作業 || []).forEach(w => ["予定", "報告"].forEach(c => String(w[c] || "").split(/\n/).forEach(t => { t = t.trim(); if (t) set.add(t); })))); return [...set]; }

function addWorkers(names, 工種, sh) {
  let n = 0; sh = S.rec.勤務;
  for (const nm of names) {
    if (S.rec.作業員.some(w => nk(w.名前) === nk(nm) && w.昼夜 === sh) || S.rec.外注.some(w => nk(w.名前) === nk(nm) && w.昼夜 === sh)) continue;
    S.rec.作業員.push({ 会社: SELF, 名前: nm, 昼夜: sh, 始業: dayTime(sh)[0], 終業: dayTime(sh)[1], 工種: 工種 || "", 残: "" }); n++;
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
    if (part === "all" && r.勤務 !== sh && !r.作業員.length) setShift(r, sh);
  }
  if (part === "all" || part === "hito") {
    const known = x.社員.filter(n => own().some(o => nk(o.名前) === nk(n)));
    const n = addWorkers(known, x.作業, sh); if (n) msg.push("作業員 " + n + "人");
    const ew = known.filter(n => elsewhere(n).length); if (ew.length) msg.push("⚠ ほかの現場にも入っている人：" + ew.map(n => n + "（" + elsewhere(n).join("・") + "）").join("・"));
    if (known.length < x.社員.length) msg.push("名簿に無い社員は入れていません：" + x.社員.filter(n => !known.includes(n)).join("・"));
  }
  touch(); render();
  if (part === "all" && x.外注 && x.外注.業者) msg.push("外注（" + x.外注.業者 + "）は「外注」のタブで名前を選んでください");
  toast(msg.join("／") || "もう入っています", 4500);
}

/* ================= 下から出る窓（選ぶ） ================= */
let SH = null;
function openSheet(title, html, onOk, okLabel) {
  SH = { onOk }; const sb0 = $("sBody"); sb0.onclick = sb0.oncontextmenu = sb0.ontouchstart = sb0.ontouchend = sb0.ontouchmove = null; $("sClose").onclick = closeSheet;
  $("sTitle").textContent = title; $("sBody").innerHTML = html;
  $("sOk").hidden = !onOk; $("sOk").textContent = okLabel || "決める";
  $("sheet").hidden = false; document.body.classList.add("lock");
  $("sBody").scrollTop = 0;
}
function closeSheet() { $("sheet").hidden = true; document.body.classList.remove("lock"); SH = null; }
$("sClose").onclick = closeSheet;
// 選んだあとに次の窓を開くことがある（会社 → その会社の人）。そのときは閉じない（2026-11-19 直し：次の窓がすぐ閉じていた）
const closeIf = keep => { if (SH === keep) closeSheet(); };
$("sOk").onclick = () => { const keep = SH, f = SH && SH.onOk; if (f && f() === false) return; closeIf(keep); };
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
  openSheet(o.title, "", o.multi ? () => o.done([...sel]) : null, o.multi ? "入れる" : "");
  draw();
  $("sBody").onclick = e => {
    const k = e.target.closest("[data-kana]"); if (k) { kana = k.dataset.kana; draw(); return; }
    const fd = e.target.closest("[data-fold]"); if (fd) { opened.add(+fd.dataset.fold); draw(); return; }
    if (e.target.closest('[data-act2="chgco"]') && o.chgco) { closeSheet(); o.chgco(); return; }
    const keep = SH;
    if (e.target.closest("[data-clear]")) { o.done(""); closeIf(keep); return; }
    if (e.target.closest("[data-free]")) { $("freeBox").hidden = false; $("freeIn").focus(); return; }   // ここで初めてキーボード
    if (e.target.closest("[data-freeok]")) { const v = $("freeIn").value.trim(); if (!v) return; o.done(o.multi ? [...sel, v] : v); closeIf(keep); return; }
    const b = e.target.closest("[data-v]"); if (!b) return;
    const v = b.dataset.v;
    if (o.multi) { if (b.classList.contains("used") && !sel.has(v)) { toast("もう入っています"); return; } sel.has(v) ? sel.delete(v) : sel.add(v); b.classList.toggle("on"); }
    else { o.done(v); closeIf(keep); }
  };
}
/* 絞り込みの窓（2026-11-19 ユーザー：機械名 → 種類 → 能力 で絞り込む。自社・リース、リース会社も、どれからでも順番に関係なく押せる）
   facets=[{k, label, fixed:[], extra:()=>[], show:sel=>bool, soft:true（その値の候補が無ければ絞らない）, free:true（書ける）}]
   items=[{各 k の値…, tag, tagL}]。押した値どうしで候補を絞り、ほかの欄の選べる値もそれに合わせて減る。下の一覧を押すと全部の欄が決まる。 */
// 数で始まる値は数の大きさで並べる（0.06㎥ → 0.1㎥ → 0.25㎥、2t → 10t）
const numCmp = (a, b) => { const x = parseFloat(han(a)), y = parseFloat(han(b)); return !isNaN(x) && !isNaN(y) && x !== y ? x - y : String(a).localeCompare(String(b), "ja", { numeric: true }); };
function facetSheet(o) {
  const sel = Object.assign({}, o.sel || {}), more = new Set(), freeOpen = {};
  let qty = o.qty ? (+o.qty.v || 1) : 0;
  const same = (a, b) => nk(a) === nk(b);
  const vis = f => !f.show || f.show(sel);
  const softOff = f => f.soft && sel[f.k] && !o.items.some(it => same(it[f.k], sel[f.k]));
  const match = (it, except) => o.facets.every(f => f.k === except || !vis(f) || !sel[f.k] || softOff(f) || same(it[f.k], sel[f.k]));
  const draw = () => {
    let h = o.note ? `<div class="hint">${o.note}</div>` : "";
    const pickedTxt = o.facets.filter(f => vis(f) && sel[f.k]).map(f => `${esc(f.label)}：<b>${esc(sel[f.k])}</b>`).join("　");
    h += `<div class="sel">${pickedTxt || "まだ何も選んでいません。下のどこからでも押せます。"}</div>`;
    for (const f of o.facets) {
      if (!vis(f)) continue;
      const cnt = new Map();
      o.items.filter(it => match(it, f.k)).forEach(it => { const v = it[f.k]; if (v) cnt.set(v, (cnt.get(v) || 0) + 1); });
      let vals = [...(f.fixed || [])];
      [...cnt.keys()].sort((a, b) => (f.byCount ? cnt.get(b) - cnt.get(a) : 0) || numCmp(a, b)).forEach(v => vals.includes(v) || vals.push(v));
      (f.extra ? f.extra(sel) : []).forEach(v => vals.some(x => same(x, v)) || vals.push(v));
      if (sel[f.k] && !vals.some(x => same(x, sel[f.k]))) vals.unshift(sel[f.k]);
      const LIM = 16, cut = !more.has(f.k) && vals.length > LIM + 2;
      const shown = cut ? vals.slice(0, LIM).concat(sel[f.k] && vals.indexOf(sel[f.k]) >= LIM ? [sel[f.k]] : []) : vals;
      h += `<div class="fz"><div class="fzh">${esc(f.label)}${sel[f.k] ? `<button type="button" class="cl" data-fcl="${f.k}">✕ 外す</button>` : ""}</div><div class="chips">` +
        shown.map(v => `<button type="button" data-fk="${f.k}" data-fv="${esc(v)}" class="${same(v, sel[f.k]) ? "on" : ""}">${esc(v)}${cnt.has(v) && !f.fixed ? `<small> ${cnt.get(v)}</small>` : ""}</button>`).join("") +
        (cut ? `<button type="button" class="more" data-fmore="${f.k}">もっと出す（${vals.length - LIM}）</button>` : "") +
        (f.free ? `<button type="button" class="more" data-ffree="${f.k}">書く</button>` : "") + `</div>` +
        (freeOpen[f.k] ? `<div class="row2"><input type="text" id="ff_${f.k}" value="${esc(sel[f.k] || "")}"><button type="button" class="pri small" data-ffok="${f.k}" style="flex:none">これにする</button></div>` : "") +
        (softOff(f) ? `<div class="warn">${esc(sel[f.k])} の${esc(o.what || "候補")}の一覧はまだありません。ほかの欄は全部の候補から選べます（無ければ「書く」）。</div>` : "") + `</div>`;
    }
    if (o.qty) h += `<div class="qrow"><label class="lb">${esc(o.qty.label)}</label><span class="step"><button type="button" data-q="-1">−</button><b>${qty}</b><button type="button" data-q="1">＋</button></span></div>`;
    const res = o.items.filter(it => match(it, null));
    const full = it => o.facets.every(f => !vis(f) || !it[f.k] || same(it[f.k], sel[f.k]));
    h += `<div class="res"><div class="rh">候補 ${res.length}件${res.length > 40 ? "（上の欄で絞ってください。先頭の40件）" : ""}　押すと全部の欄が決まります</div>` +
      (res.slice(0, 40).map(it => `<button type="button" class="ri ${full(it) ? "on" : ""}" data-ri="${o.items.indexOf(it)}"><span>${o.itemLabel(it)}</span>${it.tag ? `<span class="tg ${it.tagL ? "l" : ""}">${esc(it.tag)}</span>` : ""}</button>`).join("") || `<div class="empty">合う候補がありません。上の「✕ 外す」で条件を減らすか、「書く」で入れてください。</div>`) + `</div>`;
    $("sBody").innerHTML = h;
  };
  openSheet(o.title, "", () => {
    for (const k of o.need || []) if (!sel[k]) { toast((o.facets.find(f => f.k === k) || {}).label + "を選んでください"); return false; }
    o.done(sel, qty);
  }, "決める");
  draw();
  $("sBody").onclick = e => {
    const t = e.target;
    let b;
    if ((b = t.closest("[data-fk]"))) { const k = b.dataset.fk, v = b.dataset.fv; sel[k] = same(sel[k], v) ? "" : v; if (o.onSel) o.onSel(sel, k); draw(); return; }
    if ((b = t.closest("[data-fcl]"))) { sel[b.dataset.fcl] = ""; if (o.onSel) o.onSel(sel, b.dataset.fcl); draw(); return; }
    if ((b = t.closest("[data-fmore]"))) { more.add(b.dataset.fmore); draw(); return; }
    if ((b = t.closest("[data-ffree]"))) { freeOpen[b.dataset.ffree] = true; draw(); const el = $("ff_" + b.dataset.ffree); if (el) el.focus(); return; }   // ここで初めてキーボード
    if ((b = t.closest("[data-ffok]"))) { const k = b.dataset.ffok, el = $("ff_" + k), v = el ? el.value.trim() : ""; if (v) sel[k] = v; freeOpen[k] = false; if (o.onSel) o.onSel(sel, k); draw(); return; }
    if ((b = t.closest("[data-q]"))) { qty = Math.max(1, qty + +b.dataset.q); draw(); return; }
    if ((b = t.closest("[data-ri]"))) { const it = o.items[+b.dataset.ri]; o.facets.forEach(f => { sel[f.k] = it[f.k] || ""; }); if (o.onSel) o.onSel(sel, "*"); draw(); return; }
  };
}
const stepH = (act, l, i, f, v) => `<span class="step"><button type="button" data-act="${act}" data-l="${l}" data-i="${i}" data-f="${f}" data-d="-1">−</button><b>${esc(v || 1)}</b><button type="button" data-act="${act}" data-l="${l}" data-i="${i}" data-f="${f}" data-d="1">＋</button></span>`;

/* ---- 機械の候補：自社（稼働データ）・リース会社（見積の一覧）・前に使ったもの ---- */
const LEASE = ["東リース", "レント", "セフテック", "第一産商", "アクティオ", "カナモト", "西尾レントオール", "ニッケン", "コクド", "トーコー産業"];   // 詳細日報と同じ
const SPD = window.SPN_DATA || { リース機械: [], 材料: [] };
const capN = s => String(s || "").replace(/m3/gi, "㎥").replace(/kva/gi, "kVA").replace(/ｔ/g, "t").trim();   // 能力の書き方をそろえる（0.25m3 と 0.25㎥ を同じに）
const baseName = s => String(s || "").replace(/\s*[0-9０-９]+$/, "").trim() || String(s || "");
function machineItems() {
  const c = cand(), out = [], seen = new Set(), cn = v => c.会社名[v] || v;
  const add = it => { it.cat = it.cat || catOf(it); const k = mkey(it); if (seen.has(k) || c.機械消す.includes(k) || (it.区分 === "リース" && c.会社消す.includes(it.会社))) return; seen.add(k); out.push(it); };
  S.M.機械.forEach(x => add({ 区分: "自社", 会社: "", 名前: baseName(x.名前), 種類: "", 分類: x.分類 || "", 能力: capN(x.規格), tag: "自社" }));
  SPD.リース機械.forEach(x => add({ 区分: "リース", 会社: cn(x.会社), 名前: x.名前, 種類: x.種類, 分類: x.分類, 能力: capN(x.能力), 備考: x.備考, tag: cn(x.会社), tagL: true }));
  c.機械足す.forEach(x => add(Object.assign({ 種類: "", 分類: "" }, x, { 会社: x.区分 === "リース" ? cn(x.会社) : "" })));
  recs().forEach(r => (r.機械 || []).forEach(m => m.使用機材 && add({ 区分: m.区分 || (m.所有者 === SELF ? "自社" : m.所有者 ? "リース" : ""), 会社: m.区分 === "リース" ? m.会社 || m.所有者 || "" : "", 名前: m.使用機材, 種類: m.種類 || "", 分類: m.分類 || "", cat: m.種別 || "", 能力: capN(m.規格), tag: "前に使った" })));
  return out;
}
const leaseCos = () => { const c = cand(), a = [], push = v => { v = c.会社名[v] || v; if (v && v !== SELF && !c.会社消す.includes(v) && !a.includes(v)) a.push(v); }; LEASE.forEach(push); SPD.リース機械.forEach(x => push(x.会社)); c.会社足す.forEach(push); usedVals("機械", "会社").forEach(push); return a; };
/* ---- 機械の表（2026-11-19 ユーザー：区分｜分類｜機械名｜能力｜＋｜− の表。分類は 重機・車両・ハツリ… を絵から選ぶ） ---- */
const CATS = [["重機", "🚜"], ["車両", "🚚"], ["ハツリ", "⛏️"], ["安全", "🦺"], ["測量機", "📐"], ["転圧", "🔨"], ["発電機", "⚡"], ["小型機械", "🔧"], ["水ポン", "💧"], ["他", "📦"]];
// もとの分類（稼働データ・見積）と名前から、上の10の分類に分ける
function catOf(it) {
  const b = String(it.分類 || ""), n = String(it.名前 || "");
  if (b !== "車両" && (/重機|バックホウ/.test(b + n) || /クレーン|バケット|エクステンションアーム|ユンボ/.test(n))) return "重機";
  if (b === "車両" || /ダンプ|ユニック|トラック|散水車|平ボディ/.test(n)) return "車両";
  if (/はつり|ハツリ/.test(b) || /ブレーカ|ピック|チッパ|コンプレッサ|エアホース|削岩/.test(n)) return "ハツリ";
  if (/保安|安全|照明/.test(b) || /表示板|セルフロック|バルーン|コーン|バリケード/.test(n)) return "安全";
  if (/測量|測定/.test(b) || /レベル|トータルステーション|光波|三脚|レーザー|検知器/.test(n)) return "測量機";
  if (b === "転圧" || /ランマ|プレート|ローラ/.test(n)) return "転圧";
  if (/発電/.test(b) || /発電|ウェルダ/.test(n)) return "発電機";
  if (b === "水" || /ポンプ|ウォッシャ|洗浄|貯水|バキューム|スイーパー/.test(n)) return "水ポン";
  if (b === "小型機械" || /カッター|バイブレ|草刈|送風|ダクト|ブレード/.test(n)) return "小型機械";
  return "他";
}
const capL = it => [it.種類, it.能力].filter(Boolean).join(" ");
const mkey = it => [it.区分, nk(it.会社), nk(it.名前), nk(capL(it))].join("|");
const blankM = () => ({ 区分: "", 会社: "", 種別: "", 使用機材: "", 種類: "", 規格: "", 分類: "", 所有者: "", 数量: "1" });
const MF = { 区分: it => it.区分, 会社: it => it.会社, 種別: it => it.cat, 名前: it => it.名前, 能力: capL };
const rowVals = m => ({ 区分: m.区分 || "", 会社: m.区分 === "リース" ? m.会社 || "" : "", 種別: m.種別 || "", 名前: m.使用機材 || "", 能力: [m.種類, m.規格].filter(Boolean).join(" ") });
// 押してあるマスで候補を絞る（そのマスの候補が無くなる絞りは使わない＝カナモトのように一覧の無い会社でも選べる）
function narrow(items, sel, skip) {
  let a = items;
  for (const k of ["区分", "会社", "種別", "名前", "能力"]) {
    if (k === skip || (skip === "区分" && k === "会社") || !sel[k]) continue;
    const b = a.filter(it => nk(MF[k](it)) === nk(sel[k])); if (b.length) a = b;
  }
  return a;
}
// 1つに決まるマスは埋める（例：自社の発電機は1台だけ → 機械名・能力が入る）
function autofill(m) {
  const sel = rowVals(m), strict = machineItems().filter(it => Object.entries(sel).every(([k, v]) => !v || nk(MF[k](it)) === nk(v)));
  if (strict.length) {
    const one = f => { const s = new Set(strict.map(x => nk(f(x)))); return s.size === 1 ? f(strict[0]) : ""; };
    if (!m.種別) m.種別 = one(MF.種別);
    if (!m.使用機材 && (m.区分 || m.種別)) m.使用機材 = one(MF.名前);
    if (!m.規格 && !m.種類 && m.使用機材 && one(capL)) { m.種類 = strict[0].種類 || ""; m.規格 = strict[0].能力 || ""; }
    if (!m.区分 && m.使用機材 && one(MF.区分) && (one(MF.区分) === "自社" || one(MF.会社))) { m.区分 = one(MF.区分); m.会社 = m.区分 === "リース" ? one(MF.会社) : ""; }
    m.分類 = one(it => it.分類) || m.分類 || "";
  }
  m.所有者 = m.区分 === "自社" ? SELF : m.区分 === "リース" ? m.会社 || "リース" : m.所有者 || "";
}
// その日その現場に予定している機械：自社＝自社機械稼働表の予約、リース＝この現場の前の日報（14日以内）に入れたリースの機械
function usesDay(y, k) {
  if ((y.出勤 || []).includes(k)) return true;
  if ((y.休み || []).includes(k) || (y.未使用 || []).includes(k)) return false;
  const d = dateOf(k).getDay(); return d === 0 ? !!y.日祝 : d === 6 ? !!y.土 : true;
}
function plannedMachines(r) {
  if (!r.現場) return [];
  const out = [], seen = new Set(), add = p => { const k = mkey(p); if (seen.has(k)) return; seen.add(k); out.push(p); };
  (S.yoyaku || []).forEach(y => {
    if (!sameSite(y.現場, r.現場) || !(y.開始 <= r.日付 && r.日付 <= y.終了) || (y.区分 || "昼") !== r.勤務 || !usesDay(y, r.日付)) return;
    const mc = S.kmap && S.kmap[y.機械]; if (!mc) return;
    add({ 区分: "自社", 会社: "", 名前: baseName(mc.名前), 種類: "", 能力: capN(mc.規格), 分類: mc.分類 || "", cat: catOf(mc), from: "稼働表" });
  });
  const prev = recs().filter(x => x.id !== r.id && sameSite(x.現場, r.現場) && x.日付 < r.日付 && x.日付 >= addDays(r.日付, -14)).sort((a, b) => b.日付.localeCompare(a.日付))[0];
  if (prev) (prev.機械 || []).forEach(m => m.区分 === "リース" && m.使用機材 && add({ 区分: "リース", 会社: m.会社 || "", 名前: m.使用機材, 種類: m.種類 || "", 能力: m.規格 || "", 分類: m.分類 || "", cat: m.種別 || catOf({ 名前: m.使用機材, 分類: m.分類 }), 数量: m.数量, from: jpd(prev.日付) + "の日報" }));
  return out;
}
const hasPlanned = (r, p) => r.機械.some(m => m.区分 === p.区分 && nk(m.会社) === nk(p.会社) && nk(m.使用機材) === nk(p.名前) && nk(m.規格) === nk(p.能力));
const setKubun = (m, k, co) => { m.区分 = k; m.会社 = co || ""; autofill(m); m.所有者 = k === "自社" ? SELF : co || "リース"; touch(); render(); };
// 区分：自社／リース会社。会社名は右クリック（スマホは長押し）で 直す・消す・足す（2026-11-19 ユーザー）
function kubunSheet(i) {
  const r = S.rec; let menu = null, edit = null, lp = null, lpFired = false;
  const draw = () => {
    const m = r.機械[i], sel = rowVals(m), base = narrow(machineItems(), sel, "区分"), cnt = f => base.filter(f).length;
    $("sBody").innerHTML =
      (menu ? `<div class="cmenu"><b>${esc(menu)}</b><div class="cmb"><button type="button" class="sub small" data-cm="ren">名前を直す</button><button type="button" class="sub small" data-cm="del">消す</button><button type="button" class="sub small" data-cm="add">会社を足す</button><button type="button" class="sub small" data-cm="x">やめる</button></div></div>` : "") +
      (edit ? `<div class="cmenu"><b>${edit.mode === "ren" ? esc(edit.co) + " の名前を直す" : "リース会社を足す"}</b><div class="row2"><input type="text" id="coIn" value="${edit.mode === "ren" ? esc(edit.co) : ""}"><button type="button" class="pri small" data-cook="1" style="flex:none">これにする</button></div></div>` : "") +
      `<div class="hint">自社か、リースの会社を押す。会社名を右クリック（スマホは長押し）で 直す・消す・足す。</div>` +
      `<div class="chips"><button type="button" data-k="自社" class="${sel.区分 === "自社" ? "on" : ""}">自社<small> ${cnt(x => x.区分 === "自社")}</small></button><button type="button" data-k="リース" class="${sel.区分 === "リース" && !sel.会社 ? "on" : ""}">リース（会社はあとで）</button></div>` +
      `<div class="grp">リース会社</div><div class="chips nosel">${leaseCos().map(c => { const n = cnt(x => x.区分 === "リース" && nk(x.会社) === nk(c)); return `<button type="button" data-co="${esc(c)}" class="${sel.会社 === c ? "on" : ""}">${esc(c)}${n ? `<small> ${n}</small>` : ""}</button>`; }).join("")}</div>` +
      `<div class="free"><button type="button" class="sub" data-cm="add">＋ リース会社を足す</button> <button type="button" class="kh" data-cand="1">候補編集</button></div>`;
  };
  openSheet("区分（自社・リース会社）", ""); draw();
  const sb = $("sBody"), menuOn = co => { menu = co; edit = null; draw(); sb.scrollTop = 0; };
  sb.oncontextmenu = e => { const b = e.target.closest("[data-co]"); if (!b) return; e.preventDefault(); menuOn(b.dataset.co); };
  sb.ontouchstart = e => { const b = e.target.closest("[data-co]"); if (!b) return; lpFired = false; clearTimeout(lp); lp = setTimeout(() => { lpFired = true; menuOn(b.dataset.co); }, 550); };
  sb.ontouchend = sb.ontouchmove = () => clearTimeout(lp);
  sb.onclick = e => {
    if (lpFired) { lpFired = false; return; }
    const t = e.target; let b;
    if ((b = t.closest("[data-cm]"))) {
      const c = b.dataset.cm;
      if (c === "del") { if (confirm(`${menu} を候補から消しますか？（このブラウザの候補だけ）`)) delCo(menu); menu = null; }
      else if (c === "x") menu = null;
      else { edit = { mode: c, co: menu }; menu = null; draw(); $("coIn").focus(); return; }   // ここで初めてキーボード
      draw(); return;
    }
    if (t.closest("[data-cook]")) { const v = $("coIn").value.trim(); if (!v) return; if (edit.mode === "ren") renCo(edit.co, v); else addCo(v); edit = null; draw(); render(); return; }
    if (t.closest("[data-cand]")) return candEdit();
    if ((b = t.closest("[data-k]"))) { closeSheet(); return setKubun(r.機械[i], b.dataset.k, ""); }
    if ((b = t.closest("[data-co]"))) { closeSheet(); return setKubun(r.機械[i], "リース", b.dataset.co); }
  };
}
const catGrid = (cur, cnt, attr) => `<div class="cats">${CATS.map(([c, ic]) => { const n = cnt ? cnt(c) : 1; return `<button type="button" ${attr}="${c}" class="${cur === c ? "on" : ""} ${n ? "" : "zero"}"><span class="ci">${ic}</span><span>${c}</span>${cnt && n ? `<small>${n}</small>` : ""}</button>`; }).join("")}</div>`;
function catSheet(i) {
  const m = S.rec.機械[i], base = narrow(machineItems(), rowVals(m), "種別");
  openSheet("分類", `<div class="hint">絵を押して選ぶ（数は候補の数）。</div>` + catGrid(m.種別, c => base.filter(x => x.cat === c).length, "data-c") + (m.種別 ? `<div class="free"><button type="button" class="sub" data-clear="1">空にする</button></div>` : ""));
  $("sBody").onclick = e => {
    const b = e.target.closest("[data-c]");
    if (b) { m.種別 = b.dataset.c; autofill(m); touch(); closeSheet(); render(); return; }
    if (e.target.closest("[data-clear]")) { m.種別 = ""; touch(); closeSheet(); render(); }
  };
}
function nameSheet(i) {
  const r = S.rec, m = r.機械[i], base = narrow(machineItems(), rowVals(m), "名前"), cnt = new Map();
  base.forEach(x => cnt.set(x.名前, (cnt.get(x.名前) || 0) + 1));
  const pl = [...new Set(plannedMachines(r).filter(p => (!m.区分 || p.区分 === m.区分) && (!m.種別 || p.cat === m.種別)).map(p => p.名前))];
  const names = [...cnt.keys()].filter(v => !pl.includes(v)).sort((a, b) => cnt.get(b) - cnt.get(a) || a.localeCompare(b, "ja"));
  const what = [m.区分 === "リース" ? m.会社 || "リース" : m.区分, m.種別].filter(Boolean).join("・");
  pick({ title: "機械名", groups: [{ name: "この現場に今日予定している機械", items: pl.map(v => ({ v })) }, { name: what ? what + " の機械" : "機械", items: names.map(v => ({ v })) }],
    value: m.使用機材, clear: true, free: true, done: v => { m.使用機材 = v; if (!v) { m.種類 = ""; m.規格 = ""; } autofill(m); touch(); render(); } });
}
function capSheet(i) {
  const m = S.rec.機械[i], base = narrow(machineItems(), rowVals(m), "能力");
  const vals = [...new Set(base.map(capL).filter(Boolean))].sort(numCmp);
  pick({ title: "能力" + (m.使用機材 ? "（" + m.使用機材 + "）" : ""), groups: [{ items: vals.map(v => ({ v })) }], value: [m.種類, m.規格].filter(Boolean).join(" "), clear: true, free: true,
    empty: "候補がありません。「候補に無いものを書く」で入れてください",
    done: v => { const it = base.find(x => capL(x) === v); if (it) { m.種類 = it.種類 || ""; m.規格 = it.能力 || ""; } else { m.種類 = ""; m.規格 = v; } autofill(m); touch(); render(); } });
}
/* ---- 候補編集（2026-11-19 ユーザー：別の窓でリース会社名・機械名などを直せる）。このブラウザの中だけ（試作） ---- */
const CKEY = "spn_cand_v1";
const cand = () => { const d = { 会社足す: [], 会社消す: [], 会社名: {}, 機械足す: [], 機械消す: [] }; try { return Object.assign(d, JSON.parse(localStorage.getItem(CKEY)) || {}); } catch (e) { return d; } };
const putCand = c => { try { localStorage.setItem(CKEY, JSON.stringify(c)); } catch (e) { toast("このブラウザに保存できません：" + e.message); } };
function renCo(cur, nw) {
  const c = cand(); let hit = false;
  for (const k in c.会社名) if (c.会社名[k] === cur) { c.会社名[k] = nw; hit = true; }
  const j = c.会社足す.indexOf(cur); if (j >= 0) { c.会社足す[j] = nw; hit = true; }
  if (!hit) c.会社名[cur] = nw;
  c.機械足す.forEach(x => { if (x.会社 === cur) x.会社 = nw; });
  putCand(c); S.rec.機械.forEach(m => { if (m.会社 === cur) { m.会社 = nw; m.所有者 = nw; } }); touch();
}
function delCo(co) { const c = cand(), j = c.会社足す.indexOf(co); if (j >= 0) c.会社足す.splice(j, 1); else if (!c.会社消す.includes(co)) c.会社消す.push(co); putCand(c); }
function addCo(nw) { const c = cand(), j = c.会社消す.indexOf(nw); if (j >= 0) c.会社消す.splice(j, 1); else if (!leaseCos().includes(nw)) c.会社足す.push(nw); putCand(c); }
function candEdit() {
  let owner = "自社", form = null, coEdit = null;
  const keep = () => { if (form && $("fmN")) { form.n = $("fmN").value; form.c = $("fmC").value; } if (coEdit && $("ceIn")) coEdit.v = $("ceIn").value; };
  const draw = () => {
    const cos = leaseCos(); if (owner !== "自社" && !cos.includes(owner)) owner = "自社";
    const items = machineItems().filter(x => x.tag !== "前に使った" && (owner === "自社" ? x.区分 === "自社" : x.区分 === "リース" && nk(x.会社) === nk(owner)));
    const byCat = CATS.map(([c, ic]) => [c, ic, items.filter(x => x.cat === c)]).filter(x => x[2].length);
    $("sBody").innerHTML = `<div class="hint">直した候補は、このブラウザの中だけに入ります（試作）。</div>` +
      `<div class="fz"><div class="fzh">リース会社</div>${cos.map(c => `<div class="ce"><span>${esc(c)}</span><button type="button" class="sub small" data-ren="${esc(c)}">直す</button><button type="button" class="sub small" data-delco="${esc(c)}">消す</button></div>`).join("")}` +
      (coEdit ? `<div class="row2" style="margin-top:6px"><input type="text" id="ceIn" value="${esc(coEdit.v || "")}"><button type="button" class="pri small" data-ceok="1" style="flex:none">${coEdit.co ? "直す" : "足す"}</button></div>` : `<button type="button" class="sub" data-addco="1" style="margin-top:6px">＋ 会社を足す</button>`) + `</div>` +
      `<div class="fz"><div class="fzh">機械（だれの機械か押す）</div><div class="chips">${["自社", ...cos].map(c => `<button type="button" data-ow="${esc(c)}" class="${owner === c ? "on" : ""}">${esc(c)}</button>`).join("")}</div>` +
      (form ? `<div class="fz"><div class="fzh">${esc(owner)} に機械を足す</div>${catGrid(form.cat, null, "data-fc")}<label class="lb">機械名</label><input type="text" id="fmN" value="${esc(form.n || "")}"><label class="lb">能力</label><input type="text" id="fmC" value="${esc(form.c || "")}"><button type="button" class="pri" data-fmok="1" style="margin-top:8px">足す</button></div>`
        : `<button type="button" class="sub" data-addm="1" style="margin:4px 0">＋ ${esc(owner)} に機械を足す</button>`) +
      (byCat.map(([c, ic, a]) => `<div class="grp">${ic} ${esc(c)}</div>` + a.map(x => `<div class="ce"><span>${esc(x.名前)} <small>${esc(capL(x))}</small></span><button type="button" class="sub small" data-delm="${esc(mkey(x))}">消す</button></div>`).join("")).join("") || `<div class="empty">${esc(owner)} の機械の候補はありません</div>`) + `</div>` +
      `<div class="free"><button type="button" class="sub small" data-reset="1">直した候補を全部もとに戻す</button></div>`;
  };
  openSheet("候補編集", ""); draw();
  $("sClose").onclick = () => { closeSheet(); render(); };
  $("sBody").onclick = e => {
    const t = e.target; let b; keep();
    if ((b = t.closest("[data-ren]"))) { coEdit = { co: b.dataset.ren, v: b.dataset.ren }; draw(); $("ceIn").focus(); return; }
    if (t.closest("[data-addco]")) { coEdit = { co: "", v: "" }; draw(); $("ceIn").focus(); return; }
    if (t.closest("[data-ceok]")) { const v = $("ceIn").value.trim(); if (!v) return; if (coEdit.co) { renCo(coEdit.co, v); if (owner === coEdit.co) owner = v; } else addCo(v); coEdit = null; draw(); return; }
    if ((b = t.closest("[data-delco]"))) { if (confirm(`${b.dataset.delco} を候補から消しますか？`)) { delCo(b.dataset.delco); draw(); } return; }
    if ((b = t.closest("[data-ow]"))) { owner = b.dataset.ow; form = null; draw(); return; }
    if ((b = t.closest("[data-delm]"))) { const c = cand(), k = b.dataset.delm, j = c.機械足す.findIndex(x => mkey(Object.assign({ 種類: "" }, x)) === k); if (j >= 0) c.機械足す.splice(j, 1); else c.機械消す.push(k); putCand(c); draw(); return; }
    if (t.closest("[data-addm]")) { form = { cat: "", n: "", c: "" }; draw(); $("fmN").focus(); return; }
    if ((b = t.closest("[data-fc]"))) { form.cat = b.dataset.fc; draw(); return; }
    if (t.closest("[data-fmok]")) { const n = form.n.trim(); if (!n) { toast("機械名を書いてください"); return; } if (!form.cat) { toast("分類（絵）を押してください"); return; }
      const c = cand(); c.機械足す.push({ 区分: owner === "自社" ? "自社" : "リース", 会社: owner === "自社" ? "" : owner, 名前: n, 能力: capN(form.c), cat: form.cat }); putCand(c); form = null; draw(); toast(n + " を足しました"); return; }
    if (t.closest("[data-reset]")) { if (confirm("直した候補（会社・機械）を全部もとに戻しますか？")) { try { localStorage.removeItem(CKEY); } catch (e) { } draw(); } return; }
  };
}
/* ---- 縦に送って選ぶ窓（2026-11-19 ユーザー：気温は数なので縦にスワイプ。台数も） ---- */
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, j) => String(a + j));
const TEMP = [6, 7, 10, 15, 19, 22, 26, 27, 24, 19, 14, 9];   // 月のだいたいの気温（始めの位置）
const WH = 44;
function wheel(o) {
  const vals = o.vals.map(String), idx = Math.max(0, vals.indexOf(String(o.cur)));
  openSheet(o.title, `<div class="hint">上下に送って、まん中の数で「決める」。数を押してもそこへ動きます。</div><div class="wheel"><div class="wbar"></div><div class="wlist" id="wl"><div class="wpad"></div>${vals.map((v, j) => `<div class="wi" data-wi="${j}">${esc(v)}<small> ${esc(o.unit || "")}</small></div>`).join("")}<div class="wpad"></div></div></div>` +
    (o.clear ? `<div class="free"><button type="button" class="sub" data-clear="1">空にする</button></div>` : ""), () => { o.done(vals[cur()]); });
  const wl = $("wl"), cur = () => Math.max(0, Math.min(vals.length - 1, Math.round(wl.scrollTop / WH)));
  const mark = () => { const c = cur(); wl.querySelectorAll(".wi").forEach((el, j) => el.classList.toggle("on", j === c)); };
  wl.scrollTop = idx * WH; mark(); wl.onscroll = mark;
  $("sBody").onclick = e => {
    const it = e.target.closest("[data-wi]"); if (it) { wl.scrollTo({ top: +it.dataset.wi * WH, behavior: "smooth" }); return; }
    if (e.target.closest("[data-clear]")) { o.done(""); closeSheet(); }
  };
}
/* ---- 材料の候補：材料マスタ（分類・材料名・規格・単位）・前に使ったもの ---- */
function materialItems() {
  const out = [], seen = new Set(), add = it => { const k = [nk(it.分類), nk(it.名前), nk(it.規格)].join("|"); if (seen.has(k)) return; seen.add(k); out.push(it); };
  recs().forEach(r => (r.材料 || []).forEach(z => z.材料名 && add({ 分類: z.分類 || "", 名前: z.材料名, 規格: z.規格 || "", 単位: z.単位 || "", tag: "前に使った" })));
  SPD.材料.forEach(x => add({ 分類: x.分類, 名前: x.名前, 規格: x.規格, 単位: x.単位 }));
  return out;
}
function pickMaterial(i, isNew) {
  const r = S.rec, z = r.材料[i];
  facetSheet({ title: "材料", what: "材料", items: materialItems(), need: ["名前"], note: "分類・材料名・規格のどこからでも絞り込めます。",
    sel: { 分類: z.分類 || "", 名前: z.材料名 || "", 規格: z.規格 || "" },
    facets: [{ k: "分類", label: "分類", byCount: true }, { k: "名前", label: "材料名", free: true }, { k: "規格", label: "規格", free: true }],
    itemLabel: it => `<b>${esc(it.名前)}</b> ${esc(it.規格)}<small>　${esc(it.分類)}${it.単位 ? "・" + esc(it.単位) : ""}</small>`,
    done: s => { const it = materialItems().find(x => nk(x.名前) === nk(s.名前) && nk(x.規格) === nk(s.規格)); Object.assign(z, { 分類: s.分類, 材料名: s.名前, 規格: s.規格, 単位: (it && it.単位) || z.単位 || "" }); touch(); render(); } });
  if (isNew) $("sClose").onclick = () => { if (!r.材料[i].材料名) { r.材料.splice(i, 1); render(); } closeSheet(); $("sClose").onclick = closeSheet; };
}

const pkBtn = (v, ph, attrs, ng) => `<button type="button" class="pk ${v ? "" : "ph"} ${ng ? "ng" : ""}" ${attrs}>${esc(v || ph)}</button>`;

/* ================= 見せる ================= */
function render() {
  const r = S.rec;
  document.querySelectorAll("#mode button").forEach(b => b.classList.toggle("on", b.dataset.mode === S.mode));
  const n = { sagyo: r.作業.filter(w => w.予定 || w.報告).length, hito: r.作業員.length, kikai: r.機械.reduce((a, m) => a + (+m.数量 || 1), 0), zai: r.材料.length, gai: r.外注.reduce((a, w) => a + (w.名前 ? 1 : +w.人数 || 1), 0), car: r.車.length };
  document.querySelectorAll("#tabs button").forEach(b => {
    const on = b.dataset.tab === S.tab, c = n[b.dataset.tab];
    b.classList.toggle("on", on);
    let s = b.querySelector(".n"); if (c && !s) { s = document.createElement("span"); s.className = "n"; b.appendChild(s); }
    if (s) { if (c) s.textContent = c; else s.remove(); }
    if (on && S.tabScroll !== S.tab) { S.tabScroll = S.tab; b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }
  });
  $("cur").innerHTML = `<b>${jpd(r.日付)}</b>　${r.勤務}　${r.現場 ? `<b>${esc(r.現場)}</b>` : '<span class="ng">現場を選んでください</span>'}　${r.区分 === "常用" ? "<b>常用</b>" : "請負"}${S.dirty ? "　<small>（保存していません）</small>" : ""}`;
  $("pane").innerHTML = ({ kihon, sagyo, hito, kikai, zai, gai, car })[S.tab](r);
}
const fh = (t, req, note, right) => `<div class="fh">${t}${req ? ' <span class="req">＊</span>' : ""}${note ? ` <span class="note">${note}</span>` : ""}${right ? `<span class="r">${right}</span>` : ""}</div>`;
const segH = (f, list, cur, l, i) => `<div class="seg">${list.map(v => `<button type="button" data-seg="${f}" data-v="${esc(v)}" ${l ? `data-l="${l}" data-i="${i}"` : ""} class="${v === cur ? "on" : ""}">${esc(v)}</button>`).join("")}</div>`;
const inp = (l, i, f, v, extra) => `<input type="text" data-l="${l}" data-i="${i}" data-f="${f}" value="${esc(v)}" ${extra || ""}>`;
const num = (l, i, f, v, ph) => inp(l, i, f, v, `inputmode="decimal" placeholder="${esc(ph || "")}"`);
const tim = (l, i, f, v) => `<input type="time" data-l="${l}" data-i="${i}" data-f="${f}" value="${t2input(v)}">`;

// 基本タブ（2026-11-19 ユーザー：行の節約。見出しと入力欄を同じ行に・日付の下に作業時間・現場名の横に常用・元請は現場名の下）
const fr = (t, req, body, cls) => `<div class="fr ${cls || ""}"><span class="fl">${t}${req ? '<span class="req">＊</span>' : ""}</span><div class="fc">${body}</div></div>`;
function kihon(r) {
  if (!r.始業 || !r.終業) [r.始業, r.終業] = TEIJI[r.勤務 === "夜" ? "夜" : "昼"];   // 前の版で保存した日報
  return `<div class="frs">` +
    fr("日付", true, `<input type="date" data-l="" data-f="日付" value="${r.日付}">${segH("勤務", ["昼", "夜"], r.勤務)}`) +
    fr("作業時間", false, `${tim("", "", "始業", r.始業)}<span class="til">〜</span>${tim("", "", "終業", r.終業)}`, "tm") +
    `<div class="fhint">昼夜を押すと 昼 ${TEIJI.昼.join("〜")}・夜 ${TEIJI.夜.join("〜")}。作業員・外注を足すときの始めの値。</div>` +
    fr("現場名", true, `${pkBtn(r.現場, "押して選ぶ", 'data-act="pickSite"', !r.現場)}<button type="button" class="chk ${r.区分 === "常用" ? "on" : ""}" data-act="joyo" aria-pressed="${r.区分 === "常用"}" title="常用の日だけ印を付ける。付けない日＝請負">${r.区分 === "常用" ? "✅" : "☐"} 常用</button>`) +
    fr("元請業者", false, pkBtn(r.元請, "押して選ぶ", 'data-act="pickMoto"')) +
    fr("天気", false, WX5.map(([v, t]) => { const on = wxSet(r.天気).includes(v); return `<button type="button" class="chk wxb ${on ? "on" : ""}" data-act="wx" data-v="${v}">${on ? "☑" : "☐"}${t}</button>`; }).join(""), "wx") +
    fr("気温", false, `<button type="button" class="pk kionb ${r.気温 === "" || r.気温 == null ? "ph" : ""}" data-act="kion">${r.気温 === "" || r.気温 == null ? "押して選ぶ" : esc(r.気温) + " ℃"}</button>`, "kion") +
    fr("記入者", false, pkBtn(r.記入者, "押して選ぶ", 'data-act="pickMe"')) +
    `</div><div class="fv hint">保存はこのブラウザの中だけです（試作）。本物の日報には書きません。</div>`;
}
function sagyo(r) {
  const col = S.mode === "報告" ? "報告" : "予定", other = col === "報告" ? "予定" : "報告";
  return planHtml(r, "sagyo") +
    fh(col === "予定" ? "作業予定" : "完了報告", false, "1行に1つ", col === "報告" ? `<button type="button" class="sub small" data-act="copyPlan">作業予定を完了報告へコピー</button>` : "") +
    r.作業.map((w, i) => `<div class="card"><div class="ch">${i + 1}<button type="button" class="sub small kouho" data-act="pickWork" data-i="${i}">全体工程・前に書いたものから選ぶ</button><button type="button" class="x" data-act="del" data-l="作業" data-i="${i}" title="この行を消す">✕</button></div>` +
      (w[other] ? `<div class="ref">${other === "予定" ? "作業予定" : "完了報告"}：${esc(w[other])}</div>` : "") +
      `<textarea data-l="作業" data-i="${i}" data-f="${col}" rows="2" placeholder="${col === "予定" ? "作業予定" : "完了報告"}">${esc(w[col])}</textarea></div>`).join("") +
    `<button type="button" class="add" data-act="addSagyo">＋ 行を足す</button>`;
}
function personCard(l, w, i) {
  const ng = rowErr(l, w, i), wn = ng ? "" : rowWarn(l, w);
  const noName = l === "外注" && !w.名前 && +w.人数 > 0, nm = noName ? "名前未定" : w.名前;
  const kNg = S.rec.区分 === "常用" && !w.工種;
  return `<div class="card pc ${ng ? "ng" : wn ? "wn" : ""}">` +
    `<div class="pr1"><button type="button" class="pk nm ${nm ? "" : "ph"} ${!w.名前 && !noName ? "ng" : ""}" data-act="pickName" data-l="${l}" data-i="${i}">${esc(nm || "名前を選ぶ")}${l === "外注" ? `<small>${esc(w.会社 || "会社なし")}</small>` : ""}</button>` +
    `<button type="button" class="pk ks ${w.工種 ? "" : "ph"} ${kNg ? "ng" : ""}" data-act="pickKoshu" data-l="${l}" data-i="${i}">${esc(w.工種 || (S.rec.区分 === "常用" ? "工種＊" : "工種"))}</button>` +
    `<button type="button" class="x" data-act="del" data-l="${l}" data-i="${i}" title="消す">✕</button></div>` +
    `<div class="pr2">${tim(l, i, "始業", w.始業)}<span class="til">〜</span>${tim(l, i, "終業", w.終業)}<span class="zl">残</span>${num(l, i, "残", w.残, "0")}</div>` +
    (noName ? `<div class="qrow"><label class="lb">人数</label>${stepH("qty", l, i, "人数", w.人数)}</div>` : "") +
    `<input type="text" class="pnote" data-l="${l}" data-i="${i}" data-f="内容" value="${esc(w.内容 || "")}" placeholder="作業内容（この人だけ書くことがあれば）">` +
    (ng ? `<div class="msg">${esc(ng)}</div>` : "") + (wn ? `<div class="wmsg">${esc(wn)}</div>` : "") + `</div>`;
}
// 保存できない誤り
function rowErr(l, w, i) {
  const r = S.rec;
  if (l === "外注" && !w.会社) return "会社を選んでください";
  if (r.区分 === "常用" && !w.工種) return "常用の日は工種を選んでください";
  if (!w.名前) return l === "外注" && +w.人数 > 0 ? "" : "名前を選んでください";
  if (l === "外注") {
    const co = companyOfPerson(w.名前);
    if (co != null && nk(co) !== nk(w.会社)) return `名簿ではこの人の会社は「${co || "なし"}」です（${w.会社} の人ではありません）`;
  }
  const same = (a, j, l2) => a.some((x, k) => (l2 !== l || k !== j) && nk(x.名前) === nk(w.名前) && x.昼夜 === w.昼夜);
  if (same(r.作業員, i, "作業員") || same(r.外注, i, "外注")) return "同じ人が同じ昼夜に2回入っています（作業員と外注にも重ねられません）";
  return "";
}
// 注意（保存はできる）。2026-11-19 ユーザー：名簿にいない外注の会社（例 オリノ）で先に進めなかった → 名前を書く・人数だけで進める
function rowWarn(l, w) {
  const ew = w.名前 ? elsewhere(w.名前) : [];
  if (ew.length) return "ほかの現場にも入っています：" + ew.join("・");
  if (l !== "外注") return "";
  if (!w.名前) return `名前未定で ${w.人数 || 1}名 入れています。名簿に人を足したら名前を選んでください。`;
  if (companyOfPerson(w.名前) == null) return "名簿にいない人です（保存はできます。あとで名簿に足してください）。";
  return "";
}
function hito(r) {
  const by = {};
  r.作業員.concat(r.外注).forEach(w => { const k = (w.工種 || "（工種なし）") + "｜" + w.昼夜; by[k] = (by[k] || 0) + (w.名前 ? 1 : +w.人数 || 1); });
  const sum = Object.keys(by).length ? `<div class="sum"><b>工種別の集計</b>（作業員＋外注）<table><tr><th>工種</th><th>昼夜</th><th>人員</th></tr>${Object.entries(by).map(([k, v]) => { const [a, b] = k.split("｜"); return `<tr><td>${esc(a)}</td><td>${b}</td><td>${v}</td></tr>`; }).join("")}</table></div>` : "";
  return planHtml(r, "hito") + fh("作業員", false, "自社の人（社員・従業員）") +
    (r.作業員.length ? r.作業員.map((w, i) => personCard("作業員", w, i)).join("") : `<div class="empty">まだいません。</div>`) +
    `<button type="button" class="add" data-act="addHito">＋ 作業員を選ぶ</button>` + sum;
}
function kikai(r) {
  const pl = plannedMachines(r);
  const cell = (i, k, v, ph, cls) => `<button type="button" class="mc ${v ? "" : "ph"} ${cls || ""}" data-act="mcell" data-i="${i}" data-k="${k}">${v || ph}</button>`;
  const row = (m, i, isNew) => {
    const kb = m.区分 === "自社" ? "自社" : m.区分 === "リース" ? (m.会社 || "リース") : "", ci = CATS.find(c => c[0] === m.種別);
    return `<div class="mr">${cell(i, "区分", esc(kb), "区分", m.区分 === "リース" ? "ls" : "")}${cell(i, "種別", ci ? `<span class="ci">${ci[1]}</span>${esc(ci[0])}` : "", "分類", "ct")}${cell(i, "名前", esc(m.使用機材 || ""), "機械名")}${cell(i, "能力", esc([m.種類, m.規格].filter(Boolean).join(" ")), "能力")}${cell(i, "台", isNew ? "" : esc(m.数量 || "1"), "台", "qt")}` +
      (isNew ? `<span></span><span></span>` : `<button type="button" class="pm" data-act="mplus" data-i="${i}" title="下に行を足す">＋</button><button type="button" class="pm" data-act="mminus" data-i="${i}" title="この行を消す">−</button>`) + `</div>`;
  };
  return fh("使用機材", false, "", `<button type="button" class="kh" data-act="candEdit">候補編集</button>`) +
    (pl.length ? `<div class="pln"><div class="grp">${jpd(r.日付)} ${r.勤務}　この現場に予定している機械（押すと入る）</div><div class="chips">${pl.map((p, j) => `<button type="button" data-act="addPlanned" data-i="${j}" class="${hasPlanned(r, p) ? "used" : ""}">${esc(p.区分 === "自社" ? "自社" : p.会社 || "リース")}・${esc(p.名前)} ${esc([p.種類, p.能力].filter(Boolean).join(" "))}<small> ${esc(p.from)}</small></button>`).join("")}</div></div>` : "") +
    `<div class="mt"><div class="mr mh"><span>区分</span><span>分類</span><span>機械名</span><span>能力</span><span>台</span><span></span><span></span></div>${r.機械.map((m, i) => row(m, i)).join("")}${row({}, r.機械.length, true)}</div>` +
    `<div class="fv"><div class="hint">マスを押して選ぶ（どのマスからでも。選んだものでほかのマスの候補が絞れる）。＋ 下に行を足す・− 消す。リース会社は「区分」で選ぶ。</div></div>`;
}
function zai(r) {
  return fh("材料", false, "押すと 分類・材料名・規格 で絞り込み") +
    (r.材料.length ? r.材料.map((m, i) => `<div class="card"><div class="ch">${pkBtn(m.材料名 ? m.材料名 + (m.規格 ? " " + m.規格 : "") : "", "材料を選ぶ", `data-act="pickZai" data-i="${i}"`, !m.材料名)}<button type="button" class="x" data-act="del" data-l="材料" data-i="${i}">✕</button></div>` +
      (m.分類 ? `<div class="mline"><span class="tg">${esc(m.分類)}</span></div>` : "") +
      `<div class="grid2"><div><label class="lb">数量${m.単位 ? "（" + esc(m.単位) + "）" : ""}</label>${num("材料", i, "数量", m.数量)}</div><div><label class="lb">実費（円）</label>${num("材料", i, "実費", m.実費)}</div></div></div>`).join("") : `<div class="empty">まだありません。</div>`) +
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
  if (o === S.rec && (el.dataset.f === "始業" || el.dataset.f === "終業")) { const old = o[el.dataset.f]; o.作業員.concat(o.外注).forEach(w => { if (w[el.dataset.f] === old) w[el.dataset.f] = v; }); }   // 作業時間を直すと、同じ時刻の人も直す
  o[el.dataset.f] = v; touch();
  if (el.dataset.f === "日付") render();
});
$("pane").addEventListener("change", e => { const el = e.target; if (el.inputMode === "decimal" && el.value !== han(el.value)) el.value = han(el.value); if (el.dataset.f && el.tagName !== "TEXTAREA") render(); });
$("pane").addEventListener("click", e => {
  const sg = e.target.closest("[data-seg]");
  if (sg && !sg.dataset.l && sg.dataset.seg === "勤務") { setShift(S.rec, sg.dataset.v); touch(); render(); return; }
  if (sg) { const o = sg.dataset.l ? S.rec[sg.dataset.l][+sg.dataset.i] : S.rec, f = sg.dataset.seg; o[f] = o[f] === sg.dataset.v && (f === "天気" || f === "区分") ? "" : sg.dataset.v; touch(); render(); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const r = S.rec, i = +b.dataset.i, l = b.dataset.l, act = b.dataset.act;
  const set = (o, f) => v => { o[f] = v; touch(); render(); };
  switch (act) {
    case "planAll": return applyPlan(b.dataset.i, "all");
    case "planHito": return applyPlan(b.dataset.i, "hito");
    case "planGai": { const x = planOf(r).list[i]; return addGaiFlow(x.外注.業者, x.作業, x.夜 ? "夜" : "昼"); }
    case "del": if (l === "作業") {
      const w = r.作業[i], col = S.mode === "報告" ? "報告" : "予定", oth = col === "報告" ? "予定" : "報告", on = oth === "予定" ? "作業予定" : "完了報告";
      if (!confirm(w[oth] ? `${on}も消えますがよいですか？\n（${on}：${w[oth]}）` : "この行を消しますか？")) return;
      r.作業.splice(i, 1); if (!r.作業.length) r.作業.push({ 予定: "", 報告: "" }); touch(); render(); return;
    } else { const a = r[l]; const what = l === "作業" ? "この行" : (a[i].名前 || a[i].使用機材 || a[i].材料名 || a[i].種類 || "これ"); if (!confirm(what + " を消しますか？")) return; a.splice(i, 1); if (l === "作業" && !a.length) a.push({ 予定: "", 報告: "" }); touch(); render(); return; }
    case "copyPlan": {
      const n = r.作業.filter(w => w.予定 && !w.報告).length;
      if (!n) { toast("写す作業予定がありません（完了報告が空の行だけ写します）"); return; }
      r.作業.forEach(w => { if (w.予定 && !w.報告) w.報告 = w.予定; }); touch(); render(); toast(n + "行を完了報告へ写しました"); return;
    }
    // 2026-11-18 ユーザー：常用・請負を選ばせるのをやめ、常用の印だけ（触らなければ請負のまま次に進める）
    case "wx": { const a = wxSet(r.天気), v = b.dataset.v, n = a.includes(v) ? a.filter(x => x !== v) : [...a, v]; r.天気 = WX5.map(x => x[0]).filter(x => n.includes(x)).join("/"); touch(); render(); return; }
    case "kion": return wheel({ title: "気温", vals: range(-10, 40), cur: r.気温 !== "" && r.気温 != null ? r.気温 : TEMP[+r.日付.slice(5, 7) - 1], unit: "℃", clear: true, done: v => { r.気温 = v; touch(); render(); } });
    // 機械（2026-11-19 ユーザー：表の形 区分｜分類｜機械名｜能力｜＋｜−。マスはどれからでも押せて、ほかのマスの候補が絞れる）
    case "mcell": {
      if (i >= r.機械.length) r.機械.push(blankM());
      const k = b.dataset.k;
      if (k === "区分") return kubunSheet(i);
      if (k === "種別") return catSheet(i);
      if (k === "名前") return nameSheet(i);
      if (k === "能力") return capSheet(i);
      return wheel({ title: "台数", vals: range(1, 30), cur: r.機械[i].数量 || 1, unit: "台", done: v => { r.機械[i].数量 = v; touch(); render(); } });
    }
    case "mplus": r.機械.splice(i + 1, 0, blankM()); touch(); render(); return;
    case "mminus": { const m = r.機械[i]; if ((m.使用機材 || m.区分) && !confirm(`${m.使用機材 || "この行"} を消しますか？`)) return; r.機械.splice(i, 1); touch(); render(); return; }
    case "addPlanned": { const p = plannedMachines(r)[i]; if (!p) return; if (hasPlanned(r, p)) { toast("もう入っています"); return; }
      r.機械.push({ 区分: p.区分, 会社: p.会社, 種別: p.cat, 使用機材: p.名前, 種類: p.種類 || "", 規格: p.能力, 分類: p.分類 || "", 数量: String(p.数量 || 1), 所有者: p.区分 === "自社" ? SELF : p.会社 || "リース" }); touch(); render(); return; }
    case "candEdit": return candEdit();
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
          note: `${esc(w.会社)} の人だけを出しています。<button type="button" class="sub small" data-act2="chgco">会社を変える</button>`, free: true,
          empty: "この会社の人は名簿にいません。下の「候補に無いものを書く」で名前を書けます（名前未定の人数のままでも保存できます）", done: v => { w.名前 = v; if (v) delete w.人数; touch(); render(); },
          chgco: () => pickCompany(co => { if (nk(co) !== nk(w.会社)) { w.会社 = co; w.名前 = ""; } touch(); render(); document.querySelector(`[data-act="pickName"][data-l="外注"][data-i="${i}"]`).click(); }) });
      }
      const a = own();
      return pick({ title: "作業員", groups: ["社員", "従業員"].map(k => ({ name: k, items: a.filter(p => p.区分 === k).map(p => ({ v: p.名前, kana: p.かな, used: usedName(p.名前, w.昼夜) && nk(p.名前) !== nk(w.名前) })) })), value: w.名前, done: v => { if (!okElsewhere([v])) return; w.名前 = v; touch(); render(); } });
    }
    case "pickKoshu": {
      const w = r[l][i], p = planOf(r);
      const fromPlan = p ? [...new Set(p.list.map(x => x.作業).filter(Boolean))] : [];
      const siteOther = siteKotei(r).works.map(x => x.v).filter(v => !fromPlan.includes(v));
      const used = usedVals("作業員", "工種").concat(usedVals("外注", "工種")).filter(v => !fromPlan.includes(v) && !siteOther.includes(v));
      return pick({ title: "工種", groups: [{ name: "この日の工程", items: fromPlan.map(v => ({ v })) }, { name: "この現場のほかの日の工程", items: siteOther.map(v => ({ v })) }, { name: "前に使った工種", items: [...new Set(used)].map(v => ({ v })) }], value: w.工種, clear: true, free: true, empty: "候補がありません。「候補に無いものを書く」で入れてください", done: set(w, "工種") });
    }
    case "addGai": return pickCompany(co => addGaiFlow(co, "", r.勤務));
    case "qty": { const o = r[l][i], f = b.dataset.f; o[f] = String(Math.max(1, (+o[f] || 1) + +b.dataset.d)); touch(); render(); return; }
    case "addZai": r.材料.push({ 分類: "", 材料名: "", 規格: "", 単位: "", 数量: "", 実費: "" }); touch(); render(); return pickMaterial(r.材料.length - 1, true);
    case "pickZai": return pickMaterial(i);
    case "pickWork": {
      const w = r.作業[i], col = S.mode === "報告" ? "報告" : "予定", sk = siteKotei(r);
      const has = v => String(w[col] || "").split(/\n/).map(t => t.trim()).includes(v);
      const today = sk.works.filter(x => x.today), other = sk.works.filter(x => !x.today);
      const used = usedWorks().filter(v => !sk.works.some(x => x.v === v));
      return pick({ title: (col === "予定" ? "作業予定" : "完了報告") + " " + (i + 1) + " の候補", multi: true, value: [],
        note: r.現場 ? "押した作業をこの欄に足します（いくつも選べます）。" : "先に「基本」で現場を選ぶと、全体工程の作業が出ます。",
        groups: [{ name: jpd(r.日付) + " の全体工程", items: today.map(x => ({ v: x.v, used: has(x.v) })) },
          { name: "この現場のほかの日の工程", items: other.map(x => ({ v: x.v, sub: x.span.slice(0, 2).join("・"), used: has(x.v) })) },
          { name: "前に書いた作業", items: used.map(v => ({ v, used: has(v) })) }],
        free: true, empty: "候補がありません。「候補に無いものを書く」か、欄に直接書いてください",
        done: list => { const add = list.filter(v => !has(v)); if (!add.length) return; w[col] = [String(w[col] || "").trim(), ...add].filter(Boolean).join("\n"); touch(); render(); toast(add.length + "つ足しました"); } });
    }
    case "addCar": r.車.push({ 種類: "高速", 往復: "往復", 区間: "", 給油: "", 実費: "", 会社: "", 名前: "", 車両名: "", 車番: "", メモ: "" }); touch(); render(); return;
    case "pickKukan": { const c = r.車[i]; return pick({ title: "高速の区間", groups: [{ name: "前に使った区間", items: usedVals("車", "区間").map(v => ({ v })) }], value: c.区間, clear: true, free: true, done: set(c, "区間") }); }
    case "pickDriver": {
      const c = r.車[i], list = r.作業員.concat(r.外注).filter(w => w.名前);
      return pick({ title: "だれ（今日の作業員・外注から）", groups: [{ items: list.map(w => ({ v: w.名前 + "\t" + (w.会社 || ""), label: w.名前, sub: w.会社 })) }], value: c.名前 + "\t" + c.会社, clear: true, empty: "先に作業員・外注を入れてください", done: v => { const [n, co] = String(v).split("\t"); c.名前 = n || ""; c.会社 = co || ""; touch(); render(); } });
    }
    case "pickCar": { const c = r.車[i]; return pick({ title: "車両名", groups: [{ name: "自社車両", items: S.M.車両.map(x => ({ v: x.車両名, sub: x.車番 })) }, { name: "前に使った車両", items: usedVals("車", "車両名").filter(v => !S.M.車両.some(x => x.車両名 === v)).map(v => ({ v })) }], value: c.車両名, clear: true, free: true, done: v => { c.車両名 = v; const x = S.M.車両.find(y => y.車両名 === v); if (x && x.車番) c.車番 = x.車番; touch(); render(); } }); }
  }
});
// 2026-11-19 ユーザー：ほかの現場に入っている人を入れようとしたら警告（同じ日・同じ昼夜の ほかの現場の日報／全体工程）
function elsewhere(name, r) {
  r = r || S.rec; const out = [];
  recs().forEach(x => { if (x.id === r.id || x.日付 !== r.日付 || (x.勤務 || "昼") !== r.勤務 || sameSite(x.現場, r.現場)) return; if ((x.作業員 || []).concat(x.外注 || []).some(w => nk(w.名前) === nk(name))) out.push(x.現場 + "（日報）"); });
  S.sites.forEach(s => { if (r.現場 && sameSite(s.名前, r.現場)) return; const p = planOf({ 現場: s.名前, 日付: r.日付 }); if (p && p.list.some(x => (x.夜 ? "夜" : "昼") === r.勤務 && x.社員.some(n => nk(n) === nk(name)))) out.push(s.名前 + "（全体工程）"); });
  return [...new Set(out)];
}
const okElsewhere = names => { const a = names.map(n => [n, elsewhere(n)]).filter(x => x[1].length); return !a.length || confirm(a.map(([n, e]) => `${n}：${e.join("・")}`).join("\n") + "\n\nほかの現場に入っています。入れますか？"); };
const usedName = (n, sh) => S.rec.作業員.some(w => nk(w.名前) === nk(n) && w.昼夜 === sh) || S.rec.外注.some(w => nk(w.名前) === nk(n) && w.昼夜 === sh);
function pickWorkers() {
  const r = S.rec, a = own(), sh = r.勤務;
  pick({ title: `作業員を選ぶ（${sh}）`, multi: true, note: "いくつも選べます。選んだら「入れる」。",
    groups: ["社員", "従業員"].map(k => ({ name: k, items: a.filter(p => p.区分 === k).map(p => { const e = elsewhere(p.名前); return { v: p.名前, kana: p.かな, used: usedName(p.名前, sh), sub: e.length ? "⚠" + e[0] : "" }; }) })),
    done: list => { if (!okElsewhere(list)) return false; const n = addWorkers(list, "", sh); touch(); render(); if (n) toast(n + "人を入れました"); } });
}
// 外注の会社：その日の全体工程の外注 → この現場の工程の外注 → 前に使った会社 → ほか（たたむ）。2026-11-19 ユーザー：外注名は全体工程から候補・絞り込める
function pickCompany(done) {
  const r = S.rec, sk = siteKotei(r), seen = new Set(), sub = v => { const n = membersOf(v).length; return n ? n + "人" : "名簿に人なし"; };
  const take = (name, list, fold) => { const items = list.filter(v => v && !seen.has(nk(v))); items.forEach(v => seen.add(nk(v))); return { name, fold, items: items.map(v => ({ v, sub: sub(v) })) }; };
  const usedCos = []; recs().slice().sort((a, b) => String(b.更新).localeCompare(String(a.更新))).forEach(x => (x.外注 || []).forEach(w => w.会社 && !usedCos.some(c => nk(c) === nk(w.会社)) && usedCos.push(w.会社)));
  const all = companies();
  const groups = [take(jpd(r.日付) + " の全体工程の外注", sk.cos.filter(x => x.today).map(x => x.v)), take("この現場の全体工程に出てくる外注", sk.cos.filter(x => !x.today).map(x => x.v)),
    take("前に使った会社", usedCos.slice(0, 8)), take("ほかの会社", all, all.length > 12)];
  pick({ title: "外注の会社", groups, free: true, note: r.現場 ? "" : "「基本」で現場を選ぶと、全体工程の外注が上に出ます。", empty: "外注業者の一覧がありません", done });
}
function pushGai(co, nm, sh, 工種, 人数) {
  sh = S.rec.勤務;
  const row = { 会社: co, 名前: nm || "", 昼夜: sh, 始業: dayTime(sh)[0], 終業: dayTime(sh)[1], 工種: 工種 || "", 残: "" };
  if (!nm) row.人数 = String(人数 || 1);
  S.rec.外注.push(row);
}
function addGaiFlow(co, 工種, sh) {
  sh = S.rec.勤務;
  const m = membersOf(co);
  if (!m.length) return gaiNoMember(co, 工種, sh);
  pick({ title: `${co} の人（${sh}）`, multi: true, free: true, note: `<b>${esc(co)}</b> の人だけを出しています（ほかの会社の人は出しません）。名簿にいない人は下の「候補に無いものを書く」。`,
    groups: [{ items: m.map(p => ({ v: p.名前, kana: p.かな, used: usedName(p.名前, sh) })) }],
    done: list => {
      let n = 0;
      for (const nm of list) { if (usedName(nm, sh)) continue; pushGai(co, nm, sh, 工種); n++; }
      touch(); S.tab = "gai"; render(); if (n) toast(`${co} の ${n}人を入れました`);
    } });
}
// 名簿にその会社の人がいないとき（2026-11-19 ユーザー：オリノを押すと「名簿にいません」で先に進めない）→ 名前を書く か 人数だけ で進める
function gaiNoMember(co, 工種, sh) {
  sh = S.rec.勤務;
  let n = 1; const names = [];
  const draw = () => {
    $("sBody").innerHTML = `<div class="warn">名簿に「${esc(co)}」の人がまだいません。名前を書くか、名前未定のまま人数だけ入れて先に進めます（名簿にはあとで足せます）。</div>` +
      `<div class="fz"><div class="fzh">名前を書く</div>${names.length ? `<div class="chips">${names.map((v, j) => `<button type="button" class="on" data-rm="${j}">${esc(v)} ✕</button>`).join("")}</div>` : ""}` +
      `<div id="nmBox" hidden class="row2"><input type="text" id="nmIn"><button type="button" class="pri small" data-nmok="1" style="flex:none">足す</button></div>` +
      `<button type="button" class="sub" data-nm="1" style="margin-top:6px">名前を書く</button></div>` +
      (names.length ? "" : `<div class="fz"><div class="fzh">名前未定で人数だけ</div><div class="qrow"><label class="lb">人数</label><span class="step"><button type="button" data-q="-1">−</button><b>${n}</b><button type="button" data-q="1">＋</button></span></div></div>`);
  };
  openSheet(`${co}（${sh}）`, "", () => {
    if (names.length) names.forEach(v => usedName(v, sh) || pushGai(co, v, sh, 工種)); else pushGai(co, "", sh, 工種, n);
    touch(); S.tab = "gai"; render(); toast(names.length ? `${co} の ${names.length}人を入れました` : `${co} を名前未定で ${n}名 入れました`);
  }, "入れる");
  draw();
  $("sBody").onclick = e => {
    const t = e.target; let b;
    if (t.closest("[data-nm]")) { $("nmBox").hidden = false; $("nmIn").focus(); return; }   // ここで初めてキーボード
    if (t.closest("[data-nmok]")) { const v = $("nmIn").value.trim(); if (v && !names.includes(v)) names.push(v); draw(); return; }
    if ((b = t.closest("[data-rm]"))) { names.splice(+b.dataset.rm, 1); draw(); return; }
    if ((b = t.closest("[data-q]"))) { n = Math.max(1, n + +b.dataset.q); draw(); return; }
  };
}

/* ================= 作業日報の形（PC の用紙の並び） ================= */
function toForm(r) {
  const 上 = r.作業.filter(w => w.予定 || w.報告).map(w => ["", w.予定, "", "", w.報告]);
  while (上.length < 5) 上.push(["", "", "", "", ""]);
  const n = Math.max(r.作業員.length, r.機械.length, r.材料.length), 下 = [];
  for (let i = 0; i < n; i++) {
    const row = Array(16).fill(""), w = r.作業員[i], m = r.機械[i], z = r.材料[i];
    if (w) { row[0] = w.名前; row[1] = w.始業; row[2] = w.終業; row[3] = w.工種; row[4] = w.残 || ""; row[12] = w.会社; row[14] = w.昼夜; }
    if (m) { row[5] = m.使用機材; row[6] = [m.種類, m.規格].filter(Boolean).join(" "); row[7] = m.数量; row[13] = m.所有者; }
    if (z) { row[9] = z.材料名 + (z.規格 ? " " + z.規格 : ""); row[10] = z.数量 + (z.数量 && z.単位 ? z.単位 : ""); row[15] = z.実費; }
    下.push(row);
  }
  const 外注 = r.外注.map(w => { const row = Array(16).fill(""); row[0] = w.名前 || `（名前未定 ${w.人数 || 1}名）`; row[1] = w.始業; row[2] = w.終業; row[3] = w.工種; row[4] = w.残 || ""; row[12] = w.会社; row[14] = w.昼夜; return row; });
  const 車 = r.車.map(c => [c.種類, c.種類 === "高速" ? c.往復 : "", c.種類 === "高速" ? c.区間 : "", c.種類 === "高速" ? "" : c.給油, c.実費, c.会社, c.名前, c.車両名, c.車番, c.メモ]);
  return { 元請業者: r.元請, 現場名: r.現場, 日付: r.日付, 日: { 天気: r.天気, 気温: r.気温, 担当者: r.記入者, 形態: r.区分 === "常用" ? "常用" : "請負", 上, 下, 外注, 車 } };
}
function showForm() {
  const f = toForm(S.rec), d = f.日;
  const tb = (heads, rows) => `<div class="tw"><table><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${heads.length}">（なし）</td></tr>`}</table></div>`;
  // 2026-11-19 ユーザー：何も書いていない行・欄は出さない。作業員・使用機材・材料は別々の表に（横に長すぎた）
  const sec = (t, heads, rows) => rows.length ? `<h3>${t}</h3>` + tb(heads, rows) : "";
  openSheet("作業日報の形", `<div class="fm">
    <div class="hint">PC の作業日報と同じ中身を、書いた欄だけ表に分けて出しています。</div>
    <div class="tw"><table class="kv"><tr><td>元請業者</td><td>${esc(f.元請業者)}</td><td>日付</td><td>${esc(f.日付)}（${WD[dateOf(f.日付).getDay()]}）</td></tr>
    <tr><td>現場名</td><td>${esc(f.現場名)}</td><td>天気・気温</td><td>${esc(d.天気)} ${d.気温 ? esc(d.気温) + "℃" : ""}</td></tr>
    <tr><td>昼夜</td><td>${esc(S.rec.勤務)}</td><td>作業時間</td><td>${esc(S.rec.始業 || "")}〜${esc(S.rec.終業 || "")}</td></tr>
    <tr><td>記入者</td><td>${esc(d.担当者)}</td><td>区分</td><td>${esc(d.形態 === "常用" ? "常用" : "請負")}</td></tr></table></div>
    ${sec("作業予定・完了報告", ["作業予定", "完了報告"], d.上.map(r => [r[1], r[4]]).filter(r => r[0] || r[1]))}
    ${sec("作業員", ["会社", "作業員名", "始業時間", "終業時間", "工種", "残", "作業内容"], S.rec.作業員.map(w => [w.会社, w.名前, w.始業, w.終業, w.工種, w.残 || "", w.内容 || ""]))}
    ${sec("使用機材", ["使用機材", "規格・形式", "所有者", "数量"], S.rec.機械.filter(m => m.使用機材 || m.区分).map(m => [m.使用機材, [m.種類, m.規格].filter(Boolean).join(" "), m.所有者, m.数量]))}
    ${sec("材料", ["材料名", "数量", "実費"], S.rec.材料.filter(z => z.材料名).map(z => [z.材料名 + (z.規格 ? " " + z.規格 : ""), z.数量 + (z.数量 && z.単位 ? z.単位 : ""), z.実費]))}
    ${sec("外注", ["会社", "作業員名", "始業時間", "終業時間", "工種", "残", "作業内容"], S.rec.外注.map(w => [w.会社, w.名前 || `（名前未定 ${w.人数 || 1}名）`, w.始業, w.終業, w.工種, w.残 || "", w.内容 || ""]))}
    ${sec("高速・燃料", ["種類", "往復", "高速の区間", "給油(L)", "実費", "会社", "名前", "車両名", "車番", "メモ"], d.車)}
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
  r.機械 = r.機械.filter(m => m.使用機材 || m.区分 || m.種別 || m.規格);
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
  const KEY = "spn_demo_store2";
  try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }
  const k = today(), P = (名前, ふりがな, 区分, 会社) => ({ 名前, ふりがな, 区分, 会社 });
  const a = {
    "マスタ.json": { 社員: ["試し　太郎", "試し　次郎"], 従業員: ["見本　一郎", "見本　二郎", "見本　三郎"], 外注業者: ["Ａ工業", "Ｂ建設", "Ｃ組"],
      現場: [{ 名前: "A現場 配水管", 元請: "甲建設" }, { 名前: "B現場 道路改良", 元請: "乙土木" }, { 名前: "C現場 下水", 元請: "甲建設" },
        { 名前: "D現場 舗装", 元請: "乙土木" }, { 名前: "E現場 水道", 元請: "丙工務" }, { 名前: "F現場 造成", 元請: "丙工務" }, { 名前: "G現場 護岸", 元請: "甲建設" }] },
    "マスタ/人.json": { 形式: "人", 人: [P("試し　太郎", "ためし　たろう", "社員", ""), P("試し　次郎", "ためし　じろう", "社員", ""), P("見本　一郎", "みほん　いちろう", "従業員", ""), P("見本　二郎", "みほん　じろう", "従業員", ""), P("見本　三郎", "みほん　さぶろう", "従業員", ""),
      P("例題　太郎", "れいだい　たろう", "外注", "Ａ工業"), P("例題　次郎", "れいだい　じろう", "外注", "Ａ工業"), P("見積　一夫", "みつもり　かずお", "外注", "Ｂ建設"), P("見積　二夫", "みつもり　つぎお", "外注", "Ｂ建設"), P("仮名　五郎", "かめい　ごろう", "外注", "Ｃ組")] },
    "現場_s1.json": { id: "s1", 名前: "A現場 配水管", 段: [{ id: "l1", 名前: "昼間", 社員: ["試し　太郎"] }, { id: "l2", 名前: "昼間 掘削", 種別: "外注", 業者: "Ａ工業", 人数: "2" }, { id: "l3", 名前: "夜間", 社員: ["試し　次郎"], 業者: "Ｂ建設", 外注人数: "2" }, { id: "l4", 名前: "昼間 舗装", 種別: "外注", 業者: "Ｄ興業（名簿に人なし）", 人数: "3" }],
      バー: [{ id: "b1", 段: "l1", 作業: "布設工", 開始: addDays(k, -3), 終了: addDays(k, 6), 人数: 3, 色: "青" }, { id: "b2", 段: "l2", 作業: "掘削", 開始: addDays(k, -1), 終了: addDays(k, 2), 人数: "2", 色: "橙" }, { id: "b3", 段: "l3", 作業: "推進工", 開始: addDays(k, -5), 終了: addDays(k, 5), 人数: 2, 色: "紫" }, { id: "b4", 段: "l4", 作業: "舗装工", 開始: k, 終了: addDays(k, 1), 人数: "3", 色: "緑" }, { id: "b5", 段: "l1", 作業: "埋戻し", 開始: addDays(k, 7), 終了: addDays(k, 10), 人数: 3, 色: "茶" }] },
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
    機械: ((kado && kado.機械) || []).filter(x => x && x.名前 && !x.使わない).map(x => ({ id: x.id, 名前: x.名前, 規格: x.規格 || "", 分類: x.分類 || "" })),
    車両: ((cars && cars.車両) || []).filter(x => x && x.車両名).map(x => ({ 車両名: x.車両名, 車番: x.車番 || x.登録番号 || "" })) };
  if (DEMO && !S.M.機械.length) S.M.機械 = [{ id: "d1", 名前: "バックホウ", 規格: "0.25BH", 分類: "重機" }, { id: "d2", 名前: "バックホウ", 規格: "0.45BH", 分類: "重機" }, { id: "d3", 名前: "ダンプ", 規格: "4t", 分類: "車両" }, { id: "d4", 名前: "ダンプ", 規格: "3t", 分類: "車両" }, { id: "d5", 名前: "電動ブレーカー1", 規格: "", 分類: "小型機械" }, { id: "d6", 名前: "電動ブレーカー2", 規格: "", 分類: "小型機械" }, { id: "d7", 名前: "発電機", 規格: "2K", 分類: "小型機械" }, { id: "d8", 名前: "ランマ1", 規格: "", 分類: "小型機械" }];
  if (DEMO && !S.M.車両.length) S.M.車両 = [{ 車両名: "試しの車（バン）", 車番: "試し 1" }];
  S.people = HX.people(base, fix, ret);
  S.genba = (genba && genba.現場) || [];
  S.kmap = {}; ((kado && kado.機械) || []).forEach(x => x && x.id && (S.kmap[x.id] = x));
  S.yoyaku = (kado && kado.予約) || [];
  if (DEMO && !S.yoyaku.length) { const k = today(); S.M.機械.forEach(x => S.kmap[x.id] = x); S.yoyaku = [{ 機械: "d2", 区分: "昼", 現場: "A現場 配水管", 開始: addDays(k, -2), 終了: addDays(k, 4), 土: true, 日祝: true, 休み: [], 出勤: [] }, { 機械: "d3", 区分: "昼", 現場: "A現場 配水管", 開始: k, 終了: k, 土: true, 日祝: true, 休み: [], 出勤: [] }]; }
  const names = files.map(f => f.name).filter(n => /^現場_.+\.json$/.test(n));
  const got = [];
  for (let i = 0; i < names.length; i += 8) got.push(...await Promise.all(names.slice(i, i + 8).map(n => opt(kst.get(n)))));
  S.sites = got.filter(s => s && s.名前).map(s => ({ 名前: s.名前, 段: s.段 || [], バー: s.バー || [] }));
}
async function start() {
  if ($("ver").textContent.includes("__VER__")) $("ver").textContent = "開発中";
  let kst, mst, kk = null;
  if (DEMO) {
    seedDemo(); kst = HX.demoStore("spn_demo_store2", ""); mst = HX.demoStore("spn_demo_store2", "マスタ/"); S.me = "試し　太郎";
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
