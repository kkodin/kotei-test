# kotei-test（工事総合管理 テスト公開用）

本番 `kotei` と同じ画面を、本番データに触れずに試すためのリポジトリです。

- 社員が使う本番は `kotei` のまま。ここは試す人だけが使う
- 中身は `kotei` の写し（旧版の nippou・nippou3 は置かない）
- **config.js のデータの置き場所（driveId・itemId）は、本番とは別の値にする。**
  初期状態は `TEST_DRIVE_NOT_SET` / `TEST_ITEM_NOT_SET` で、OneDrive には一切つながらない
- テスト用データは OneDrive 社内共有フォルダの `99_テスト` に置き、その場所だけを config.js に書く
- 本番 `kotei` へ出すときは **config.js を写さない**

## テスト用データの場所（2026-11-15 設定）

setup-test.html で調べた `99_テスト` のフォルダを入れた。本番の場所とは別の itemId。

| 使う所 | テストの場所 |
|---|---|
| 全体工程表・部会資料・日報 Vr004・常用日報 の工程データ | `社内共有フォルダ\99_テスト
_工程\工程データ` |
| 自社機械稼働表・日報・常用日報 の稼働データ | `社内共有フォルダ\99_テスト_自社機械稼働表\稼働データ` |
| 配置表データ（道筋で読む） | `社内共有フォルダ\99_テスト_配置表\配置表データ` |

本番へ出すときに写してはいけない、テスト版だけの変更：
- 各 `config.js`（上の場所）
- `haichi/index.html` の cfg（driveId・path、oldPath は空）
- `jouyou/app.js` の `HAICHI_DIRS`（99_テスト だけを読む）
- `nippou4/config.js` の haichi.oldPath（空）
- `test.html` の最初の場所（99_テスト
_工程）

本番の場所のまま残しているもの（読むだけ・データは変えない）：
- `haichi/index.html` の合言葉方式のデータ（GitHub `haichi-data`）と、LINE で送る閲覧版の URL（本番の kotei/haichi/）
- 自社機械稼働表の Excel 書き戻しは「稼働データ の親フォルダの 第NN期」を見る。99_テスト には 第NN期 が無いので、本番の Excel には書かない
