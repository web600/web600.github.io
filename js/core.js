/* ==========================================================================
   core.js — 核心層
   util · EventBus · Store(持久化) · VirtualFS · Icons(SVG sprite)
   載入順序第一，其餘模組皆依賴此檔提供的全域 MAC。
   ========================================================================== */
'use strict';

const MAC = window.MAC = {
  apps: {},          // App 註冊表（由 js/apps/registry.js 填寫）
  ui: {},            // 外殼模組的公開把手（menubar / dock / cc / nc / spotlight）
  version: '1.0.0 (Build 25A101)',
};

/* ------------------------------------------------------------------ util */
const util = MAC.util = {
  $: (sel, root) => (root || document).querySelector(sel),
  $$: (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel)),

  /** 建立元素：el('div', 'cls', 'html') 或 el('div', {cls,html,text,attrs}) */
  el(tag, opts, html) {
    const n = document.createElement(tag);
    if (typeof opts === 'string') opts = { cls: opts, html: html };
    opts = opts || {};
    if (opts.cls) n.className = opts.cls;
    if (opts.text != null) n.textContent = opts.text;
    if (opts.html != null) n.innerHTML = opts.html;
    if (opts.attrs) for (const k in opts.attrs) n.setAttribute(k, opts.attrs[k]);
    if (opts.style) n.style.cssText = opts.style;
    if (opts.on) for (const k in opts.on) n.addEventListener(k, opts.on[k]);
    return n;
  },

  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  uid: (p) => (p || 'id') + '-' + Math.random().toString(36).slice(2, 8),

  /** 位元組格式化：1.2 MB */
  bytes(n) {
    if (n == null) return '--';
    if (n < 1024) return n + ' 位元組';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
  },

  pad: (n) => String(n).padStart(2, '0'),
  /** 統一轉成 Date：接受 Date / 時間戳 / 字串（呼叫端不用先轉型） */
  asDate(d) { return d instanceof Date ? d : new Date(d == null ? Date.now() : d); },
  clock(d, secs) {
    d = util.asDate(d);
    const t = util.pad(d.getHours()) + ':' + util.pad(d.getMinutes());
    return secs ? t + ':' + util.pad(d.getSeconds()) : t;
  },
  dateCN(d) {
    d = util.asDate(d);
    const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 週' + w;
  },
  dateFull(d) {
    d = util.asDate(d);
    const w = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'][d.getDay()];
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + w +
      ' ' + util.clock(d) + (d.getSeconds() ? ':' + util.pad(d.getSeconds()) : '');
  },
  rel(d) {
    const s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return '剛剛';
    if (s < 3600) return Math.floor(s / 60) + ' 分鐘前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小時前';
    if (s < 604800) return Math.floor(s / 86400) + ' 天前';
    const dt = new Date(d);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  },
  /** 取路徑尾端名稱 */
  base: (p) => String(p).replace(/\/+$/, '').split('/').pop() || '/',
  dirname(p) { const s = String(p).replace(/\/+$/, ''); return s.slice(0, s.lastIndexOf('/')) || '/'; },
  joinPath(a, b) { return (a === '/' ? '' : String(a).replace(/\/+$/, '')) + '/' + String(b).replace(/^\/+/, ''); },

  throttle(fn, ms) {
    let last = 0, timer = null, args = null;
    return function () {
      args = arguments;
      const now = Date.now();
      if (now - last >= ms) { last = now; fn.apply(this, args); }
      else if (!timer) {
        timer = setTimeout(() => { timer = null; last = Date.now(); fn.apply(this, args); }, ms - (now - last));
      }
    };
  },
  debounce(fn, ms) {
    let t; return function () { const a = arguments, self = this; clearTimeout(t); t = setTimeout(() => fn.apply(self, a), ms); };
  },
};

