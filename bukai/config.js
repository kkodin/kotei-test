// 全体工程表の設定（GitHub に公開される。ここには社員名・メール・共有リンクを書かないこと）
// clientId / tenantId は Entra の「アプリの登録」の概要に出る ID（秘密の値ではない）
// folder は 工程データ フォルダの場所（接続テストの画面で調べて貼る。ID だけで名前は入らない）
window.KOTEI_CONFIG = {
  clientId: "9a4c8447-3e6a-437b-85d0-4662ded35f42",   // アプリケーション (クライアント) ID
  tenantId: "acd238cd-b6aa-4b5a-8056-44ed0177515f",   // ディレクトリ (テナント) ID
  folder: {       // 工程データ フォルダ
    driveId: "TEST_DRIVE_NOT_SET",
    itemId: "TEST_ITEM_NOT_SET"
  }
};
