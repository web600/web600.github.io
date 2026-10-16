/* ==========================================================================
   apps/safari.js — Safari 瀏覽器
   分頁、整合網址列（網址／搜尋）、上一頁下一頁、書籤側邊欄，
   內建數個以模板產生的示範網站，輸入任意網址或關鍵字都能得到合理結果。
   ========================================================================== */
'use strict';

(function () {
  const el = MAC.util.el;

  /* 書籤／常用網站（假網站由 renderPage 生成） */
  const BOOKMARKS = [
    { t: 'Apple 開發者', u: 'developer.apple.com/tw', g: 'linear-gradient(140deg,#4ea8ff,#0a63d6)', i: 'cpu' },
    { t: 'MDN Web Docs', u: 'developer.mozilla.org', g: 'linear-gradient(140deg,#6b7bff,#3b3fd8)', i: 'file-text' },
    { t: '設計週報', u: 'designweekly.tw', g: 'linear-gradient(140deg,#ff8db8,#e0338a)', i: 'sparkle' },
    { t: '台灣天氣', u: 'weather.tw/taipei', g: 'linear-gradient(140deg,#63d7ff,#1d86d8)', i: 'cloud' },
    { t: '股市看盤', u: 'market.tw', g: 'linear-gradient(140deg,#54e08a,#0f9c53)', i: 'sort' },
    { t: '線上商店', u: 'store.tw', g: 'linear-gradient(140deg,#ffc46b,#e0751b)', i: 'star' },
  ];

  const NEWS = [
    { h: 'macOS 桌機市佔創新高，設計工具需求同步攀升', s: '產業動態 · 3 小時前', p: '根據最新調查，專業設計與影音工作者對桌面環境的期待已從「能用」轉向「順手」——視窗管理、多工切換與動態材質成為採購關鍵指標。' },
    { h: '前端新標準：CSS color-mix() 讓動態主題變得簡單', s: '技術 · 6 小時前', p: '過去需要 JavaScript 計算的主題色衍生，現在一行 CSS 就能完成。本文示範如何只用一個強調色變數，推導出邊框、淡底與焦點環。' },
    { h: '為什麼毛玻璃仍是桌面 UI 的王者', s: '設計 · 昨天', p: '半透明材質提供層級感，同時保留背景脈絡。關鍵在於模糊半徑、飽和度與邊框高光的三角平衡。' },
    { h: '視窗管理演算法入門：從 z-index 堆疊到分割吸附', s: '工程 · 2 天前', p: '一個穩定的視窗管理員需要處理焦點、圖層、邊界與還原幾何。本文拆解最小可行實作。' },
  ];

  function pageFor(url, query) {
    const clean = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (query) {
      return {
        title: query + ' — 搜尋結果',
        url: 'search?q=' + encodeURIComponent(query),
        html:
          '<h1>搜尋「' + util.esc(query) + '」</h1>' +
          '<p>找到約 ' + (1200 + query.length * 37) + ' 筆結果（0.0' + (20 + query.length) + ' 秒）</p>' +
          '<div class="sf-hero"><h2 style="margin-top:0">' + util.esc(query) + ' — 官方說明文件</h2>' +
          '<p>完整的 API 參考、範例與最佳實務，適合第一次接觸的開發者。</p>' +
          '<a href="#" data-link="docs">developer.mozilla.org › ' + util.esc(query.replace(/\s+/g, '-').toLowerCase()) + '</a></div>' +
          NEWS.slice(0, 3).map((n) => '<div style="margin:18px 0"><h2 style="margin:0 0 4px">' + util.esc(n.h) + '</h2><p style="margin:0">' + util.esc(n.p) + '</p></div>').join('') +
          '<p style="margin-top:22px"><a href="#" data-link="news">更多關於「' + util.esc(query) + '」的新聞 ›</a></p>',
      };
    }
    if (/developer\.apple|apple\.com/.test(clean)) {
      return {
        title: 'Apple 開發者', url: clean,
        html: '<h1>Apple 開發者</h1><p>為 macOS、iOS 與網頁打造出色的體驗。</p>' +
          '<div class="sf-hero"><h2 style="margin-top:0">Human Interface Guidelines</h2><p>材質、動態與排版的一致性是平台體驗的基礎。以下是桌面環境的關鍵尺寸：</p>' +
          '<pre class="sf-src">視窗圓角      11px\n面板圓角      20px\n控制項圓角     6px\n標題列高度    38px\n選單列高度    26px</pre></div>' +
          '<h2>本週焦點</h2><p>新的視窗 API 讓分割顯示與標籤視窗的實作更簡單，同時保持鍵盤操作的完整性。</p>',
      };
    }
    if (/developer\.mozilla|mdn/.test(clean)) {
      return {
        title: 'MDN Web Docs', url: clean,
        html: '<h1>backdrop-filter</h1><p><code>backdrop-filter</code> 屬性可對元素「背後」的內容套用圖形效果，例如模糊或飽和度調整。</p>' +
          '<h2>語法</h2><pre class="sf-src">.glass {\n  backdrop-filter: saturate(190%) blur(34px);\n  background: rgba(38, 38, 42, .72);\n}</pre>' +
          '<h2>相容性</h2><p>主流瀏覽器皆支援；效能敏感場合建議限制模糊半徑並加上 <code>contain: paint</code>。</p>',
      };
    }
    if (/weather/.test(clean)) {
      const days = ['今天', '週四', '週五', '週六', '週日'];
      return {
        title: '台灣天氣 — 台北', url: clean,
        html: '<h1>台北市</h1><p>多雲時晴，體感 26°C ・濕度 68% ・紫外線中等</p>' +
          '<div class="sf-hero" style="display:flex;align-items:center;gap:20px">' + MAC.icon('cloud', { sw: 1.2, cls: 'x' }).replace('<svg', '<svg style="width:64px;height:64px"') +
          '<div><div style="font-size:40px;font-weight:300">26°</div><div style="color:var(--text-2)">多雲時晴</div></div></div>' +
          '<h2>一週預報</h2>' + days.map((d, i) => '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--line)"><b>' + d + '</b><span>' + (24 + i) + '° / ' + (18 + i) + '°</span></div>').join(''),
      };
    }
    if (/market|stock/.test(clean)) {
      const rows = [['台積電', '1,085', '+2.35%'], ['鴻海', '196.5', '+0.77%'], ['聯發科', '1,420', '-0.35%'], ['大盤指數', '23,410', '+1.12%']];
      return {
        title: '股市看盤', url: clean,
        html: '<h1>市場總覽</h1><p>2026-10-15 13:30 收盤</p>' +
          rows.map((r) => '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:.5px solid var(--line)"><b>' + r[0] + '</b><span>' + r[1] + '</span><span style="color:' + (r[2][0] === '+' ? '#32d74b' : '#ff5f57') + '">' + r[2] + '</span></div>').join(''),
      };
    }
    if (/store|shop/.test(clean)) {
      return {
        title: '線上商店', url: clean,
        html: '<h1>本週精選</h1><p>桌面環境相關的周邊與軟體工具。</p>' +
          '<div class="sf-favs">' + ['機械鍵盤', '4K 顯示器', '人體工學椅', '開發者滑鼠', '降噪耳機', '桌燈'].map((n, i) =>
            '<div class="sf-fav"><span style="font-size:34px">' + ['⌨️', '🖥️', '🪑', '🖱️', '🎧', '💡'][i] + '</span><span>' + n + '</span></div>').join('') + '</div>',
      };
    }
    if (/news|週報|設計/.test(clean)) {
      return {
        title: '設計週報', url: clean,
        html: '<h1>設計週報</h1><p>每週精選桌面與行動介面的設計觀察。</p>' +
          NEWS.map((n) => '<div style="margin:22px 0"><h2 style="margin:0 0 4px">' + util.esc(n.h) + '</h2><small style="color:var(--text-3)">' + n.s + '</small><p>' + util.esc(n.p) + '</p></div>').join(''),
      };
    }
    return {
      title: clean || '首頁', url: clean,
      html: '<h1>' + util.esc(clean) + '</h1><p>這是一個示範頁面，由 Safari 模擬器即時生成。</p>' +
        '<div class="sf-hero"><h2 style="margin-top:0">網站已載入</h2><p>在此模擬環境中沒有真實的網路連線，因此任何網址都會產生一份結構完整的示意頁面。</p>' +
        '<a href="#" data-link="docs">前往 MDN 文件</a> · <a href="#" data-link="news">閱讀設計週報</a></div>',
    };
  }

  MAC.defApp({
    id: 'safari', name: 'Safari', icon: 'safari',
    win: { w: 980, h: 640, min: [520, 380], best: [1200, 780] },

    menus(win) {
      const s = win.sf;
      return {
        '檔案': [
          { label: '新增標籤頁', key: '⌘T', action: () => newTab(win) },
          { label: '新增視窗', key: '⌘N', action: () => MAC.openApp('safari', { w: 900, h: 600 }) },
          { sep: true },
          { label: '關閉標籤頁', key: '⌘W', action: () => closeTab(win, s.active) },
          { label: '關閉視窗', key: '⇧⌘W', action: () => MAC.wm.close(win.id) },
        ],
        '編輯': [
          { label: '拷貝網址', key: '⌘C', action: () => MAC.bus.emit('clipboard', s.tabs[s.active].url) },
          { label: '尋找…', key: '⌘F', action: () => focusField(win) },
        ],
        '顯示方式': [
          { label: '顯示書籤列', checked: true, action: () => {} },
          { label: '顯示側邊欄', checked: s.sidebar, action: () => { s.sidebar = !s.sidebar; refreshSide(win); } },
          { sep: true },
          { label: '放大', key: '⌘+', action: () => MAC.bus.emit('toast', '頁面縮放 110%') },
          { label: '縮小', key: '⌘-', action: () => MAC.bus.emit('toast', '頁面縮放 90%') },
        ],
        '瀏覽記錄': [
          { label: '上一頁', key: '⌘[', action: () => nav(win, -1) },
          { label: '下一頁', key: '⌘]', action: () => nav(win, 1) },
          { label: '首頁', key: '⇧⌘H', action: () => load(win, 'start') },
          { sep: true },
          { label: '清除瀏覽記錄…', action: () => { s.tabs[s.active].hist = []; MAC.bus.emit('toast', '已清除瀏覽記錄'); } },
        ],
      };
    },

    render(win) {
      const s = win.sf = {
        tabs: [], active: 0, sidebar: false,
        tab: { title: '起始頁', url: 'start', page: pageFor('start'), hist: ['start'], hi: 0 },
      };
      s.tabs.push(s.tab);

      const wrap = el('div', 'sf');

      const tabsBar = el('div', 'sf-tabs');
      const bar = el('div', 'sf-bar');
      const page = el('div', 'sf-page scroll');
      win.pageEl = page;

      /* 分頁列 */
      const renderTabs = () => {
        tabsBar.innerHTML = '';
        s.tabs.forEach((t, i) => {
          const tab = el('div', { cls: 'sf-tab' + (i === s.active ? ' on' : '') });
          tab.innerHTML = '<span>' + util.esc(t.title || '新標籤頁') + '</span><span class="x">✕</span>';
          tab.addEventListener('click', () => { s.active = i; s.tab = t; showActive(win); });
          tab.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); closeTab(win, i); });
          tabsBar.appendChild(tab);
        });
        const add = el('button', { cls: 'icb', html: MAC.icon('plus'), title: '新增標籤頁' });
        add.addEventListener('click', () => newTab(win));
        tabsBar.appendChild(add);
      };

      /* 網址列 */
      const back = el('button', { cls: 'icb', html: MAC.icon('chevron-left'), title: '上一頁' });
      const fwd = el('button', { cls: 'icb', html: MAC.icon('chevron-right'), title: '下一頁' });
      back.addEventListener('click', () => nav(win, -1));
      fwd.addEventListener('click', () => nav(win, 1));
      const reload = el('button', { cls: 'icb', html: MAC.icon('refresh'), title: '重新載入' });
      reload.addEventListener('click', () => load(win, s.tab.url));
      const sidebarBtn = el('button', { cls: 'icb', html: MAC.icon('sidebar'), title: '側邊欄' });
      sidebarBtn.addEventListener('click', () => { s.sidebar = !s.sidebar; refreshSide(win); });

      const urlBox = el('div', { cls: 'sf-url', html: MAC.icon('lock', { sw: 1.9 }) });
      const field = el('input', { attrs: { type: 'text', spellcheck: 'false', placeholder: '搜尋或輸入網址' } });
      field.addEventListener('focus', () => field.select());
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { submit(win, field.value); field.blur(); }
        if (e.key === 'Escape') { syncField(win); field.blur(); }
      });
      urlBox.appendChild(field);
      win.field = field;

      const share = el('button', { cls: 'icb', html: MAC.icon('share'), title: '分享' });
      share.addEventListener('click', () => MAC.bus.emit('toast', '已拷貝連結 ' + MAC.icon('link')));
      bar.appendChild(back); bar.appendChild(fwd); bar.appendChild(reload);
      bar.appendChild(sidebarBtn); bar.appendChild(urlBox);
      bar.appendChild(share);

      /* 側邊欄（書籤） */
      const side = el('div', 'side');
      side.style.display = 'none';
      win.sideEl = side;
      [['書籤', 'star'], ['閱讀列表', 'list'], ['瀏覽記錄', 'clock'], ['iCloud 標籤頁', 'cloud']].forEach(([n, ic]) => {
        side.appendChild(el('div', { cls: 'it', html: '<span class="ic">' + MAC.icon(ic, { sw: 1.7 }) + '</span><span>' + n + '</span>' }));
      });
      side.appendChild(el('div', { cls: 'grp', text: '常用網站' }));
      BOOKMARKS.forEach((b) => {
        const row = el('div', { cls: 'it', html: '<span class="ic" style="color:var(--accent)">' + MAC.icon('globe', { sw: 1.7 }) + '</span><span>' + b.t + '</span>' });
        row.addEventListener('click', () => load(win, b.u));
        side.appendChild(row);
      });

      const main = el('div', { style: 'flex:1;display:flex;min-width:0' });
      main.appendChild(side);
      main.appendChild(page);

      wrap.appendChild(tabsBar);
      wrap.appendChild(bar);
      wrap.appendChild(main);

      win.refresh = () => renderTabs();
      paint(win, pageFor('start'));      // 起始頁：常用網站 + 閱讀列表 + 隱私權報告
      return wrap;
    },
    onClose(win) { win.sf = null; },
  });

  /* ------------------------------ 行為 ------------------------------ */
  function submit(win, value) {
    value = (value || '').trim();
    if (!value) return;
    if (/^[\w-]+(\.[\w-]+)+/.test(value) || /^https?:/.test(value)) load(win, value);
    else load(win, 'search?q=' + value);
  }
  function load(win, url) {
    const s = win.sf;
    const isSearch = /^search\?q=/.test(url);
    const query = isSearch ? decodeURIComponent(url.replace(/^search\?q=/, '')) : null;
    const pg = url === 'start' ? pageFor('start') : pageFor(url, query);
    const t = s.tabs[s.active];
    t.url = isSearch ? url : (pg.url || url);
    t.title = pg.title;
    t.hist = t.hist.slice(0, t.hi + 1); t.hist.push(url); t.hi = t.hist.length - 1;
    paint(win, pg);
    if (win.refresh) win.refresh();
  }
  function nav(win, dir) {
    const t = win.sf.tabs[win.sf.active];
    const ni = t.hi + dir;
    if (ni < 0 || ni >= t.hist.length) return;
    t.hi = ni;
    const target = t.hist[ni];
    const isSearch = /^search\?q=/.test(target);
    const pg = target === 'start' ? pageFor('start') : pageFor(target, isSearch ? decodeURIComponent(target.replace(/^search\?q=/, '')) : null);
    paint(win, pg);
    if (win.refresh) win.refresh();
  }
  function focusField(win) { if (win.field) win.field.focus(); }
  function newTab(win) {
    const s = win.sf;
    const pg = pageFor('start');
    const t = { title: '起始頁', url: 'start', hist: ['start'], hi: 0 };
    s.tabs.push(t); s.active = s.tabs.length - 1; s.tab = t;
    paint(win, pg);
    if (win.refresh) win.refresh();
    focusField(win);
  }
  function closeTab(win, i) {
    const s = win.sf;
    if (s.tabs.length === 1) { MAC.wm.close(win.id); return; }
    s.tabs.splice(i, 1);
    s.active = Math.max(0, Math.min(s.active, s.tabs.length - 1));
    s.tab = s.tabs[s.active];
    showActive(win);
  }
  function refreshSide(win) {
    if (!win.sideEl) return;
    win.sideEl.style.display = win.sf.sidebar ? '' : 'none';
  }
  /** 只同步網址列文字（不重繪頁面） */
  function syncField(win) {
    const t = win.sf.tabs[win.sf.active];
    if (win.field) win.field.value = (!t.url || t.url === 'start') ? '' : t.url;
  }
  /** 重新顯示目前分頁（用快取的頁面物件，沒有則重新產生） */
  function showActive(win) {
    const s = win.sf, t = s.tabs[s.active];
    if (!t) return;
    const isSearch = /^search\?q=/.test(t.url || '');
    const pg = t.pg || (t.url === 'start' || !t.url
      ? pageFor('start')
      : pageFor(t.url, isSearch ? decodeURIComponent(t.url.replace(/^search\?q=/, '')) : null));
    paint(win, pg);
  }
  function paint(win, pg) {
    const s = win.sf, t = s.tabs[s.active];
    if (!t) return;
    t.page = pg.html;
    t.pg = pg;                                   // 快取頁面物件，切換分頁時可即時還原
    t.title = pg.title;
    win.setTitle(pg.title + ' — Safari');
    if (win.field) win.field.value = (pg.url === 'start' || pg.url === '') ? '' : pg.url;
    if (win.pageEl) {
      win.pageEl.innerHTML = '';
      const doc = el('div', 'sf-doc');
      doc.innerHTML = pg.url === 'start'
        ? '<h1 style="font-size:26px">常用網站</h1>' +
          '<div class="sf-favs">' + BOOKMARKS.map((b, i) => '<div class="sf-fav" data-u="' + b.u + '" data-i="' + i + '">' +
            '<span class="ic" style="width:44px;height:44px;border-radius:11px;background:' + b.g + ';display:grid;place-items:center;color:#fff">' + MAC.icon(b.i, { sw: 1.7 }) + '</span>' +
            '<span>' + b.t + '</span></div>').join('') + '</div>' +
          '<h2>閱讀列表</h2>' +
          '<div class="sf-hero"><h2 style="margin-top:0;font-size:16px">桌面環境的材質語言</h2><p style="margin:0">毛玻璃、圓角與陰影的三角平衡，正是桌面 UI 的靈魂所在。</p></div>' +
          '<h2>隱私權報告</h2><p>已阻擋 <b>' + (12 + new Date().getDate()) + '</b> 個追蹤器，保護你的瀏覽行為。</p>'
        : pg.html;
      win.pageEl.appendChild(doc);

      // 連結與書籤互動
      util.$$('[data-u]', doc).forEach((fav) => fav.addEventListener('click', () => load(win, fav.dataset.u)));
      util.$$('[data-link]', doc).forEach((a) => a.addEventListener('click', (e) => {
        e.preventDefault();
        load(win, a.dataset.link === 'docs' ? 'developer.mozilla.org' : 'designweekly.tw');
      }));
    }
    if (win.refresh) win.refresh();               // 分頁列標題同步
  }
})();
