/* 本物の日報へ書く（2026-11-19 ユーザー：スマホ版を本番に出す前に、本物の日報へ書く作り）
   詳細日報（14_常用日報\常用日報Vr000\web の writer.js・app.js）と同じ形で読み書きする：
   ・日報1つ（現場・日）＝ 工程データ\日報\個人_<記入者>_<年月>.json の 日[日].行 の1行。行.書式 ＝ 詳細日報の用紙の中身＋現場id。
     行の 行先・人・外注・機械・作業行 も書式から作る（工事日報の表・一覧にそのまま出る。writer.js の rowOfDay と同じ）。
   ・現場は 工程データ\常用日報\現場_<現場id>.json。現場一覧のコードがあれば 現場id＝"c"＋コード（詳細日報と同じ決まり）。無い現場はここで作る。
   ・同じ現場・同じ日の日報は1つ。だれかが書いていれば、それを開いて直す。
   ・同時に直さないように 常用日報\使用中_<現場id>.json の札（詳細日報と同じ。3分書き直さなければ終わり。交代の頼みにも答える）。
   ・MOVE_FROM（2026-11-01）より前の日は書かない（詳細日報でもその前の日は現場ごとのファイルのまま）。
   データの列（下＝16列・外注・車＝12列・上＝5列）は詳細日報と同じ番号。スマホだけの中身（人ごとの作業内容・機械の区分と分類）は 書式.スマホ に入れる。 */
"use strict";
const MOVE_FROM = "2026-11-01";
const NONAME = "（名前未定）";
const R = { 日報: null, 常用: null, app: null, files: {}, sites: null };
// 詳細日報と同じ名前の比べ方（ファイル名 個人_<名前>_<年月>.json に使うので同じでないといけない）
const pcNk = s => String(s ?? "").normalize("NFKC").replace(/株式会社|\(株\)|有限会社|\(有\)|合同会社|\(同\)/g, "").replace(/[\s　・]/g, "").toLowerCase();
const nowS = () => { const d = new Date(); return keyOf(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); };
const wFileOf = (who, k) => `個人_${pcNk(who)}_${k.slice(0, 7)}.json`;
const lockFile = sid => "使用中_" + sid + ".json";

// 試し（?demo）：詳細日報の試しと同じ置き場（同じアドレスなら、スマホで書いたものが試しの詳細日報に出る）。常用日報の置き場は中身を文字で持つ
function jouyouDemoStore() {
  const KEY = "jouyou_demo_store";
  const all = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  return {
    async list() { return Object.entries(all()).map(([name, x]) => ({ name, eTag: x.eTag })); },
    async get(name) { const x = all()[name]; return x ? { data: JSON.parse(x.data), eTag: x.eTag } : null; },
    async put(name, data, eTag) {
      const a = all(), cur = a[name];
      if (eTag ? (!cur || cur.eTag !== eTag) : cur) throw Object.assign(new Error("保存 " + (eTag ? 412 : 409)), { status: eTag ? 412 : 409 });
      const t = "d" + Date.now() + Math.random().toString(36).slice(2, 6); a[name] = { data: JSON.stringify(data), eTag: t };
      localStorage.setItem(KEY, JSON.stringify(a)); return { eTag: t };
    }
  };
}
function realInit(app) {
  R.app = app || null;
  if (DEMO) { R.日報 = HX.demoStore("nippou_demo_v4", "日報/"); R.常用 = jouyouDemoStore(); }
  else if (app) { R.日報 = HX.store(app, "kotei", "日報"); R.常用 = HX.store(app, "kotei", "常用日報"); }
}
const realOn = () => !!R.日報;

