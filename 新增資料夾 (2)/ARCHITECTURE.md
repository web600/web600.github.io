# macOS 桌面環境模擬器 — 架構設計藍圖 (Architecture Blueprint)

> 階段一交付：元件與狀態管理規劃。
> 目標：一個可在瀏覽器中原生執行、零建置步驟、模組邊界清楚的 macOS 桌面環境模擬器。

---

## 1. 設計原則

| 原則 | 具體做法 |
| --- | --- |
| **單一資料來源 (SSOT)** | 所有會被多個模組共享的狀態（主題、強調色、桌布、Dock、音量、亮度、筆記、通知）全部存在 `MAC.store`，任何模組都只讀狀態、只透過 `store.set()` 寫入。 |
| **事件驅動、禁止互相直接呼叫** | 模組之間只透過 `MAC.bus`（發布/訂閱）溝通。設定 App 不需要知道 Dock 在哪，只要 `store.set('dock.size', 64)`；Dock 訂閱 `state:dock` 自行重繪。 |
| **外殼與應用解耦** | 系統外殼（選單列 / Dock / 控制中心 / Spotlight）永遠只認「App 註冊表」定義的介面（`id / name / icon / render / menus`），不認識任何一個具體 App 的內部實作。新增 App 不需要改動外殼一行程式碼。 |
| **宣告式 App 註冊** | 每個 App 是一份 `MAC.defApp({...})` 宣告；`render(win)` 回傳 DOM 片段即完成一個應用。 |
| **狀態可持久化** | `store` 有 `persist` 白名單，寫入 `localStorage`；重新整理後主題、桌布、Dock 設定、筆記、通知都還在。 |
| **漸進增強** | 沒有 `backdrop-filter` 的環境仍可運作（改為不透明底色），鍵盤操作與 `aria-*` 皆具備。 |

---

## 2. 執行期元件樹 (Runtime Component Tree)

```
<body>
└── #screen ....................... 裝置邊框 + 等比縮放容器（transform: scale）
    ├── #boot ...................... 開機： Apple 標誌 → 進度條
    ├── #login ..................... 登入畫面（頭像 / 密碼 / Touch ID 動畫）
    └── #desktop ................... 桌面根層
        ├── #wallpaper ............. 4 張程序化 SVG 桌布（依 store.wallpaper 抽換）
        ├── #desktopIcons ......... 桌面上可直接雙擊開啟的檔案／磁碟
        ├── #windows .............. 【WindowManager 掛載點】每個視窗一個 .window
        │   └── .window .win[data-id]
        │       ├── .win-bar ...... 交通燈 (close/min/zoom) + 標題 + 拖曳區
        │       ├── .win-body ..... App 的 render() 內容
        │       └── .rz x8 ........ 八向縮放把手
        ├── #snapPreview .......... 拖曳至邊緣時的分割／全螢幕預覽遮罩
        ├── #menubar .............. 左： Apple / App 名稱 / 動態選單；右： 狀態項目
        │   └── #menusDropdown .... 下拉選單（含快捷鍵、勾選、分隔線、子群組）
        ├── #dock ................. 玻璃底板 + App 圖示（放大浮動 + 執行指示點）+ 垃圾桶
        ├── #cc ................... 控制中心（Wi-Fi/藍牙/AirDrop/亮度/音量/深色模式/勿擾）
        ├── #nc ................... 通知中心（小工具：日曆 / 天氣 / 螢幕使用時間 + 通知群組）
        ├── #spotlight ............ 聚光燈搜尋（App / 檔案 / 計算 / 系統指令）
        ├── #switcher ............. ⌘Tab 應用程式切換器
        ├── #dim .................. 亮度／夜覽色彩覆蓋層
        └── #toasts ............... HUD 提示（音量、亮度、剪貼簿…）
```

---

## 3. 模組分層 (Module Layering)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  外殼層 Shell            js/shell.js                                     │
│  MenuBar · Dock · ControlCenter · NotificationCenter · Spotlight ·        │
│  AppSwitcher · Boot/Login · Toast                                        │
│  「只知道註冊表」── 不認識任何 App 內部                                          │
└───────────────▲──────────────────────────────┬───────────────────────────┘
                │ bus.on('app:*')              │ MAC.wm.open(appId)
