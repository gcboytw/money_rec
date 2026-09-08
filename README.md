# 📱 PocketLedger 極速記帳

> **純粹、極速、無廣告，且資料 100% 屬於您個人的 Local-First 離線記帳 PWA。**

不用再忍受每次記帳都要看 5 秒廣告、也不用擔心個人財務資料被上傳到不知名公司的伺服器。  
**PocketLedger** 是一款專為追求效率與極簡體驗設計的個人記帳工具——**免下載 App Store、免註冊帳號、打開網頁秒記帳、斷網也能完全正常使用**，並支援將帳目**自動備份到您個人的 Google 雲端硬碟**！

---

## ✨ 核心特色

* ⚡ **極速打開，秒速記帳**：結合自訂計算機鍵盤，算完直接儲存，3 秒內搞定一筆花費。
* 🔒 **100% 隱私與安全**：所有帳目預設完整保存在您的手機本機（IndexedDB），不經過任何第三方伺服器。
* ✈️ **全離線可用（PWA 支援）**：搭高鐵、地下室或搭飛機完全沒訊號？照樣順暢記帳，連網後自動補登備份。
* 📅 **絲滑手勢週曆**：首頁頂部支援 1:1 跟手即時拖曳，左右滑動切換上一週／下一週，操作感媲美 iOS 原生日曆。
* 📊 **視覺化收支報表**：提供月度與年度收支總覽、分類排行、預算達成率，以及精緻的支出佔比圓餅圖。
* 🔁 **固定收支與快捷模板**：自動按月扣房租、領薪水；常用消夜外食一鍵點選快速帶入。
* ☁️ **私有 Google 雲端自動同步**：記完帳背景自動同步到您自己的 Google Drive，換手機一鍵還原無縫接軌。

---

## 📲 如何安裝到手機主畫面（免去 App Store）

PocketLedger 採用先進的 PWA（漸進式網頁應用）技術，不佔手機龐大容量，安裝僅需 5 秒鐘：
網址：https://gcboytw.github.io/money_rec/

### 🍏 iPhone / iPad (iOS Safari)
1. 用 Safari 瀏覽器打開記帳網址。
2. 點擊瀏覽器底部的 **「分享」按鈕**（中間帶有向上箭頭的方框圖示）。
3. 在選單中往下滑，點選 **「加入主畫面」**。
4. 點擊右上角「新增」，桌面就會出現獨立的記帳 App 圖標！打開後即為全螢幕、無瀏覽器網址列的原生 App 體驗。

### 🤖 Android (Chrome)
1. 用 Chrome 瀏覽器打開記帳網址。
2. 點擊右上角 **「選單（三個直點）」**。
3. 點選 **「加到主畫面」** 或 **「安裝應用程式」** 即可。

---

## ☁️ Google Drive 雲端自動備份教學（超詳細教學）

為了保護您的財務隱私，我們**不使用**任何外部公司的伺服器來存您的帳本。  
只要花 **3 分鐘** 建立專屬於您個人的 Google 雲端備份小幫手（Google Apps Script），以後每次記完帳，系統就會默默在背景自動幫您備份到**您自己的 Google 雲端硬碟**！

```text
【你的手機】                          【你自己的 Google 雲端】
  手機記帳 ────────(自動背景上傳)───────>  Google Apps Script (個人中繼站)
                                                 │
                                                 ▼
                                        我的雲端硬碟/PocketLedger/
                                        └── PocketLedger_Backup.json
```

---

### 第一步：取得專屬雲端網址（只需設定一次）

