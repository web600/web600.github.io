# macOS 桌面環境模擬器 (macOS Desktop Environment Simulator)

一套以 **HTML / CSS / JavaScript** 實作的高擬真 macOS 桌面環境。零建置步驟、零外部相依、
可離線執行：在瀏覽器中完成「開機 → 登入 → 多視窗多工 → 關機」的完整流程，
包含可互動的選單列、控制中心、通知中心、Spotlight 與會放大浮動的 Dock。

> 設計藍圖（元件樹、狀態模型、事件契約、擴充指南）請見 **[ARCHITECTURE.md](ARCHITECTURE.md)**。

---

## 快速開始

```bash
https://ryan133692.github.io/index.html(可以進去此系統測試版的網頁網址)
```

首次進入桌面會自動開啟一個 Finder 視窗，並送出一則歡迎通知。

---

## 功能總覽

### 1. 系統外殼（System Shell）

| 元件 | 實作內容 |
| --- | --- |
| **選單列** | 蘋果選單（關於這台 Mac／系統設定／最近使用的項目／睡眠／重新啟動／關機／鎖定）、**依前景應用程式動態切換的選單**（勾選狀態、快捷鍵標示、分隔線、停用項目）、右側狀態區（Wi-Fi、藍牙、電池百分比＋圖示、Spotlight、控制中心、日期時間） |
| **Dock** | 11 個圖示（含 Launchpad 與垃圾桶）、**依滑鼠距離平滑衰減的放大浮動效果**（smoothstep 曲線）、執行指示點、啟動彈跳動畫、右鍵選單（顯示／新增視窗／結束）、可在左／下／右三側、可自動隱藏 |
| **控制中心** | Wi-Fi／藍牙／AirDrop／幕前調度開關、螢幕鏡像、**亮度滑桿（以覆蓋層實際作用）**、音量滑桿（含 HUD）、勿擾／夜覽、鎖定畫面 |
| **通知中心** | 從右側滑入；當月**真實日曆**（今日高亮）、天氣、螢幕使用時間柱狀圖；通知卡片可點擊開啟對應 App 或逐則清除 |
| **Spotlight** | `⌘空白鍵`；同時搜尋**應用程式／檔案（走虛擬檔案系統）／系統指令／即時計算**（內建遞迴下降解析器，非 `eval`），↑↓ 選擇、⏎ 執行 |
| **⌘Tab 切換器** | 玻璃面板列出最近使用的 App，按住 ⌘ 連按 Tab 循環、放開即切換 |
| **Launchpad** | 全螢幕模糊覆蓋層、可搜尋的 App 網格 |
| **開機／登入／鎖定／關機／重新啟動** | 完整狀態機：Apple 標誌＋進度條 → 登入畫面（可略過、密碼錯誤會抖動、解鎖狀態保留視窗） → 桌面；關機後按任意鍵可再次開機 |
| **系統級對話框 / HUD / Toast** | 可主題化的輸入框（Finder 重新命名用）、音量／亮度 HUD、通知橫幅 |

### 2. 視窗管理（WindowManager）

* **拖曳移動**：標題列拖曳，位移量精確等於指標位移（已處理裝置縮放座標換算）
* **八向縮放**：8 個把手，含最小尺寸限制與工作區邊界夾制
* **最大化（縮放）**：綠燈＝最佳大小切換，`⌥`＋綠燈＝全螢幕（選單列滑出）
* **最小化**：以 `transform` 動態計算終點，**縮進 Dock 對應圖示**；點 Dock 圖示還原
* **圖層堆疊**：點擊任何位置即置頂；非焦點視窗自動變灰（交通燈轉灰、陰影減弱）
* **邊緣吸附分割**：拖到左／右緣顯示半透明預覽，放開即並排；拖到頂端＝全螢幕；
  從最大化狀態拖出時會還原成指標下的原尺寸（與 macOS 一致）
* **視窗右鍵選單**：縮到最小／縮放／全螢幕／移到左半邊／右半邊／關閉
* 開窗動畫由 Dock 圖示位置長出；關窗、縮放、吸附皆有對應過場

### 3. 內建應用程式（10 個）