┌───────────────┴──────────────────────────────▼───────────────────────────┐
│  應用層 Apps             js/apps/*.js                                    │
│  registry.js · finder.js · safari.js · terminal.js · notes.js ·           │
│  settings.js · misc.js (計算機 / 關於這台 Mac)                              │
│  每個 App：宣告 metadata + menus(win) + render(win)                        │
└───────────────▲──────────────────────────────┬───────────────────────────┘
                │ MAC.fs（共用檔案系統）           │ win.bodyEl
┌───────────────┴──────────────────────────────▼───────────────────────────┐
│  視窗管理層 WM           js/wm.js                                        │
│  開窗 / 關窗 / 最小化 / 縮放 / 圖層堆疊 / 拖曳 / 八向縮放 /                │
│  邊緣吸附分割 / 幾何復原 / 焦點廣播                                          │
└───────────────▲──────────────────────────────┬───────────────────────────┘
                │ bus.emit('focus:change')      │ store.set()
┌───────────────┴──────────────────────────────▼───────────────────────────┐
│  核心層 Core             js/core.js                                      │
│  EventBus · Store(+persist) · VirtualFS · Icons(SVG) · util               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 狀態模型 (State Model)

`MAC.store.state` 的完整形狀（也是 `localStorage["macos.state.v1"]` 的內容）：

```js
{
  booted: false,                     // 是否已通過登入畫面
  appearance: 'dark',                // 'light' | 'dark' | 'auto'（auto 依系統時間 07:00–19:00）
  accent: '#0a84ff',                 // 強調色，Material 風格色票之一
  wallpaper: 'aurora',               // aurora | sunset | graphite | mint
  volume: 0.65, brightness: 0.95,    // 0–1，亮度以覆蓋層實際作用
  wifi: true, bluetooth: true, airdrop: false, dnd: false, stageManager: false,
  dock: { size: 54, magnify: true, magnitude: 1.7, position: 'bottom', autohide: false },
  menubar: { autohide: false, battery: 87, showPercent: true, clockSeconds: false },
  notes: [ { id, title, body, updated } ],
  notifications: [ { id, app, title, body, time, unread } ],
  recents: [ 'finder', 'safari', ... ],   // App 使用紀錄（Spotlight / 最近項目）
  recentFiles: [ '/Users/apple/...' ],
  desktopStacks: true,
}
```

**訂閱語意**：`store.set(key, value)` 會

1. 深度合併寫入 → 2. `bus.emit('state:' + key, value)` → 3. `bus.emit('state', key)` → 4. 節流持久化。

所以「設定 App 的滑桿」與「控制中心的亮度滑桿」改的是同一份資料，兩邊畫面會自動同步 —— 這就是商業級桌面環境的狀態一致性。

---

## 5. 事件匯流排 (Event Bus Contract)

| 事件 | 觸發者 | 消費者 | 用途 |
| --- | --- | --- | --- |
| `state:<key>` / `state` | Store | 任意模組 | 狀態變更後重繪（Dock 大小、桌布、強調色…） |
| `app:open` / `app:focus` / `app:close` / `app:minimize` | WM | Dock、選單列、切換器 | 更新執行指示點、選單列 App 名稱、Dock 縮小動畫終點 |
| `window:geometry` | WM | 狀態列、分割預覽 | 視窗移動／縮放中的即時同步 |
| `menubar:set` | Apps | 選單列 | App 要求替換選單列內容（Finder 的「顯示方式」勾選狀態等） |
| `notify` | 任意模組 | 通知中心 + 右上角橫幅 | 推入一則通知（Terminal `notify` 指令、App 完成任務） |
| `toast` | 任意模組 | HUD | 短暫提示（音量、亮度、複製） |
| `spotlight:toggle` / `cc:toggle` / `nc:toggle` | 快捷鍵或點擊 | 對應面板 | 面板開闔（互斥收合由 shell 統一管理） |

---

## 6. WindowManager 契約 (公開 API)

```js
const wm = MAC.wm;
wm.open(appId, { path?, title?, x?, y?, w?, h? })  // → win，同名 singleton 則聚焦既有視窗
wm.close(id)      // 播放縮回動畫 → 移除 → app:close
wm.minimize(id)   // 幾何存入 win.restore，畫面縮往 Dock 圖示 → app:minimize
wm.restore(id)    // 由 Dock 點擊還原
wm.zoom(id)       // 切換 最佳大小 ⇄ 使用者尺寸（Alt 點綠燈 = 全螢幕）
wm.toggleFull(id) // 進入/離開全螢幕（含選單列滑出）
wm.focus(id)      // 圖層置頂 + 廣播焦點（焦點視窗才顯示彩色交通燈）
wm.list()         // 依圖層排序的視窗
```

**圖層演算法**：單調遞增的 `zCounter`，每次 `focus()` 指派 `el.style.zIndex = ++zCounter`；
總數達 10 萬時整批重編號，避免整數溢位。

**手勢幾何**：所有座標一律以「桌面上緣為 0」的工作區座標為單位；視窗狀態機為
`normal → zoom → full`，拖曳時若碰到 `y < 6` 或左右 6px 內則顯示吸附預覽，放開即套用
（左半／右半／全螢幕），帶 200ms 過場。

---

## 7. 檔案結構 (Final Layout)

```
macos/
├── index.html               外殼骨架（僅結構，無邏輯）
├── ARCHITECTURE.md          本文件（階段一交付）
├── README.md                使用說明、手勢表、部署建議（階段三交付）
├── assets/wallpapers/*.svg  4 張程序化桌布（純 SVG，無外部資源）
├── css/
│   ├── tokens.css           設計權杖：色票、圓角、陰影、模糊、動態曲線、字體堆疊
│   ├── base.css             reset、桌面、開機、登入、桌布
│   ├── shell.css            選單列、下拉選單、Dock、控制中心、通知中心、Spotlight、HUD
│   ├── window.css           視窗外框、交通燈、縮放把手、吸附預覽
│   └── apps.css             五個 App 的專屬樣式（Finder/Safari/Terminal/Notes/Settings）
├── js/
│   ├── core.js              EventBus · Store · VirtualFS · Icons · util
│   ├── wm.js                WindowManager
│   ├── shell.js             MenuBar · Dock · ControlCenter · NotificationCenter · Spotlight · Boot
│   ├── main.js              啟動組裝：註冊 App、綁定全域快捷鍵、開機流程
│   └── apps/
│       ├── registry.js      defApp / getApp / listApps（含 Launchpad 這個 overlay 應用）
│       ├── finder.js        檔案總管（與 VirtualFS 連動）
│       ├── safari.js        瀏覽器（分頁、網址列、假網站渲染）
│       ├── terminal.js      終端機（真實可用的指令集，能改系統設定）
│       ├── notes.js         備忘錄（自動存檔）
│       ├── settings.js      系統設定（主題／強調色／桌布／Dock 即時生效）
│       ├── media.js         郵件、音樂、照片
│       └── misc.js          計算機、文字編輯、關於這台 Mac
└── tools/
    ├── devserver.py         開發用靜態伺服器（停用快取）
    └── jscheck.py           無 Node 環境下的語法平衡檢查（沿用 repo 既有工具）
```

載入順序（`index.html` 中的 `<script>` 順序即依賴順序）：

```
core.js → wm.js → apps/registry.js → apps/*.js → shell.js → main.js
```

實際註冊的應用（`MAC.appOrder` 決定 Dock 順序）：

| id | 名稱 | 類型 |
| --- | --- | --- |
| `finder` | Finder（可多視窗） | 視窗 |
| `launchpad` | Launchpad | overlay（全螢幕覆蓋層） |
| `safari` | Safari | 視窗（單例，可開新分頁） |
| `mail` / `notes` / `music` / `photos` / `settings` / `about` | 郵件／備忘錄／音樂／照片／系統設定／關於這台 Mac | 視窗（單例） |
| `terminal` | 終端機（可多視窗） | 視窗 |
| `calculator` | 計算機（可多視窗） | 視窗 |
| `textedit` | 文字編輯（不顯示於 Dock） | 視窗（多開） |

---

## 8. 擴充指南：新增一個 App（四步，不必改外殼）

```js
// js/apps/paint.js
MAC.defApp({
  id: 'paint', name: '小畫家', icon: 'paint',      // icon → MAC.icons 的 SVG 名稱
  win: { w: 720, h: 480, min: [480, 320] },         // 預設與最小尺寸
  menus: () => ({                                    // 動態選單列（可依視窗狀態變化）
    '檔案': [ { label: '儲存', key: '⌘S', action: (win) => MAC.bus.emit('toast', '已儲存') } ],
  }),
  render(win) {                                      // 回傳 DOM，即成為視窗內容
    const body = MAC.util.el('div', 'paint');
    body.textContent = '在這裡畫畫';
    return body;
  },
});
```

在 `index.html` 加上一行 `<script src="js/apps/paint.js"></script>`（放在 `registry.js`
之後、`shell.js` 之前）即完成：Dock 圖示、Spotlight 搜尋、⌘Tab 切換器、選單列、
開窗動畫、最小化、分割吸附全部自動生效。