/* --------------------------------------------------------------- EventBus */
class EventBus {
  constructor() { this.map = new Map(); this.star = []; }
  on(evt, fn) {
    if (evt === '*') { this.star.push(fn); return () => this.off('*', fn); }
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  once(evt, fn) { const off = this.on(evt, (...a) => { off(); fn(...a); }); return off; }
  off(evt, fn) {
    if (evt === '*') { this.star = this.star.filter((f) => f !== fn); return; }
    const s = this.map.get(evt); if (s) s.delete(fn);
  }
  emit(evt, ...args) {
    const s = this.map.get(evt);
    if (s) s.forEach((fn) => { try { fn(...args); } catch (e) { console.warn('[bus:' + evt + ']', e); } });
    this.star.forEach((fn) => { try { fn(evt, ...args); } catch (e) { console.warn('[bus:*]', e); } });
  }
}
MAC.bus = new EventBus();

/* ----------------------------------------------------------------- Store */
MAC.Store = class Store {
  /** @param {object} defaults 預設狀態 @param {string} key localStorage 鍵名 */
  constructor(defaults, key) {
    this.key = key;
    this.defaults = defaults;
    this.state = Store.clone(defaults);
    this.save = util.throttle(() => this.flush(), 260);
    this.load();
  }

  static clone(o) { return JSON.parse(JSON.stringify(o)); }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this.state = Store.merge(this.state, JSON.parse(raw));
    } catch (e) { console.warn('[store] 讀取失敗，使用預設值', e); }
  }
  flush() {
    try { localStorage.setItem(this.key, JSON.stringify(this.state)); }
    catch (e) { console.warn('[store] 儲存失敗', e); }
  }
  reset() {
    try { localStorage.removeItem(this.key); } catch (e) { /* 忽略 */ }
    this.state = Store.clone(this.defaults || {});
    MAC.bus.emit('state', '*', this.state);
  }

  /** 深層合併（物件逐鍵遞迴，其餘覆寫） */
  static merge(base, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
    const out = Object.assign({}, base || {});
    for (const k in patch) {
      const v = patch[k];
      out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k]))
        ? Store.merge(base[k], v) : v;
    }
    return out;
  }

  get(path, fallback) {
    if (path == null) return this.state;
    const parts = String(path).split('.');
    let cur = this.state;
    for (const p of parts) { if (cur == null) return fallback; cur = cur[p]; }
    return cur === undefined ? fallback : cur;
  }

  set(path, value, opts) {
    const parts = String(path).split('.');
    let cur = this.state;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    const before = cur[leaf];
    if (before === value) return value;
    cur[leaf] = value;
    if (!(opts && opts.silent)) {
      MAC.bus.emit('state:' + path, value, before);
      MAC.bus.emit('state', path, value, before);
    }
    if (!(opts && opts.nopersist)) this.save();
    return value;
  }

  /** 就地更新陣列／物件後廣播（維持參考，避免整份複製） */
  patch(path, fn) {
    const cur = this.get(path);
    fn(cur);
    MAC.bus.emit('state:' + path, cur);
    MAC.bus.emit('state', path, cur);
    this.save();
    return cur;
  }

  toggle(path) { return this.set(path, !this.get(path)); }

  notify(app, title, body, icon) {
    const n = { id: util.uid('n'), app: app, title: title, body: body, icon: icon || app, time: Date.now(), unread: true };
    this.patch('notifications', (arr) => { arr.unshift(n); if (arr.length > 40) arr.length = 40; });
    MAC.bus.emit('notify', n);
    return n;
  }
};

/* ------------------------------------------------ 預設狀態 + 實例（延後建立） */
MAC.defaults = {
  booted: false,
  appearance: 'dark',            // light | dark | auto
  accent: '#0a84ff',
  wallpaper: 'aurora',
  volume: 0.62,
  brightness: 0.98,
  muted: false,
  wifi: true,
  bluetooth: true,
  airdrop: false,
  dnd: false,
  stageManager: false,
  night: false,
  dock: { size: 54, magnify: true, magnitude: 1.7, position: 'bottom', autohide: false, showRecents: true },
  menubar: { autohide: false, battery: 92, charging: false, showPercent: true, clockSeconds: false },
  desktop: { stacks: true },
  notes: [
    { id: 'n1', title: '歡迎使用 macOS 模擬器', body: '這是一套以 HTML / CSS / JavaScript 實作的高擬真桌面環境。\n\n· 拖曳視窗標題列可移動視窗，拖到畫面左右邊緣會出現分割預覽\n· Dock 圖示會隨滑鼠距離放大浮動\n· 試著用 ⌘空白鍵 叫出 Spotlight 搜尋\n· 打開「終端機」輸入 help 看看能做什麼', updated: Date.now() - 3600e3 },
    { id: 'n2', title: '設計規範摘要', body: '毛玻璃：backdrop-filter: saturate(190%) blur(34px)\n視窗圓角：11px / 面板：20px\n動態曲線：cubic-bezier(.32,.72,0,1)\n強調色：由 store.accent 即時注入 CSS 變數', updated: Date.now() - 86400e3 },
    { id: 'n3', title: '待辦事項', body: '☐ 驗證視窗縮放把手\n☑ 完成 Dock 放大演算法\n☐ 補上 Safari 分頁拖曳\n☑ 控制中心滑桿連動系統亮度', updated: Date.now() - 172800e3 },
  ],
  notifications: [
    { id: 'x1', app: 'mail', title: '郵件', body: '設計團隊寄來了「第四季視覺規範」草稿。', time: Date.now() - 900e3, unread: true },
    { id: 'x2', app: 'safari', title: 'Safari', body: '「小工具市集」已更新，重新開啟以載入新版面。', time: Date.now() - 5400e3, unread: true },
    { id: 'x3', app: 'notes', title: '備忘錄', body: '你的備忘錄已在 iCloud 完成同步。', time: Date.now() - 86400e3, unread: false },
  ],
  recents: ['finder', 'safari', 'terminal'],
  recentFiles: ['/Users/apple/Documents/產品藍圖.md', '/Users/apple/Downloads/受邀名單.csv'],
};