| App | 亮點 |
| --- | --- |
| **Finder** | 側邊欄（常用項目／iCloud／位置／標籤）、上一頁／下一頁、**圖示／列表／直欄三種檢視**、排序（名稱／日期／大小）、搜尋、路徑麵包屑、狀態列；**與虛擬檔案系統完全連動** |
| **Safari** | 真分頁（新增／切換／關閉）、整合網址列（輸入網址或關鍵字皆可）、上一頁／下一頁／重新載入、書籤側邊欄、**7 種以模板即時生成的示範網站**（Apple 開發者、MDN、天氣、股市、商店、設計週報、搜尋結果） |
| **終端機** | 真正可用的虛擬 shell：`ls / cd / pwd / cat / mkdir / touch / rm / tree / find / open / echo / which / history / df / uname / sw_vers / neofetch / notify / theme / wallpaper / accent / volume / brightness / say / curl / sudo`；支援**引號詞法分析、Tab 補齊、↑↓ 歷史、`&&` 串接**；`theme dark` 之類的指令會**即時改變整個系統** |
| **備忘錄** | 搜尋、新增／刪除、標題＋內文編輯、粗體／斜體／底線／清單、字數統計、**自動存檔（debounce 400ms）並持久化** |
| **系統設定** | 七個面板：外觀（淺色／深色／自動＋8 種強調色）、桌面圖片（4 張桌布即時套用）、桌面與 Dock（大小／放大／倍率／位置／自動隱藏）、控制中心、電池、隱私權、一般；**與控制中心共用同一份狀態，雙向即時同步** |
| **郵件** | 三欄式（信箱／清單／內文）、未讀標記、點擊閱讀、回覆 |
| **音樂** | 專輯封面漸層、播放／暫停／上下首、**每秒前進的進度條**、音量滑桿連動系統音量、可點的播放清單 |
| **照片** | 相簿側邊欄、18 張程序化生成的縮圖、**點擊開啟放大檢視（Esc 關閉）** |
| **計算機** | 完整狀態機（累計值／待運算子／百分比／±），支援鍵盤輸入 |
| **文字編輯** | 開啟／編輯／儲存檔案（`⌘S` 寫回虛擬檔案系統），由 Finder 雙擊文字檔呼叫 |
| **關於這台 Mac** | 規格表、可跳轉系統設定 |

---

## 手勢與快捷鍵

| 操作 | 效果 |
| --- | --- |
| 點選視窗任意處 | 該視窗置頂並取得焦點 |
| 拖曳視窗標題列 | 移動視窗；接近畫面左右緣出現分割預覽 |
| 雙擊標題列 | 縮放（最佳大小 ⇄ 原尺寸） |
| 拖曳視窗邊／角 | 八向縮放 |
| 滑鼠移過 Dock | 圖示依距離放大浮動，移開後平滑縮回 |
| 點 Dock 圖示 | 未開啟＝啟動（彈跳）；已在前景＝縮到最小；在背景＝切換前景 |
| 點選單列右側時間 | 開關通知中心 |
| 點控制中心圖示 | 開關控制中心 |
| `⌘空白鍵` | Spotlight |
| `⌘Tab` | 應用程式切換器（按住 ⌘ 連按循環，放開切換） |
| `⌘W` / `⌘M` / `⌘Q` | 關閉視窗／縮到最小／結束應用程式 |
| `⌘,` | 開啟系統設定 |
| `⌘N` | 依前景 App 新增視窗 |
| `⌃⌘F` 或滑鼠移到畫面頂端 | 進入全螢幕（視窗時）／顯示自動隱藏的選單列 |
| `F11` | 前景視窗切換全螢幕 |
| `Esc` | 關閉目前面板（Spotlight／控制中心／通知中心／Launchpad／選單） |
| 按住 ⌥ 點綠燈 | 全螢幕（而非縮放） |

---

## 專案結構

```
macos/
├── index.html               外殼骨架（只有結構，無邏輯）
├── ARCHITECTURE.md          架構藍圖（階段一交付）
├── README.md                本文件（含部署建議）
├── assets/wallpapers/       4 張程序化 SVG 桌布（aurora / sunset / graphite / mint）
├── css/
│   ├── tokens.css           設計權杖：色票、圓角、陰影、材質、動態曲線
│   ├── base.css             reset、虛擬螢幕縮放、桌布、開機、登入、桌面圖示、HUD
│   ├── shell.css            選單列、下拉選單、Dock、控制中心、通知中心、Spotlight、切換器、共用控制項
│   ├── window.css           視窗外框、交通燈、八向縮放把手、分割預覽
│   └── apps.css             各應用程式樣式
├── js/
│   ├── core.js              事件匯流排、狀態儲存（持久化）、虛擬檔案系統、SVG 圖示集
│   ├── wm.js                視窗管理員
│   ├── shell.js             系統外殼（選單列／Dock／面板／Spotlight／開機登入）
│   ├── main.js              啟動組裝（Composition Root）
│   └── apps/                registry + finder / safari / terminal / notes / settings / media / misc
└── tools/devserver.py       開發用伺服器（停用快取，開發時不會拿到舊檔）
```

載入順序即依賴順序：`core.js → wm.js → apps/registry.js → apps/*.js → shell.js → main.js`

---

## 新增一個應用程式（不改外殼任何一行）

```js
// js/apps/paint.js
MAC.defApp({
  id: 'paint', name: '小畫家', icon: 'paint',
  win: { w: 720, h: 480, min: [480, 320] },
  menus: () => ({ '檔案': [{ label: '儲存', key: '⌘S', action: () => MAC.bus.emit('toast', '已儲存') }] }),
  render(win) {
    const body = MAC.util.el('div', 'paint');
    body.textContent = '在這裡畫畫';
    return body;
  },
});
```

在 `index.html` 加入一行 `<script src="js/apps/paint.js"></script>` 即可 ——
Dock 圖示、Spotlight 搜尋、⌘Tab 切換器、選單列、開窗動畫、最小化、分割吸附全部自動生效。
（圖示需在 `js/core.js` 的 `APP_ICONS` 補一筆，並加進 `MAC.appOrder`。）