/* ---------- 現場：常用日報の 現場_*.json（名前・略称・コード・定時）。中身はこのスマホに控え、eTag が同じなら読み直さない ---------- */
async function siteFiles(force) {
  if (R.sites && !force) return R.sites;
  const CK = "spn_sitecache_" + (DEMO ? "demo" : "real");
  let c = {}; try { c = JSON.parse(localStorage.getItem(CK)) || {}; } catch (e) { }
  const list = (await R.常用.list()).filter(x => /^現場_.+\.json$/.test(x.name)), out = {};
  for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map(async it => {
    if (c[it.name] && c[it.name].eTag === it.eTag) { out[it.name] = c[it.name]; return; }
    const r = await R.常用.get(it.name).catch(() => null); if (!r || !r.data || !r.data.現場) return;
    const s = r.data.現場;
    out[it.name] = { eTag: r.eTag, id: s.id || it.name.slice(3, -5), 名前: s.名前 || "", 略称: s.略称 || "", コード: s.コード || "", 元請名: r.data.元請名 || "",
      勤務: s.勤務 || "昼", 始業: s.始業 || "", 終業: s.終業 || "", 夜始業: s.夜始業 || "", 夜終業: s.夜終業 || "" };
  }));
  try { localStorage.setItem(CK, JSON.stringify(out)); } catch (e) { }
  return R.sites = Object.values(out);
}
const genbaOf = name => S.genba.find(g => sameSite(g.名前, name) || sameSite(g.正式名, name)) || null;
// 現場名 → 詳細日報の現場。create＝無ければ 現場_<id>.json を作る（保存のときだけ）
async function siteFor(name, create) {
  if (!name) return null;
  const all = await siteFiles(), g = genbaOf(name), code = g && g.コード ? String(g.コード) : "";
  let s = (code && all.find(x => String(x.コード) === code)) || all.find(x => sameSite(x.略称, name) || sameSite(x.名前, name));
  if (s) return s;
  R.pending = R.pending || {};   // まだ作っていない現場（札を取ったときと保存のときで同じ id にする）
  s = R.pending[nk(name)] || (nk(name) === nk("本社") ? { id: "c_honsha", 名前: "本社", 略称: "本社", コード: "", 元請名: "自社" }
    : { id: code ? "c" + code : "s" + uid(), 名前: (g && (g.正式名 || g.名前)) || name, 略称: (g && g.名前) || "", コード: code, 元請名: (g && g.元請) || S.rec.元請 || "" });
  R.pending[nk(name)] = s;
  if (!create) return s;
  delete R.pending[nk(name)];
  // 設定更新は空（詳細日報の端末に同じ現場の決まりがあれば、そちらを残す）
  const doc = { 形式: "常用日報の現場", 版: 1, 元請名: s.元請名 || "（元請なし）", 現場: { id: s.id, 名前: s.名前, 略称: s.略称, コード: s.コード, 日: {}, 消した日: {}, 設定更新: "", 作業員: [], 機材: [] } };
  try { await R.常用.put("現場_" + s.id + ".json", doc, null); } catch (e) { if (e.status !== 409 && e.status !== 412) throw e; }
  all.push(s); return s;
}

/* ---------- 記入者ごとのファイル（その月の全部）を読む。変わったものだけ取り直す ---------- */
async function monthFiles(k) {
  const m = k.slice(0, 7);
  const list = (await R.日報.list()).filter(it => /^個人_.+_\d{4}-\d{2}\.json$/.test(it.name) && it.name.endsWith("_" + m + ".json"));
  for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map(async it => {
    if (R.files[it.name] && R.files[it.name].eTag === it.eTag) return;
    const r = await R.日報.get(it.name).catch(() => null); if (r) R.files[it.name] = { eTag: r.eTag, data: r.data };
  }));
  return list.map(it => it.name).filter(n => R.files[n]);
}
// この現場・この日の日報（いちばん新しいもの）
async function findReport(s, k) {
  const hits = [];
  for (const n of await monthFiles(k)) {
    const dd = ((R.files[n].data || {}).日 || {})[k];
    (dd && dd.行 || []).forEach(row => { if (row && row.書式 && (row.書式.現場id === s.id || (s.コード && row.コード && String(row.コード) === String(s.コード) && !row.書式.現場id))) hits.push({ file: n, row }); });
  }
  hits.sort((a, b) => String(b.row.書式.更新 || "").localeCompare(String(a.row.書式.更新 || "")));
  return hits[0] || null;
}