/* ------------------------------------------------------------ VirtualFS */
class VirtualFS {
  constructor(seed) {
    this.root = { t: 'dir', name: '/', c: {}, mtime: Date.now() };
    this.home = '/Users/apple';
    this.stamp = Date.now() - 86400e3 * 30;   // 種子檔案的遞增時間戳（決定性）
    this._mount(seed);
  }
  _node(name, v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') {
      this.stamp += 37e5;
      return { t: 'file', name: name, kind: 'text', body: v, size: v.length * 3 + 128, mtime: this.stamp };
    }
    if (v.t) { v.name = name; return v; }                     // 已具型別的節點
    const dir = { t: 'dir', name: name, c: {}, mtime: this.stamp };
    for (const k in v) { const n = this._node(k, v[k]); if (n) dir.c[k] = n; }
    return dir;
  }
  _mount(seed) {
    for (const k in seed) {
      const n = this._node(k, seed[k]);
      if (n) this.root.c[k] = n;
    }
  }

  /** 正規化為絕對路徑 */
  norm(p) {
    if (!p || p === '~') p = this.home;
    if (p[0] !== '/') p = util.joinPath(this.home, p);
    const out = [];
    p.split('/').forEach((seg) => {
      if (!seg || seg === '.') return;
      if (seg === '..') out.pop(); else out.push(seg);
    });
    return '/' + out.join('/');
  }
  find(p) {
    const parts = this.norm(p).split('/').filter(Boolean);
    let cur = this.root;
    for (const part of parts) {
      if (!cur || cur.t !== 'dir') return null;
      cur = cur.c[part];
    }
    return cur || null;
  }
  /** 目錄列表（含父層項目） */
  list(p, opts) {
    const node = this.find(p);
    if (!node || node.t !== 'dir') return [];
    const out = Object.keys(node.c).map((k) => {
      const n = node.c[k];
      return { name: k, path: util.joinPath(this.norm(p), k), t: n.t, kind: n.kind || (n.t === 'dir' ? 'folder' : 'file'), app: n.app, size: n.size, mtime: n.mtime, body: n.body, node: n };
    });
    if (!(opts && opts.noSort)) out.sort((a, b) => (a.t === b.t ? a.name.localeCompare(b.name, 'zh-Hant') : a.t === 'dir' ? -1 : 1));
    return out;
  }
  read(p) { const n = this.find(p); return n && n.t === 'file' ? (n.body || '') : null; }
  write(p, text) {
    const dirp = util.dirname(p), name = util.base(p);
    const dir = this.find(dirp);
    if (!dir || dir.t !== 'dir') return false;
    const ex = dir.c[name];
    if (ex && ex.t === 'file') { ex.body = text; ex.size = text.length * 3 + 128; ex.mtime = Date.now(); }
    else dir.c[name] = { t: 'file', name: name, kind: 'text', body: text, size: text.length * 3 + 128, mtime: Date.now() };
    MAC.bus.emit('fs', dirp);
    return true;
  }
  mkdir(p) {
    const dirp = util.dirname(p), name = util.base(p), dir = this.find(dirp);
    if (!dir || dir.t !== 'dir' || dir.c[name]) return false;
    dir.c[name] = { t: 'dir', name: name, c: {}, mtime: Date.now() };
    MAC.bus.emit('fs', dirp);
    return true;
  }
  rm(p) {
    const dirp = util.dirname(p), name = util.base(p), dir = this.find(dirp);
    if (!dir || !dir.c[name]) return false;
    delete dir.c[name];
    MAC.bus.emit('fs', dirp);
    return true;
  }
  /** 深度優先搜尋（Spotlight 用） */
  walk(p, fn, base) {
    const node = this.find(p);
    if (!node) return;
    const rec = (n, path) => {
      if (n.t === 'dir') { for (const k in n.c) rec(n.c[k], util.joinPath(path, k)); }
      else fn({ name: n.name, path: path, node: n, base: base || p });
    };
    rec(node, this.norm(p));
  }
}

/* -------------------------------------------------------- 種子檔案系統 */
const A = (id) => ({ t: 'app', kind: 'app', app: id, size: 4.2e7 });
MAC.fs = new VirtualFS({
  Users: {
    apple: {
      '桌面': {
        '產品藍圖.md': '# 產品藍圖\n\n## Q4 目標\n1. 完成桌面環境 1.0\n2. 視窗管理效能最佳化\n3. 上線 Spotlight 索引\n',
        '報價單.txt': '品項,單價,數量\n設計顧問費,120000,3\n前端實作,98000,6\n',
        '設計稿': { '登入頁 v4.fig': 'figma-binary', 'Dock 動效.fig': 'figma-binary' },
      },
      '文件': {
        '產品藍圖.md': '# 產品藍圖（副本）\n\n完整規格請見桌面版本。\n',
        '履歷.txt': 'Name: Apple User\nRole: Desktop Environment Architect\n',
        '2026 預算.csv': '項目,預算\n研發,2400000\n行銷,800000\n',
        '技術文件': { '視窗管理.md': '# 視窗管理\n\n- 圖層堆疊：單調遞增 z-index\n- 最小化：transform 縮放至 Dock 圖示\n- 分割：拖曳至邊緣 6px 內觸發\n', '狀態管理.md': '# 狀態管理\n\nStore 為單一資料來源，子模組以 bus.on("state:*") 訂閱。\n' },
      },
      '下載項目': {
        '受邀名單.csv': '姓名,公司\n王小明,雲端科技\n陳大文,星際設計\n',
        '安裝說明.txt': '1. 解壓縮\n2. 拖曳至應用程式檔案夾\n3. 首次開啟請允許系統權限\n',
        'macOS-15.4-更新說明.txt': '此更新項目改進了視窗管理與 Dock 放大動畫的效能。\n',
      },
      '圖片': { 'Aurora.png': '[image]', 'Sierra.png': '[image]', 'Dock 動效腳本.txt': '放大曲線：ease-soft 130ms，位移 -26% 兩次彈跳。\n' },
      '音樂': { '夜行電車.m4a': '[audio]', '午夜電台.m4a': '[audio]', 'Aoi Circuit - 輕軌.txt': '專輯：輕軌\n年份：2026\n' },
      '專案': {
        'macos-sim': { 'index.html': '<!doctype html>', 'core.js': '/* core */', 'README.md': '# macOS Sim\n' },
        'luma-os': { 'system.js': '/* state machine */', 'boot.css': '/* boot */' },
      },
    },
  },
  '應用程式': {
    'Finder.app': A('finder'), 'Safari.app': A('safari'), '郵件.app': A('mail'),
    '備忘錄.app': A('notes'), '音樂.app': A('music'), '照片.app': A('photos'),
    '終端機.app': A('terminal'), '計算機.app': A('calculator'), '系統設定.app': A('settings'),
  },
  '系統': { '資源庫': { 'Fonts': { 'SFPro.otf': 'font-binary' }, 'Frameworks': { 'AppKit.dylib': 'binary' } } },
  'Volumes': { 'Macintosh HD': { '系統.txt': 'APFS 容器 · 994.6 GB 可用\n' } },
});