---

## 部署建議

### A. 靜態託管（最推薦，零後端）

本專案是純靜態網站，任何靜態主機都能直接服務：

| 平台 | 做法 | 備註 |
| --- | --- | --- |
| **Freebuff Sites** | 直接以 `macos/` 為根目錄發佈靜態資產 | 最省事，附 HTTPS 與預覽環境 |
| **GitHub Pages** | 把 `macos/` 推上 repo → Settings → Pages → 選 root | 免費、適合開源展示 |
| **Cloudflare Pages / Netlify / Vercel** | 連動 Git repo，Build command 留空，Output directory 設 `macos` | 自帶 CDN 與預覽部署 |
| **自架 Nginx / Apache** | 將 `macos/` 複製到網站根目錄 | 建議加上 `.svg/.js/.css` 的 `Cache-Control` |

部署前檢查清單：
1. 路徑必須以 **相對路徑** 提供（本專案全部使用相對路徑，可直接放在子目錄）。
2. 若放在子目錄（例如 `https://example.com/macos/`），`assets/wallpapers/*.svg` 由
   `<style>` 的 `url("assets/... ")` 解析，因此**必須從 index.html 所在的層級存取**，
   亦即網址需指到 `.../macos/index.html`。
3. 建議為靜態資產加上長快取，`index.html` 設 `no-cache`；本機開發則用
   `tools/devserver.py`（已停用快取）。

### B. 打包成真正的桌面應用程式

想要「真的有一個 .app / .exe」，可以用最薄的容器包住這個前端：

* **Tauri**（建議）：`npm create tauri-app` → 把 `macos/` 放進 `dist/`，設定
  `frontendDist: "../macos"`，並在 `tauri.conf.json` 保持
  `decorations: false`（無原生標題列，讓本專案自繪的視窗系統成為唯一 UI）、
  `transparent: true` 可讓毛玻璃延伸到桌面。Windows 上若要更接近 macOS 的模糊效果，
  可改用 `window-vibrancy` 插件。
* **Electron**：`new BrowserWindow({ frame: false, titleBarStyle: 'hidden',
  vibrancy: 'under-window' (macOS), backgroundColor: '#00000000' })`，
  `loadFile('macos/index.html')`。體積較大但相容性最好。
* 兩者都**不需要後端**；狀態存在 `localStorage`，可直接沿用。

### C. PWA（可安裝、可離線）

加入 `manifest.webmanifest`（`display: "standalone"`、192/512 圖示）與一個僅快取
本專案靜態資產的 Service Worker，即可「加到主畫面」並離線啟動。
建議快取清單：`index.html`、`css/*.css`、`js/**/*.js`、`assets/wallpapers/*.svg`。

---

## 效能與相容性

* **材質成本**：`backdrop-filter` 是視覺核心，也是最貴的一步。本專案已做的控制：
  僅在真正變動時才寫入 CSS 變數（避免整份文件重新計算樣式）、Dock 調整大小／位置時
  不重建 DOM、控制中心面板就地同步而非整塊重建、視窗加上 `contain: layout paint`。
  實測在整合式顯示卡上同時開啟 4～5 個視窗仍流暢；若需極致效能，可把
  `css/tokens.css` 的 `--blur-thick` 調小，或使用設定中的「減少透明度」取向。
* **瀏覽器**：Chromium 系（Chrome／Edge／Brave）表現最佳；Firefox 支援
  `backdrop-filter` 但模糊與飽和度略有差異；Safari 需 `-webkit-` 前綴（已補）。
* **縮放**：虛擬螢幕固定為 1512 × 945，以 `transform: scale()` 等比縮放至視窗大小，
  因此版面在任何解析度下都維持 macOS 的正確比例；指標座標會換算回未縮放的裝置座標，
  故手勢與拖曳在任何縮放比例下都精準。
* **計時器節流**：當頁面被瀏覽器判定為「不可見／被遮擋」時，`setTimeout/Interval`
  會被節流為 ≥1 秒，開機進度條與動畫會變慢（行為正確，只是節奏拉長）。
  在正常前景分頁下開機約 2.5 秒完成。
* **無障礙**：主要控制項具備 `aria-label`／`role`，`prefers-reduced-motion` 會關閉過場。

---

## 已知限制（刻意保留的邊界）

1. 這是**桌機環境模擬器**，不是可開機的作業系統映像：沒有核心、沒有真實檔案系統寫入，
   所有檔案操作都發生在記憶體中的虛擬檔案系統（重新整理後回到種子狀態）。
   會被持久化的只有 `localStorage` 內的系統設定、備忘錄與通知。
2. Safari 沒有真實網路連線：所有「網站」都是本地模板即時生成的示範頁面。
3. 應用程式為示範級實作：功能完整、可互動，但不追求與真實 App 100% 的功能對等
   （例如 Finder 沒有真正的拖放搬移檔案、Safari 沒有開發者工具）。
4. 未實作：多螢幕（僅有一個內建顯示器）、iCloud 同步、系統音效、視窗標籤頁、
   真實的 Touch ID。