/* ---------- スマホの日報 ⇔ 詳細日報の用紙（書式） ---------- */
const carFilled = c => ["会社", "名前", "車両名", "所有者", "車番", "燃料", "区間", "金額", "メモ"].some(f => c[f]);
function toShoshiki(r, base) {
  const d = base ? JSON.parse(JSON.stringify(base)) : { 天気: "", 気温: "", 担当者: "", 上: [], 下: [], 車: [], 備考: "", サイン: "", サイン日時: "", 人員手: false, 更新: "", 形態: "" };
  const oldUp = (d.上 || []).filter(x => x && (x[1] || x[4]));
  d.上 = r.作業.filter(w => w.予定 || w.報告).map((w, i) => { const o = oldUp[i] || []; return [o[0] || "", w.予定 || "", o[2] || "", o[3] || "", w.報告 || ""]; });
  const W = r.作業員.filter(w => w.名前), M = r.機械.filter(m => m.使用機材), Z = r.材料.filter(z => z.材料名);
  d.下 = [];
  for (let i = 0, n = Math.max(W.length, M.length, Z.length); i < n; i++) {
    const row = Array(16).fill(""), w = W[i], m = M[i], z = Z[i];
    if (w) { row[0] = w.名前; row[1] = w.始業 || ""; row[2] = w.終業 || ""; row[3] = w.工種 || ""; row[4] = w.残 || ""; row[12] = w.会社 || SELF; row[14] = r.勤務; }
    if (m) { row[5] = m.使用機材; row[6] = [m.種類, m.規格].filter(Boolean).join(" "); row[7] = String(m.数量 || "1"); row[13] = m.所有者 || ""; }
    if (z) { row[9] = z.材料名 + (z.規格 ? " " + z.規格 : ""); row[10] = String(z.数量 || ""); row[15] = String(z.実費 || ""); }
    d.下.push(row);
  }
  d.外注 = [];
  r.外注.forEach(w => {
    const one = nm => { const row = Array(16).fill(""); row[0] = nm; row[1] = w.始業 || ""; row[2] = w.終業 || ""; row[3] = w.工種 || ""; row[4] = w.残 || ""; row[12] = w.会社 || ""; row[14] = r.勤務; return row; };
    if (w.名前) d.外注.push(one(w.名前)); else for (let j = 0; j < (+w.人数 || 1); j++) d.外注.push(one(NONAME));   // 名前未定は人数分の行（集計で人数に数える）
  });
  d.車 = r.車.filter(carFilled).map(c => { const row = Array(12).fill(""); row[2] = c.区間 || ""; row[3] = c.燃料 || ""; row[5] = c.会社 || ""; row[6] = c.名前 || ""; row[7] = c.車両名 || ""; row[8] = c.車番 || ""; row[9] = c.メモ || ""; row[10] = c.所有者 || ""; row[11] = c.金額 || ""; return row; });
  d.天気 = r.天気 || ""; d.気温 = r.気温 || ""; d.担当者 = r.記入者; d.形態 = r.区分 === "常用" ? "常用" : "請負"; d.更新 = nowS(); d.保存先 = "記入者";
  d.頁 = Math.max(1, Math.ceil(d.上.length / 5), Math.ceil(d.下.length / 16), Math.ceil(d.外注.length / 4), Math.ceil(d.車.length / 3));
  d.スマホ = { 勤務: r.勤務, 始業: r.始業, 終業: r.終業,
    内容: Object.fromEntries(r.作業員.concat(r.外注).filter(w => w.名前 && w.内容).map(w => [w.名前, w.内容])),
    機械: M.map(m => ({ 区分: m.区分 || "", 会社: m.会社 || "", 種別: m.種別 || "", 種類: m.種類 || "", 規格: m.規格 || "", 分類: m.分類 || "" })),
    材料: Z.map(z => ({ 分類: z.分類 || "", 材料名: z.材料名, 規格: z.規格 || "", 単位: z.単位 || "" })), 更新: d.更新 };
  return d;
}
function fromShoshiki(b, s, k, file) {
  const x = b.スマホ || {}, r = blank(), dn = (b.下 || []).filter(Boolean);
  r.日付 = k; r.現場 = s.略称 || s.名前; r.元請 = s.元請名 && s.元請名 !== "（元請なし）" ? s.元請名 : "";
  r.記入者 = b.担当者 || ""; r.区分 = b.形態 === "常用" ? "常用" : "請負"; r.天気 = b.天気 || ""; r.気温 = b.気温 || "";
  const sh = x.勤務 || (dn.find(z => z[0] && z[14]) || [])[14] || (s.勤務 === "夜" ? "夜" : "昼");
  const self = dn.find(z => z[0] && pcNk(z[0]) === pcNk(r.記入者)) || dn.find(z => z[0]);
  r.勤務 = sh; r.始業 = x.始業 || (self && self[1]) || TEIJI[sh][0]; r.終業 = x.終業 || (self && self[2]) || TEIJI[sh][1];
  r.作業 = (b.上 || []).filter(z => z && (z[1] || z[4])).map(z => ({ 予定: String(z[1] || ""), 報告: String(z[4] || "") }));
  if (!r.作業.length) r.作業 = [{ 予定: "", 報告: "" }];
  const 内容 = x.内容 || {};
  r.作業員 = dn.filter(z => z[0]).map(z => ({ 会社: z[12] || SELF, 名前: z[0], 昼夜: sh, 始業: z[1] || "", 終業: z[2] || "", 工種: z[3] || "", 残: z[4] || "", 内容: 内容[z[0]] || "" }));
  const xm = x.機械 || [];
  r.機械 = dn.filter(z => z[5]).map((z, i) => {
    const own = z[13] && nk(z[13]) === nk(SELF), e = xm[i];
    const m = { 使用機材: z[5], 種類: "", 規格: z[6] || "", 数量: String(z[7] || "1"), 所有者: z[13] || "", 区分: own ? "自社" : z[13] ? "リース" : "", 会社: own ? "" : z[13] || "", 種別: "", 分類: "" };
    if (e && [e.種類, e.規格].filter(Boolean).join(" ") === (z[6] || "")) Object.assign(m, { 区分: e.区分 || m.区分, 会社: e.会社 || m.会社, 種別: e.種別, 種類: e.種類, 規格: e.規格, 分類: e.分類 });
    m.種別 = m.種別 || catOf({ 名前: z[5], 分類: m.分類 });
    return m;
  });
  const xz = x.材料 || [];
  r.材料 = dn.filter(z => z[9]).map((z, i) => {
    const e = xz[i], m = { 分類: "", 材料名: z[9], 規格: "", 単位: "", 数量: String(z[10] || ""), 実費: String(z[15] || "") };
    if (e && e.材料名 + (e.規格 ? " " + e.規格 : "") === z[9]) Object.assign(m, { 分類: e.分類, 材料名: e.材料名, 規格: e.規格, 単位: e.単位 });
    return m;
  });
  r.外注 = [];
  (b.外注 || []).filter(z => z && z[0]).forEach(z => {
    const last = r.外注[r.外注.length - 1];
    if (z[0] === NONAME) { if (last && !last.名前 && nk(last.会社) === nk(z[12])) { last.人数 = String(+last.人数 + 1); return; } r.外注.push({ 会社: z[12] || "", 名前: "", 人数: "1", 昼夜: sh, 始業: z[1] || "", 終業: z[2] || "", 工種: z[3] || "", 残: z[4] || "" }); return; }
    r.外注.push({ 会社: z[12] || "", 名前: z[0], 昼夜: sh, 始業: z[1] || "", 終業: z[2] || "", 工種: z[3] || "", 残: z[4] || "", 内容: 内容[z[0]] || "" });
  });
  r.車 = (b.車 || []).filter(z => z && z.some(v => v !== "" && v != null)).map(z => ({ 会社: z[5] || "", 名前: z[6] || "", 車両名: z[7] || "", 車番: z[8] || "", メモ: z[9] || "", 所有者: z[10] || "", 燃料: z[3] || "", 区間: z[2] || "", 金額: z[11] || (z[0] === "高速" ? z[4] || "" : "") }));
  r.src = { file, sid: s.id, 更新: b.更新 || "" };
  return r;
}
// 工事日報の行（writer.js の rowOfDay と同じ形）
function rowOf(s, k, d, old) {
  const w = d.担当者, dn = (d.下 || []).filter(Boolean), self = dn.concat(d.外注 || []).find(r => r && r[0] && pcNk(r[0]) === pcNk(w));
  const gai = new Map();
  (d.外注 || []).forEach(r => { if (!r || !r[0]) return; const co = r[12] || "（会社不明）"; if (!gai.has(co)) gai.set(co, { 業者: co, 人数: "0", 名前: [] }); const g = gai.get(co); g.名前.push({ 名前: r[0], 役: /職長/.test(r[3] || "") ? "職長" : "作業員" }); g.人数 = String(g.名前.length); });
  const L = (d.上 || []).filter(r => r && (r[1] || r[4])).map(r => ({ 予定: String(r[1] || ""), 報告: String(r[4] || "") }));
  const hon = s.id === "c_honsha";
  const row = { ...(old || {}), id: (old && old.id) || uid(), 行先: hon ? "本社" : s.略称 || s.名前, コード: hon ? "" : s.コード || "", 始め: self ? self[1] || "" : "", 終わり: self ? self[2] || "" : "", 終日: false,
    区分: (self && self[14]) || (d.スマホ && d.スマホ.勤務) || "昼", 作業行: L.length ? L : [{ 予定: "", 報告: "" }], 作業: L.map(l => l.報告 || l.予定).join("\n"),
    予定: (old && old.予定) || { 人: [], 外注: [], 機械: [] }, 人: dn.filter(r => r[0] && pcNk(r[0]) !== pcNk(w)).map(r => r[0]), 外注: [...gai.values()],
    機械: [...new Set(dn.filter(r => r[5] && !/通勤/.test(r[5])).map(r => r[5] + (r[6] ? " " + r[6] : "")))], 記入者: w, 書式: { ...JSON.parse(JSON.stringify(d)), 現場id: s.id }, 更新: nowS() };
  if (self) delete row.本人; else row.本人 = false;
  delete row.関連現場;
  return row;
}
async function editFile(name, fn, who, k) {
  for (let n = 0; n < 4; n++) {
    const cur = await R.日報.get(name);
    const doc = cur ? cur.data : { 形式: "私の日報", 版: 1, 名前: who || "", アカウント: "", 月: k.slice(0, 7), 日: {} };
    doc.日 = doc.日 || {}; fn(doc); doc.更新 = nowS();
    try { const w = await R.日報.put(name, doc, cur ? cur.eTag : null); R.files[name] = { eTag: w.eTag, data: doc }; return; }
    catch (e) { if ((e.status !== 412 && e.status !== 409) || n === 3) throw e; }   // ほかの人が同じファイルに書いた → 読み直して書き直す
  }
}
// 保存。true＝書いた／false＝やめた。書けないときは Error
async function realSave(r) {
  const k = r.日付;
  if (k < MOVE_FROM) throw new Error(`${jpd(MOVE_FROM)} より前の日は、スマホから本物の日報に書けません（詳細日報で書いてください）`);
  if (!r.記入者) throw new Error("記入者を入れてください");
  const s = await siteFor(r.現場, true);
  const lk = await lockCheck(s.id);
  if (lk.other) throw Object.assign(new Error(`${lk.by.名前}さんが詳細日報でこの現場を開いています（${hm(lk.by.開始)} から）。閉じるまで保存できません`), { locked: true });
  const ex = await findReport(s, k);
  if (ex && (!r.src || r.src.sid !== s.id || r.src.更新 !== (ex.row.書式.更新 || ""))) {
    if (!confirm(`${jpd(k)} ${r.現場} の日報は、${ex.row.書式.担当者 || "だれか"}さんが書いています（${String(ex.row.書式.更新 || "").slice(5, 16)}）。\nスマホの内容で上書きしますか？`)) return false;
  }
  const base = ex ? (() => { const b = { ...ex.row.書式 }; delete b.現場id; return b; })() : null;
  const d = toShoshiki(r, base), target = wFileOf(r.記入者, k);
  await editFile(target, doc => {
    const dd = doc.日[k] = doc.日[k] || { 行: [], 報告: null }, i = dd.行.findIndex(x => x && x.書式 && x.書式.現場id === s.id);
    const row = rowOf(s, k, d, i >= 0 ? dd.行[i] : ex && ex.file === target ? ex.row : null);
    if (i >= 0) dd.行[i] = row; else dd.行.push(row);
    dd.報告 = dd.報告 || { だれ: r.記入者, いつ: "日報スマホ" }; dd.更新 = nowS();
  }, r.記入者, k);
  // 記入者を替えた → 前の人のファイルから外す（同じ現場・同じ日の日報は1つ）
  if (ex && ex.file !== target) await editFile(ex.file, doc => { const dd = doc.日[k]; if (!dd) return; dd.行 = (dd.行 || []).filter(x => !(x && x.書式 && x.書式.現場id === s.id)); if (!dd.行.length) dd.報告 = null; }, "", k);
  r.src = { file: target, sid: s.id, 更新: d.更新 };
  return true;
}