/* --------------------------------------------------------------- Icons */
/* 24×24 線性圖示（stroke 繼承自外層 svg）；f:true 表示填色圖示。 */
const GLYPHS = {
  apple: { f: true, p: '<path d="M16.6 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.9-1.5-.1-2.8.9-3.5.9s-1.9-.9-3.1-.8c-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.8 2.4 3.1 2.4s1.7-.8 3.2-.8 1.9.8 3.2.8 2.2-1.2 3-2.3c.9-1.3 1.3-2.6 1.3-2.7 0 0-2.5-1-2.5-3.9Z"/><path d="M14.3 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.9-1 2.9 1.1.1 2.2-.5 2.8-1.4Z"/>' },
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.5 15.5 21 21"/>',
  x: '<path d="M6 6 18 18M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M4.5 12.5 9.5 17.5 19.5 7"/>',
  'arrow-left': '<path d="M19.5 12h-15M11 5 4 12l7 7"/>',
  'arrow-right': '<path d="M4.5 12h15M13 5l7 7-7 7"/>',
  'arrow-up': '<path d="M12 19.5v-15M5 11.5l7-7 7 7"/>',
  'arrow-down': '<path d="M12 4.5v15M5 12.5l7 7 7-7"/>',
  'chevron-left': '<path d="M15 4.5 7.5 12 15 19.5"/>',
  'chevron-right': '<path d="M9 4.5 16.5 12 9 19.5"/>',
  'chevron-down': '<path d="M4.5 9 12 16.5 19.5 9"/>',
  'chevron-up': '<path d="M4.5 15 12 7.5 19.5 15"/>',
  'chevrons-left': '<path d="M12.5 5 5.5 12l7 7M19.5 5l-7 7 7 7"/>',
  'chevrons-right': '<path d="M11.5 5 18.5 12l-7 7M4.5 5l7 7-7 7"/>',
  refresh: '<path d="M20.4 11.2a8.4 8.4 0 1 1-2.6-6.4"/><polyline points="20.5 4.2 20.5 9.6 15.1 9.6"/>',
  share: '<path d="M12 3.2v12.3M8 7l4-3.8L16 7"/><path d="M5.2 13v6a2 2 0 0 0 2 2h9.6a2 2 0 0 0 2-2v-6"/>',
  download: '<path d="M12 3.2v12.3M8 11.5l4 4 4-4M5 20h14"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.7"/><rect x="13" y="4" width="7" height="7" rx="1.7"/><rect x="4" y="13" width="7" height="7" rx="1.7"/><rect x="13" y="13" width="7" height="7" rx="1.7"/>',
  list: '<path d="M8.5 6h12M8.5 12h12M8.5 18h12"/><circle cx="4.4" cy="6" r="1.1"/><circle cx="4.4" cy="12" r="1.1"/><circle cx="4.4" cy="18" r="1.1"/>',
  columns: '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.3"/><path d="M10 4.6v14.8M14.6 4.6v14.8"/>',
  sidebar: '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.3"/><path d="M9.6 4.6v14.8"/>',
  'sidebar-right': '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.3"/><path d="M14.4 4.6v14.8"/>',
  sort: '<path d="M4 7h9M4 12h6.5M4 17h4"/><path d="M18 8v9.5M15 14.8l3 3.2 3-3.2"/>',
  gear: '<circle cx="12" cy="12" r="3.3"/><path d="M12 2.6v3.1M12 18.3v3.1M2.6 12h3.1M18.3 12h3.1M5.4 5.4l2.2 2.2M16.4 16.4l2.2 2.2M18.6 5.4l-2.2 2.2M7.6 16.4l-2.2 2.2"/>',
  clock: '<circle cx="12" cy="12" r="8.3"/><path d="M12 7.4V12l3.3 2.1"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3.4v3M16 3.4v3"/>',
  bell: '<path d="M6.6 9.2a5.4 5.4 0 0 1 10.8 0c0 4 1.6 5.3 1.6 5.3H5s1.6-1.3 1.6-5.3Z"/><path d="M10 18.2a2 2 0 0 0 4 0"/>',
  moon: '<path d="M20.2 14.4A8.6 8.6 0 0 1 9.6 3.8 8.6 8.6 0 1 0 20.2 14.4Z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.9 1.9M16.7 16.7l1.9 1.9M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9"/>',
  volume: '<path d="M11 5 6.6 8.6H3.2v6.8h3.4L11 19Z"/><path d="M14.6 9.6a3.4 3.4 0 0 1 0 4.8M17.2 7a7 7 0 0 1 0 10"/>',
  'volume-mute': '<path d="M11 5 6.6 8.6H3.2v6.8h3.4L11 19Z"/><path d="M15.4 10l3.8 3.8M19.2 10l-3.8 3.8"/>',
  wifi: '<path d="M4.4 9.4a11 11 0 0 1 15.2 0"/><path d="M7.4 12.7a7 7 0 0 1 9.2 0"/><path d="M10.3 15.9a3.3 3.3 0 0 1 3.4 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
  bluetooth: '<path d="M12 3.4v17.2M12 3.4 16.6 8 7.4 16.6M12 20.6 16.6 16 7.4 7.4"/>',
  airdrop: '<path d="M12 3.6a8.4 8.4 0 0 1 8.4 8.4"/><path d="M12 20.4A8.4 8.4 0 0 1 3.6 12"/><circle cx="12" cy="12" r="2.8"/><path d="M3.9 9.2A8.4 8.4 0 0 1 6.8 5.3M20.1 14.8a8.4 8.4 0 0 1-2.9 3.9"/>',
  lock: '<rect x="5" y="10.4" width="14" height="9.6" rx="2.7"/><path d="M8.6 10.4V8a3.4 3.4 0 0 1 6.8 0v2.4"/>',
  power: '<path d="M12 3.4v8.2"/><path d="M7.3 6.6a7 7 0 1 0 9.4 0"/>',
  restart: '<path d="M20.2 12a8.2 8.2 0 1 1-3.3-6.6"/><path d="M20.4 4.4v5.4h-5.4"/>',
  eye: '<path d="M2.9 12S6.2 6.6 12 6.6 21.1 12 21.1 12 17.8 17.4 12 17.4 2.9 12 2.9 12Z"/><circle cx="12" cy="12" r="2.9"/>',
  folder: '<path d="M3.5 7.6a2.1 2.1 0 0 1 2.1-2.1h3.1l1.8 2.3h6a2.1 2.1 0 0 1 2.1 2.1v7.5a2.1 2.1 0 0 1-2.1 2.1H5.6a2.1 2.1 0 0 1-2.1-2.1Z"/>',
  'folder-open': '<path d="M3.5 8.2a2.1 2.1 0 0 1 2.1-2.1h3l1.8 2.3h5.6a2.1 2.1 0 0 1 2.1 2.1v1.2"/><path d="M3.6 10.9h16.1a1.7 1.7 0 0 1 1.65 2.1l-1.3 4.6a2.1 2.1 0 0 1-2 1.55H5.7a2.1 2.1 0 0 1-2-1.55L2.4 13a1.7 1.7 0 0 1 1.2-2.1Z"/>',
  doc: '<path d="M6.2 3.5h7l5 5v12H6.2Z"/><path d="M13.2 3.5v5h5"/>',
  'file-text': '<path d="M6.2 3.5h7l5 5v12H6.2Z"/><path d="M13.2 3.5v5h5"/><path d="M9.2 13h6M9.2 16.4h4"/>',
  image: '<rect x="3.4" y="5" width="17.2" height="14" rx="2.5"/><circle cx="9" cy="10.4" r="1.7"/><path d="M4.4 17.6 10 12.4l3.9 3.4 2.6-2 3.1 3"/>',
  music: '<path d="M9 18.2V6.8l10-2.1v11.5"/><circle cx="6.5" cy="18.2" r="2.6"/><circle cx="16.5" cy="16.2" r="2.6"/>',
  play: { f: true, p: '<path d="M8 5.4 18.6 12 8 18.6Z"/>' },
  pause: { f: true, p: '<rect x="7" y="5.4" width="3.4" height="13.2" rx="1.2"/><rect x="13.6" y="5.4" width="3.4" height="13.2" rx="1.2"/>' },
  globe: '<circle cx="12" cy="12" r="8.3"/><path d="M3.7 12h16.6"/><path d="M12 3.7c2.2 2.4 3.4 5.2 3.4 8.3s-1.2 5.9-3.4 8.3c-2.2-2.4-3.4-5.2-3.4-8.3S9.8 6.1 12 3.7Z"/>',
  shield: '<path d="M12 3.4 19 6v6.1c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6Z"/>',
  cloud: '<path d="M7.6 18.6h9a3.9 3.9 0 0 0 .5-7.7 5.4 5.4 0 0 0-10.4-1.3 3.9 3.9 0 0 0 .9 9Z"/>',
  cpu: '<rect x="7.2" y="7.2" width="9.6" height="9.6" rx="2.2"/><path d="M4 10.2h3.2M4 13.8h3.2M16.8 10.2H20M16.8 13.8H20M10.2 4v3.2M13.8 4v3.2M10.2 16.8V20M13.8 16.8V20"/>',
  hdd: '<rect x="3.4" y="6" width="17.2" height="12" rx="2.5"/><path d="M3.4 13.4h17.2"/><circle cx="8" cy="16" r="1" fill="currentColor" stroke="none"/>',
  home: '<path d="M3.8 11.2 12 3.8l8.2 7.4"/><path d="M6.2 10.6V20h11.6v-9.4"/>',
  star: '<path d="M12 4l2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.7 5.4-.7Z"/>',
  tag: '<path d="M4 4h7.6l8.4 8.4-7.2 7.2L4.4 11.6Z"/><circle cx="8.6" cy="8.6" r="1.3"/>',
  trash: '<path d="M5.6 7.6h12.8l-.9 11.1a2.1 2.1 0 0 1-2.1 1.9H8.6a2.1 2.1 0 0 1-2.1-1.9Z"/><path d="M9.6 7.6V5.7a1.7 1.7 0 0 1 1.7-1.7h1.4a1.7 1.7 0 0 1 1.7 1.7v1.9M3.6 7.6h16.8"/>',
  info: '<circle cx="12" cy="12" r="8.3"/><path d="M12 11.2v5.4"/><circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none"/>',
  pencil: '<path d="M4 20h4.3L20 8.3 15.7 4 4 15.7Z"/><path d="M14.3 5.4 18.6 9.7"/>',
  desktop: '<rect x="3.4" y="5" width="17.2" height="12" rx="2.1"/><path d="M8 20h8M12 17v3"/>',
  mail: '<rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2.5"/><path d="M4.4 7.6 12 13.1l7.6-5.5"/>',
  send: '<path d="M3.8 12 20.2 4.4 15.1 20l-3.3-6.4Z"/><path d="M11.8 13.6 20.2 4.4"/>',
  mic: '<rect x="9.5" y="3.4" width="5" height="10" rx="2.5"/><path d="M6.2 11.6a5.8 5.8 0 0 0 11.6 0M12 17.4V21"/>',
  keyboard: '<rect x="2.6" y="7" width="18.8" height="10" rx="2.3"/><path d="M6 10.6h.01M9.6 10.6h.01M13.2 10.6h.01M16.8 10.6h.01M6 13.8h.01M18 13.8h.01M9.2 13.8h5.6"/>',
  sparkle: '<path d="M12 3.4 13.9 9l5.7 2-5.7 2-1.9 5.6L10.1 13 4.4 11l5.7-2Z"/>',
  link: '<path d="M10 13.6a3.6 3.6 0 0 0 5.1 0l2.9-2.9a3.6 3.6 0 0 0-5.1-5.1l-1 1"/><path d="M14 10.4a3.6 3.6 0 0 0-5.1 0l-2.9 2.9a3.6 3.6 0 0 0 5.1 5.1l1-1"/>',
  mirror: '<rect x="2.6" y="4.6" width="18.8" height="12.4" rx="2.3"/><path d="M8.6 20.4h6.8"/>',
  pin: '<path d="M12 3.6c3 0 5.4 2.3 5.4 5.2 0 3.9-5.4 11.6-5.4 11.6S6.6 12.7 6.6 8.8c0-2.9 2.4-5.2 5.4-5.2Z"/><circle cx="12" cy="8.8" r="1.9"/>',
  apps: '<rect x="3.6" y="3.6" width="6.6" height="6.6" rx="2"/><rect x="13.8" y="3.6" width="6.6" height="6.6" rx="2"/><rect x="3.6" y="13.8" width="6.6" height="6.6" rx="2"/><rect x="13.8" y="13.8" width="6.6" height="6.6" rx="2"/>',
  minimize: '<path d="M6 12h12"/>',
  'zoom-out': '<path d="M4.5 8.5V4.5h4M19.5 8.5V4.5h-4"/>',
  sliders: '<path d="M4 7h4.5M12 7h8M4 12h9M16.5 12h3.5M4 17h2.5M10 17h10"/><circle cx="10" cy="7" r="1.6"/><circle cx="14.5" cy="12" r="1.6"/><circle cx="8" cy="17" r="1.6"/>',
  'text-bold': '<path d="M7.5 4.5h5.6a3.8 3.8 0 0 1 0 7.6H7.5Z"/><path d="M7.5 12.1h6.4a3.9 3.9 0 0 1 0 7.4H7.5Z"/>',
  'text-italic': '<path d="M15 4.5H9.5M14.5 19.5H9M14 4.5l-4 15"/>',
  'text-underline': '<path d="M7 4.5v6.8a5 5 0 0 0 10 0V4.5M5.5 20h13"/>',
  'list-bullet': '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.6" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.6" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.6" cy="18" r="1.1" fill="currentColor" stroke="none"/>',
  'text-quote': '<path d="M6 6.5h5v5H6Zm0 0c0-1.6 1.2-3 3-3.4M14 6.5h5v5h-5Zm0 0c0-1.6 1.2-3 3-3.4M6 15.5h5v5H6Zm0 0c0-1.6 1.2-3 3-3.4M14 15.5h5v5h-5Zm0 0c0-1.6 1.2-3 3-3.4"/>',
  sunscreen: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3.4v3M12 17.6v3M3.4 12h3M17.6 12h3M6 6l2.1 2.1M15.9 15.9 18 18M18 6l-2.1 2.1M8.1 15.9 6 18"/>',
  window: '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.4"/><path d="M3.4 9h17.2"/>',
  'split-view': '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.4"/><path d="M12 4.6v14.8"/>',
};

