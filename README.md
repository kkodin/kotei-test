# kotei-test（工事総合管理 テスト公開用）

本番 `kotei` と同じ画面を、本番データに触れずに試すためのリポジトリです。

- 社員が使う本番は `kotei` のまま。ここは試す人だけが使う
- 中身は `kotei` の写し（旧版の nippou・nippou3 は置かない）
- **config.js のデータの置き場所（driveId・itemId）は、本番とは別の値にする。**
  初期状態は `TEST_DRIVE_NOT_SET` / `TEST_ITEM_NOT_SET` で、OneDrive には一切つながらない
- テスト用データは OneDrive 社内共有フォルダの `99_テスト` に置き、その場所だけを config.js に書く
- 本番 `kotei` へ出すときは **config.js を写さない**