/* ---------- 使用中の札（詳細日報の LOCK と同じ形：{ 名前, 人, 端末, 開始, いつ, 頼み?, 答え? }） ---------- */
const LSTALE = 3 * 60 * 1000;
const LK = { sid: "", mine: false, by: null, ask: null, done: 0, t: null };
let DEV = "";   // この端末の印（app.js より先に読むので、使うときに作る）
const devId0 = () => { if (DEV) return DEV; try { DEV = localStorage.getItem("spn_dev") || ""; if (!DEV) { DEV = "sp" + uid(); localStorage.setItem("spn_dev", DEV); } } catch (e) { DEV = DEV || "sp" + uid(); } return DEV; };
const meKey = () => { const a = R.app && R.app.getActiveAccount && R.app.getActiveAccount(); return a ? String(a.username || a.homeAccountId || "").toLowerCase() : "名前:" + pcNk(S.me || (S.rec && S.rec.記入者)); };
const meName = () => S.me || (S.rec && S.rec.記入者) || "スマホ";
const isMe = by => !!by && (by.端末 === devId0() || (by.人 ? by.人 === meKey() : pcNk(by.名前) === pcNk(meName())));
const hm = t => { const d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
async function lockCheck(sid) {
  if (!realOn() || !sid) return { other: false };
  const r = await R.常用.get(lockFile(sid)).catch(() => null), by = r && r.data;
  return { other: !!(by && !isMe(by) && Date.now() - by.いつ < LSTALE), by, eTag: r && r.eTag };
}
// 現場・日を選んだら札を取る（ほかの人が使っていれば、見るだけの表示）
async function lockTake(sid) {
  if (LK.sid && LK.sid !== sid && LK.mine) lockRelease();
  LK.sid = sid || ""; LK.mine = false; LK.by = null; LK.ask = null;
  if (!realOn() || !sid) { paintLock(); return; }
  try {
    for (let n = 0; n < 2; n++) {
      const c = await lockCheck(sid); if (LK.sid !== sid) return;
      if (c.other) { LK.by = c.by; paintLock(); return; }
      try { await R.常用.put(lockFile(sid), { 名前: meName(), 人: meKey(), 端末: devId0(), 開始: isMe(c.by) ? c.by.開始 : Date.now(), いつ: Date.now() }, c.eTag || null); LK.mine = true; paintLock(); return; }
      catch (e) { if (e.status !== 412 && e.status !== 409) throw e; }
    }
  } catch (e) { console.warn(e); }
  paintLock();
}
async function lockBeat() {
  const sid = LK.sid; if (!sid || !realOn() || document.visibilityState !== "visible") return;
  try {
    const r = await R.常用.get(lockFile(sid)), by = r && r.data;
    if (LK.sid !== sid) return;
    if (!LK.mine) { if (!by || Date.now() - by.いつ >= LSTALE || isMe(by)) return lockTake(sid); LK.by = by; paintLock(); return; }
    if (by && !isMe(by)) { LK.mine = false; LK.by = by; paintLock(); toast(`${by.名前}さんが編集を始めたので、保存できなくなりました`, 6000); return; }
    const q = by && by.頼み && LK.done !== by.頼み.いつ && Date.now() - by.頼み.いつ < LSTALE ? by.頼み : null;   // 詳細日報から交代を頼まれている
    LK.ask = q;
    await R.常用.put(lockFile(sid), { 名前: meName(), 人: meKey(), 端末: devId0(), 開始: by ? by.開始 : Date.now(), いつ: Date.now(), ...(q ? { 頼み: q } : {}), ...(by && by.答え && Date.now() - by.答え.いつ < 60000 ? { 答え: by.答え } : {}) }, r && r.eTag);
    paintLock();
  } catch (e) { console.warn(e); }
}
function lockRelease() {
  const sid = LK.sid; if (!sid || !LK.mine || !realOn()) return;
  LK.mine = false;
  R.常用.get(lockFile(sid)).then(r => { const by = r && r.data; if (by && isMe(by)) return R.常用.put(lockFile(sid), { ...by, いつ: 0 }, r.eTag); }).catch(() => { });   // いつ＝0：使い終わり（詳細日報は3分より前の札を終わりとみる）
}
async function answerSwap(ans) {
  const q = LK.ask, sid = LK.sid; if (!q || !sid) return;
  if (ans === "交代" && S.dirty && confirm("交代する前に、いまの内容を保存しますか？")) { try { await doSave(true); } catch (e) { } }
  for (let n = 0; n < 3; n++) {
    const r = await R.常用.get(lockFile(sid)), by = r && r.data, t = Date.now();
    const base = ans === "交代" ? { 名前: q.名前, 人: q.人, 端末: q.端末, 開始: t, いつ: t } : { 名前: meName(), 人: meKey(), 端末: devId0(), 開始: by && isMe(by) ? by.開始 : t, いつ: t };
    try {
      await R.常用.put(lockFile(sid), { ...base, 答え: { 端末: q.端末, 答: ans, いつ: t } }, r && r.eTag);
      LK.done = q.いつ; LK.ask = null;
      if (ans === "交代") { LK.mine = false; LK.by = base; toast(`${q.名前}さんに交代しました（保存できなくなりました）`, 6000); }
      else toast(`${q.名前}さんに「少し待ってください」と伝えました`, 5000);
      paintLock(); return;
    } catch (e) { if (e.status !== 412 && e.status !== 409) { toast("答えを書けませんでした（電波など）"); return; } }
  }
}
function paintLock() {
  let bar = $("lockBar");
  if (!bar) { bar = document.createElement("div"); bar.id = "lockBar"; bar.className = "lockbar"; $("cur").after(bar); }
  if (LK.ask) { bar.hidden = false; bar.className = "lockbar ask"; bar.innerHTML = `🔔 <b>${esc(LK.ask.名前)}</b>さんが詳細日報で交代を頼んでいます。<button type="button" class="pri small" data-swap="交代">交代する</button><button type="button" class="sub small" data-swap="待って">待ってもらう</button>`; }
  else if (!LK.mine && LK.by && LK.sid) { bar.hidden = false; bar.className = "lockbar"; bar.innerHTML = `👁 <b>${esc(LK.by.名前)}</b>さんが詳細日報でこの現場を開いています（${hm(LK.by.開始)} から）。閉じるまで保存できません。<button type="button" class="sub small" data-relock="1">もう一度確かめる</button>`; }
  else bar.hidden = true;
  bar.onclick = e => { const b = e.target.closest("[data-swap]"); if (b) return answerSwap(b.dataset.swap); if (e.target.closest("[data-relock]")) lockTake(LK.sid); };
}
setInterval(lockBeat, 40 * 1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") lockBeat(); });
window.addEventListener("pagehide", lockRelease);

/* ---------- 現場・日を選んだとき：本物の日報があれば開く・札を取る ---------- */
let pickSeq = 0;
async function afterSitePick() {
  const r = S.rec, seq = ++pickSeq;
  if (!realOn() || !r.現場 || !r.日付) { lockTake(""); return; }
  try {
    const s = await siteFor(r.現場, false); if (seq !== pickSeq) return;
    if (s.始業 && !r.src && !r.作業員.length) { const sh = r.勤務 === "夜" ? "夜" : "昼", st = sh === "夜" ? s.夜始業 : s.始業, en = sh === "夜" ? s.夜終業 : s.終業; if (st && en && (r.始業 !== st || r.終業 !== en)) { r.始業 = st; r.終業 = en; render(); } }   // 現場の定時（詳細日報の決まり）
    lockTake(s.id);
    if (r.日付 < MOVE_FROM) return;
    const ex = await findReport(s, r.日付); if (seq !== pickSeq || !ex) return;
    if (r.src && r.src.sid === s.id && r.src.更新 === (ex.row.書式.更新 || "")) return;   // 開いているものと同じ
    const who = ex.row.書式.担当者 || "だれか", filled = r.作業員.length || r.外注.length || r.機械.length || r.材料.length || r.作業.some(w => w.予定 || w.報告);
    if (filled && !confirm(`${jpd(r.日付)} ${r.現場} の日報は、${who}さんが書いています。\nそれを開きますか？（いまスマホに入れた分は消えます）`)) { toast("開きませんでした。保存するときに上書きするか聞きます", 5000); return; }
    const b = { ...ex.row.書式 }; delete b.現場id;
    const nr = fromShoshiki(b, s, r.日付, ex.file); nr.id = r.id;
    S.rec = nr; S.dirty = false; render();
    toast(`${who}さんの日報を開きました（${String(b.更新 || "").slice(5, 16)} 更新）`, 5000);
  } catch (e) { console.warn(e); toast("本物の日報を読めませんでした：" + e.message, 6000); }
}