/* 應用程式圖示：48×48 彩色圖示（%%u 會置換為唯一 id，避免漸層衝突） */
const APP_ICONS = {
  finder: '<defs><linearGradient id="fa%%u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4bc7ff"/><stop offset="1" stop-color="#1c8ff0"/></linearGradient><linearGradient id="fb%%u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fa2f7"/><stop offset="1" stop-color="#0b6ed6"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#fa%%u)"/><path d="M24 0h13a11 11 0 0 1 11 11v26a11 11 0 0 1-11 11H24Z" fill="url(#fb%%u)"/><path d="M24 2v44" stroke="#0a5cb0" stroke-opacity=".45" stroke-width="1.2"/><path d="M15.6 15v7.4" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="31.6" cy="18.4" r="2" fill="#fff"/><path d="M16.4 31.6c4.8 4.4 10.6 4.4 15.6 0" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
  safari: '<defs><radialGradient id="sa%%u" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="#4fb8ff"/><stop offset="1" stop-color="#0866e0"/></radialGradient></defs><circle cx="24" cy="24" r="23" fill="url(#sa%%u)"/><circle cx="24" cy="24" r="19.6" fill="#f7f9fb"/><circle cx="24" cy="24" r="19.6" fill="none" stroke="#c6cdd6" stroke-width="1"/><circle cx="24" cy="24" r="16.4" fill="none" stroke="#aeb7c2" stroke-width="3.4" stroke-dasharray="1 4.2" stroke-linecap="round"/><path d="M33.4 14.6 21.6 21.6 14.6 33.4 26.4 26.4Z" fill="#fff"/><path d="M33.4 14.6 21.6 21.6 26.4 26.4Z" fill="#ff3b30"/><circle cx="24" cy="24" r="1.5" fill="#3a3a3c"/>',
  terminal: '<defs><linearGradient id="ta%%u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4f57"/><stop offset="1" stop-color="#22262b"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#ta%%u)"/><rect x="0" y="0" width="48" height="9" rx="11" fill="#6b7079" opacity=".55"/><path d="M11 18.5 17 24l-6 5.5" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 29.5h11" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  notes: '<clipPath id="nc%%u"><rect width="48" height="48" rx="11"/></clipPath><g clip-path="url(#nc%%u)"><rect width="48" height="48" fill="#fff"/><rect width="48" height="13" fill="#ffc93c"/><rect y="10" width="48" height="3" fill="#e6a90f" opacity=".5"/><g fill="#c9ccd2"><rect x="9" y="20" width="30" height="2.4" rx="1.2"/><rect x="9" y="26" width="30" height="2.4" rx="1.2"/><rect x="9" y="32" width="20" height="2.4" rx="1.2"/></g></g><rect width="48" height="48" rx="11" fill="none" stroke="rgba(0,0,0,.12)"/>',
  settings: '<defs><linearGradient id="ga%%u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f3f5"/><stop offset="1" stop-color="#c9ced6"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#ga%%u)"/><circle cx="24" cy="24" r="14.5" fill="none" stroke="#8d939c" stroke-width="7" stroke-dasharray="3 4.6"/><circle cx="24" cy="24" r="10.4" fill="#9aa0a9"/><circle cx="24" cy="24" r="4.6" fill="#eef0f3"/>',
  calculator: '<defs><linearGradient id="ca%%u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c3f45"/><stop offset="1" stop-color="#1e2126"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#ca%%u)"/><rect x="7" y="7" width="34" height="10" rx="3" fill="#5c6169"/><g fill="#8a9099"><rect x="7" y="21" width="7" height="6" rx="2"/><rect x="16" y="21" width="7" height="6" rx="2"/><rect x="25" y="21" width="7" height="6" rx="2"/><rect x="7" y="30" width="7" height="6" rx="2"/><rect x="16" y="30" width="7" height="6" rx="2"/><rect x="25" y="30" width="7" height="6" rx="2"/><rect x="7" y="39" width="16" height="4" rx="2"/></g><rect x="34" y="21" width="7" height="22" rx="3" fill="#ff9f0a"/>',
  trash: '<defs><linearGradient id="ma%%u" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d5dae0"/><stop offset=".5" stop-color="#f2f5f8"/><stop offset="1" stop-color="#c3c9d1"/></linearGradient></defs><rect x="22" y="8" width="4" height="34" rx="2" fill="#aeb5be"/><rect x="7" y="10" width="34" height="5" rx="2.4" fill="url(#ma%%u)" stroke="#9aa1aa" stroke-width=".6"/><rect x="19" y="5" width="10" height="4.6" rx="2" fill="#c9cfd7" stroke="#9aa1aa" stroke-width=".6"/><path d="M11.5 15h25l-2.4 26.4a4 4 0 0 1-4 3.6H17.9a4 4 0 0 1-4-3.6Z" fill="url(#ma%%u)" stroke="#a9b0b9" stroke-width=".6"/>',
  launchpad: '<defs><linearGradient id="la%%u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b5058"/><stop offset="1" stop-color="#23262b"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#la%%u)"/><path d="M24 12c4.4 0 7 3.4 7 8.2 0 5.6-3.2 11.4-5.2 13.6a2.4 2.4 0 0 1-3.6 0C20.2 31.6 17 25.8 17 20.2 17 15.4 19.6 12 24 12Z" fill="#f4f6f8"/><circle cx="24" cy="20.4" r="3.1" fill="#8f97a1"/><path d="M17.4 28.6 13 33.4l4.8-.6ZM30.6 28.6 35 33.4l-4.8-.6Z" fill="#ff9f0a"/>',
  mail: '<defs><linearGradient id="ea%%u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5cc4ff"/><stop offset="1" stop-color="#1a6ff5"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#ea%%u)"/><rect x="7" y="13" width="34" height="22" rx="3.4" fill="#fff"/><path d="M8.4 15.6 24 27.4l15.6-11.8" fill="none" stroke="#3d8ef0" stroke-width="2.2" stroke-linejoin="round"/>',
  music: '<defs><linearGradient id="ua%%u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fc5c7d"/><stop offset="1" stop-color="#e0234e"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#ua%%u)"/><path d="M20 33.4V16.6l15-3.2v16.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><circle cx="16.6" cy="34" r="4.6" fill="#fff"/><circle cx="31.6" cy="31" r="4.6" fill="#fff"/>',
  photos: '<clipPath id="pa%%u"><rect width="48" height="48" rx="11"/></clipPath><g clip-path="url(#pa%%u)"><rect width="48" height="48" fill="#fff"/><g><circle cx="24" cy="14" r="5.2" fill="#ffcc00"/><circle cx="34" cy="24" r="5.2" fill="#ff9500"/><circle cx="24" cy="34" r="5.2" fill="#34c759"/><circle cx="14" cy="24" r="5.2" fill="#007aff"/><circle cx="31.2" cy="16.8" r="4.6" fill="#a2d94a"/><circle cx="31.2" cy="31.2" r="4.6" fill="#30d158"/><circle cx="16.8" cy="31.2" r="4.6" fill="#5ac8fa"/><circle cx="16.8" cy="16.8" r="4.6" fill="#af52de"/><circle cx="24" cy="24" r="5" fill="#ff2d55"/></g></g><rect width="48" height="48" rx="11" fill="none" stroke="rgba(0,0,0,.1)"/>',
  about: '<defs><linearGradient id="ba%%u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e98a6"/><stop offset="1" stop-color="#5b6470"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#ba%%u)"/><rect x="10" y="14" width="28" height="20" rx="3" fill="#e8ecf1"/><rect x="13" y="17" width="22" height="14" rx="2" fill="#2b3038"/><path d="M16 26l4-5 3.4 4.2L26 22l5 6" stroke="#7fd7a0" stroke-width="1.6" fill="none"/>',
  textedit: '<clipPath id="xa%%u"><rect width="48" height="48" rx="11"/></clipPath><g clip-path="url(#xa%%u)"><rect width="48" height="48" fill="#fdfdfd"/><g fill="#b9bec6"><rect x="9" y="14" width="30" height="2.2" rx="1.1"/><rect x="9" y="20" width="30" height="2.2" rx="1.1"/><rect x="9" y="26" width="24" height="2.2" rx="1.1"/><rect x="9" y="32" width="18" height="2.2" rx="1.1"/></g><path d="M30 30l12-12 4 4-12 12-5 1z" fill="#ff9f0a" transform="translate(-4 4) scale(.75)"/></g><rect width="48" height="48" rx="11" fill="none" stroke="rgba(0,0,0,.12)"/>',
};