1. 在電腦或手機瀏覽器打開 [Google Apps Script 網站](https://script.google.com/)（請先登入您的 Google 帳號）。
2. 點擊左上角的 **「＋ 新專案」**。
3. 把左上角原本的「未命名專案」改名為 **`PocketLedger 備份助手`**（方便日後辨認）。
4. 將編輯器內原本預設的代碼全部刪除，**完整複製並貼上** 下方的腳本程式碼：

```javascript
/**
 * PocketLedger Google Drive 雲端備份與還原腳本
 */
const FOLDER_NAME = "PocketLedger";
const FILE_NAME = "PocketLedger_Backup.json";

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    
    // 1. 取得或建立專屬資料夾
    let folder;
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(FOLDER_NAME);
    }
    
    // 2. 取得或建立備份檔案 (自動覆蓋更新最新資料)
    let file;
    const files = folder.getFilesByName(FILE_NAME);
    const contentStr = JSON.stringify(postData, null, 2);
    
    if (files.hasNext()) {
      file = files.next();
      file.setContent(contentStr);
    } else {
      file = folder.createFile(FILE_NAME, contentStr, MimeType.PLAIN_TEXT);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Backup synced successfully",
      updatedAt: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    if (!folders.hasNext()) throw new Error("尚未找到備份資料夾");
    const files = folders.next().getFilesByName(FILE_NAME);
    if (!files.hasNext()) throw new Error("尚未找到備份檔案");
    
    const file = files.next();
    return ContentService.createTextOutput(file.getBlob().getDataAsString())
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

5. 點擊右上角藍色的 **「部署」 ➔ 「新增部署作業」**。
6. 點擊左上角齒輪圖示，種類選擇 **「Web 應用程式」**：
   * **說明**：可填寫 `記帳同步`。
   * **執行身分**：選擇 **「我 (您的 Google 帳號)」**。
   * **誰可以存取**：務必選擇 **「所有人 (Anyone)」** *(請放心，只有持有這串網址的您才能上傳資料)*。
7. 點擊 **「部署」**。
   * 若跳出「授權存取權」提示，點選您的 Google 帳號 ➔ 點「進階（Advanced）」 ➔ 點「前往專案（不安全）」（這是 Google 對自建小工具的正常安全提示） ➔ 點「允許」。
8. 部署成功後，畫面會出現一串 **「網頁應用程式網址」**（類似 `https://script.google.com/macros/s/AKfycb.../exec`），點擊 **複製**。

---

### 第二步：在記帳 App 貼上網址並開啟同步

1. 打開 **PocketLedger** 記帳 App。
2. 點擊底部導覽列的 **「備份」** 圖示。
3. 找到 **「☁️ Google Drive 雲端同步」** 區塊：
   * 將剛剛複製的網址貼入 **「專屬同步網址 (Webhook URL)」** 輸入框中。
   * 打開 **「記帳後自動同步」** 開關。
4. 點一下 **「立即上傳備份至雲端」** 按鈕進行首次同步：
   * 頂部會彈出「雲端同步成功」提示！
   * 此時打開您的 Google 雲端硬碟，就會看到一個名為 `PocketLedger` 的新資料夾，裡面躺著您最新的備份檔囉！

---

### 第三步：換新手機或跨裝置時，如何一鍵還原？

當您更換新手機或不小心清除手機快取時，完全不用緊張：
1. 在新手機打開記帳 App，點擊底部 **「備份」**。
2. 貼上您原本的那串 Google Apps Script 網址。
3. 點擊 **「從 Google Drive 雲端還原」**。
4. 所有歷史記帳、自訂分類、帳戶餘額、固定收支排程將會**秒速完整還原**！

---

## 🗂️ 專案檔案結構導覽

如果您想了解或自行部署這套系統，專案檔案配置非常簡潔清晰：

```text
├── index.html          # 主頁面結構與所有互動視窗 (SPA 單頁架構)
├── manifest.json       # iOS / Android PWA 安裝資訊設定
├── sw.js               # Service Worker 離線快取與無縫版本更新引擎
├── css/
│   └── style.css       # 專案自訂樣式、iOS 滾動條與細節微調
├── js/
│   ├── db.js           # 本地資料庫核心 (Dexie.js Schema 與初始預設分類)
│   └── app.js          # App 互動邏輯 (3-Panel 週曆輪播、計算機鍵盤、雲端同步等)
├── asset/              # 本地圖標與分類 SVG 向量圖資 (全離線支援，共 32+ 款)
├── lib/                # 本地第三方函式庫 (Tailwind, Dexie, Chart.js, Lucide, SheetJS)
└── doc/                # 專案規格文件、修改記錄與分析方針
```

---

## 💡 常見問題 (FAQ)

#### Q1：我沒有網路的時候可以記帳嗎？
**完全可以！** PocketLedger 是「本機優先（Local-First）」架構。在完全無網路的環境下，所有記帳、分類切換與報表瀏覽都能順暢運作。當您回到有網路的地方時，系統會自動在您記帳後將資料同步至 Google Drive。

#### Q2：我的資料會不會被別人看見？
**絕對不會。** 所有的資料只存在於「您的手機本機瀏覽器（IndexedDB）」以及「您自己的 Google 雲端硬碟（Google Drive）」。沒有任何外部伺服器或第三方資料庫會經手您的任何一筆帳目。

#### Q3：除了 Google 雲端，我可以直接把資料匯出成 Excel 嗎？
**可以！** 點擊底部「備份」，即可一鍵將所有資料匯出成 **Excel (.xlsx)**、**CSV** 或 **JSON** 格式，方便您在電腦上用 Excel 做更進階的個人理財統計。

---

祝您記帳愉快，財務越來越自由！💰
