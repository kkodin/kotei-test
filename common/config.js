/* 全アプリ共通の設定【テストの置き場 kotei-test のもの。本番へ写さない】（2026-11-16 開発環境の整理：設定は1か所だけ）
   ・テスト（kotei-test）と本番（kotei）で違うのは、このファイルだけ。公開の道具はこのファイルを写さない（それぞれの置き場のものを残す）。
   ・これはテストの値：データはすべて 社内共有フォルダ\99_テスト の下（本番のデータは読まない・書かない）。
   ・下の「昔の名前」は、まだ共通の部品に移っていないアプリが読む形（KOTEI_CONFIG など）を、ここから作るためのもの。 */
window.HX_CONFIG = {
  clientId: "9a4c8447-3e6a-437b-85d0-4662ded35f42",   // アプリケーション (クライアント) ID
  tenantId: "acd238cd-b6aa-4b5a-8056-44ed0177515f",   // ディレクトリ (テナント) ID
  driveId: "b!fW3m73KhV0i7xf8c58hB1ha1ymrf1RZIq3ibCMmfIEMZJwRVBBcZSqMjvDbFdiXW",   // 社内共有フォルダのあるドライブ
  kotei: { itemId: "01NJOWDEQCV6JKGWOI4RG2U3DMX43SQ56D" },   // 99_テスト の 工程データ   // 工程データ フォルダ（日報・詳細日報・マスタもこの下）
  kikai: { itemId: "01NJOWDEUDRFP5TI3LLZFYT6PND6BLN6VQ", path: "社内共有フォルダ/99_テスト/03_自社機械稼働表/稼働データ" },   // 99_テスト の 稼働データ   // 稼働データ フォルダ
  haichi: { path: "社内共有フォルダ/99_テスト/06_配置表/配置表データ", oldPath: "" },   // テストは前の名前の場所（本番）を見ない   // 配置表データ（oldPath＝前の名前の場所。無ければ空）
  weather: { lat: 35.444, lon: 139.638 },
  test: true   // テストの置き場なら true（画面に「テスト」と出す）
};

/* 昔の名前（各アプリの config.js の形） */
(function (c) {
  const f = id => ({ driveId: c.driveId, itemId: id });
  window.KOTEI_CONFIG = { clientId: c.clientId, tenantId: c.tenantId, folder: f(c.kotei.itemId) };
  window.KIKAI_CONFIG = { clientId: c.clientId, tenantId: c.tenantId, folder: { ...f(c.kikai.itemId), path: c.kikai.path } };
  window.JOUYOU_CONFIG = { clientId: c.clientId, tenantId: c.tenantId, kotei: f(c.kotei.itemId), kikai: f(c.kikai.itemId), haichi: { driveId: c.driveId, ...c.haichi } };
  window.NIPPOU_CONFIG = { clientId: c.clientId, tenantId: c.tenantId, kotei: f(c.kotei.itemId), kikai: f(c.kikai.itemId), haichi: { driveId: c.driveId, ...c.haichi }, nippou: null, weather: c.weather };
})(window.HX_CONFIG);