let iconSeq = 0;
MAC.icons = {
  glyphs: GLYPHS,
  apps: APP_ICONS,
  /** 產生 sprite（symbol 供 <use> 參照，減少 DOM 重複） */
  mountSprite() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.id = 'sprite';
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    for (const name in GLYPHS) {
      const g = GLYPHS[name];
      const sym = document.createElementNS(NS, 'symbol');
      sym.id = 'i-' + name;
      sym.setAttribute('viewBox', '0 0 24 24');
      sym.innerHTML = typeof g === 'string' ? g : g.p;
      svg.appendChild(sym);
    }
    document.body.appendChild(svg);
    this.sprite = svg;
  },
  has(name) { return !!(GLYPHS[name] || APP_ICONS[name]); },
  /** 線性圖示：icon('wifi', {sw:1.8, cls:'x'}) */
  icon(name, o) {
    o = o || {};
    if (!GLYPHS[name]) return '';
    const g = GLYPHS[name];
    const fill = g && g.f;
    return '<svg class="' + (o.cls || 'ic') + '" viewBox="0 0 24 24" aria-hidden="true"' +
      ' fill="' + (fill ? 'currentColor' : 'none') + '" stroke="' + (fill ? 'none' : 'currentColor') + '"' +
      ' stroke-width="' + (o.sw || 1.6) + '" stroke-linecap="round" stroke-linejoin="round">' +
      '<use href="#i-' + name + '"/></svg>';
  },
  /** 應用程式圖示：appIcon('safari', 64) → svg 字串 */
  appIcon(id, o) {
    o = o || {};
    const raw = APP_ICONS[id] || APP_ICONS.about;
    const uid = 'u' + (++iconSeq);
    const body = raw.split('%%u').join(uid);
    return '<svg viewBox="0 0 48 48" aria-hidden="true" class="' + (o.cls || '') + '"' +
      (o.size ? ' width="' + o.size + '" height="' + o.size + '"' : '') + '>' + body + '</svg>';
  },
  /** 依檔案類型給圖示（Finder / Spotlight 共用） */
  fileIcon(it) {
    if (it.t === 'dir') return { svg: this.icon('folder', { sw: 1.5 }), cls: 'fic dir', color: '#4aa3ff' };
    if (it.kind === 'app') return { svg: this.appIcon(it.app), cls: 'fic app', color: '' };
    const byName = { text: 'file-text', image: 'image', audio: 'music', doc: 'doc' };
    let kind = 'doc';
    if (it.kind === 'text' || /\.(md|txt|csv|js|css|html|json|fig)$/i.test(it.name)) kind = byName.text;
    if (/\.(png|jpe?g|svg|heic|gif)$/i.test(it.name)) kind = byName.image;
    if (/\.(m4a|mp3|wav|aac)$/i.test(it.name)) kind = byName.audio;
    const color = { 'file-text': '#8f98a4', image: '#7bc6ff', music: '#ff6b8a', doc: '#a8b0bb' }[kind];
    return { svg: this.icon(kind, { sw: 1.5 }), cls: 'fic ' + kind, color: color };
  },
};

MAC.util = util;
MAC.icon = (n, o) => MAC.icons.icon(n, o);
MAC.appIcon = (n, o) => MAC.icons.appIcon(n, o);
