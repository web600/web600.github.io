/* ==========================================================================
   shell.js — 系統外殼
   開機 / 登入 · 選單列 · Dock（放大浮動）· 控制中心 · 通知中心 ·
   聚光燈 · ⌘Tab 切換器 · Launchpad · HUD · 右鍵選單 · 桌面圖示
   外殼只認識註冊表（MAC.apps）與狀態（MAC.store），不依賴任何 App 的實作。
   ========================================================================== */
'use strict';

(function () {
  const el = MAC.util.el;
  const $$ = MAC.util.$$;
  const $ = MAC.util.$;
  const S = () => MAC.store;

  const screen = $('#screen');
  const bootEl = $('#boot'), bootFill = $('#bootFill'), bootHint = $('#bootHint');
  const loginEl = $('#login'), loginForm = $('#loginForm'), loginPass = $('#loginPass');
  const desktopEl = $('#desktop');
  const wallEl = $('#wallpaper');
  const menubar = $('#menubar'), mbMenus = $('#mbMenus'), mbRight = $('#mbRight'), mbDrop = $('#mbDrop');
  const dockEl = $('#dock');
  const ccEl = $('#cc'), ncEl = $('#nc'), ncInner = $('#ncInner');
  const spEl = $('#spotlight'), spInput = $('#spInput'), spResults = $('#spResults');
  const swEl = $('#switcher');
  const toastsEl = $('#toasts'), dimEl = $('#dim'), nightEl = $('#night'), ctxEl = $('#ctxMenu'), hudEl = $('#hud');

  const ui = MAC.ui;
  let activeMenu = null, booted = false, overlay = null;

  /* ══════════════════════════ 縮放與狀態套用 ══════════════════════════ */
  function fitScreen() {
    const W = screen.offsetWidth || 1512, H = screen.offsetHeight || 945;
    const scale = Math.min(window.innerWidth / (W + 36), window.innerHeight / (H + 36), 1);
    screen.style.setProperty('--scale', Math.max(0.28, scale).toFixed(4));
    document.documentElement.dataset.fit = scale >= 0.999 ? 'true' : 'false';
  }

  /* 只在值真的變動時才寫入，避免不必要的樣式失效擴散：
     在 :root 上重複寫入自訂屬性會使整份文件的樣式重新計算，
     若每次（例如拖動音量滑桿）都做，整個桌面都會重繪。 */
  const applied = {};
  function setVar(name, value) {
    if (applied[name] === value) return;
    applied[name] = value;
    document.documentElement.style.setProperty(name, value);
  }
  function setStyle(node, prop, value, tag) {
    if (applied[tag] === value) return;
    applied[tag] = value;
    node.style[prop] = value;
  }

  function applyState(key) {
    const s = S();
    // 外觀
    const app = s.get('appearance');
    const resolved = app === 'auto' ? (new Date().getHours() > 7 && new Date().getHours() < 19 ? 'light' : 'dark') : app;
    if (document.documentElement.dataset.theme !== resolved) document.documentElement.dataset.theme = resolved;
    setVar('--accent', s.get('accent'));
    // 桌布
    setStyle(wallEl, 'backgroundImage', 'url("assets/wallpapers/' + s.get('wallpaper') + '.svg")', 'wp');
    const lb = $('#loginBg');
    if (lb) setStyle(lb, 'backgroundImage', 'url("assets/wallpapers/' + s.get('wallpaper') + '.svg")', 'wpLogin');
    // Dock
    setVar('--dock-size', s.get('dock.size') + 'px');
    const dockCls = 'dock ' + s.get('dock.position');
    if (dockEl.className !== dockCls) dockEl.className = dockCls;
    document.body.classList.toggle('dock-hidden', !!s.get('dock.autohide'));
    // 選單列
    document.body.classList.toggle('mb-hidden', !!s.get('menubar.autohide'));
    // 亮度 / 夜覽
    setStyle(dimEl, 'opacity', String((1 - s.get('brightness')) * 0.85), 'dim');
    setStyle(nightEl, 'opacity', s.get('night') ? '1' : '0', 'night');
    // 依變更的鍵重繪對應的 UI 區塊（面板若關閉時其 refresh 會直接返回）
    // Dock 的大小／位置／放大全部由 CSS 變數與 class 驅動，不需重建 DOM：
    // 這裡只更新執行指示點，避免每次調整設定都重新插入 11 個 SVG 圖示。
    if (!key || /^(dock|accent|appearance|wallpaper)/.test(key)) { paintRunning(); resetMagnify(); }
    if (!key || /^(menubar|appearance|wifi|bluetooth|dnd)/.test(key)) refreshRightStatus();
    if (!key) { refreshCC(); refreshNC(); renderMenus(); }
    else if (/^(wifi|bluetooth|airdrop|dnd|night|stageManager|brightness|volume|accent)/.test(key)) refreshCC();
    else if (/^notifications/.test(key)) refreshNC();
  }

  /* ══════════════════════════ HUD / Toast ══════════════════════════ */
  let hudTimer = null;
  ui.toast = (msg, iconSvg) => {
    const t = el('div', { cls: 'toast', html: (iconSvg || '') + '<span>' + msg + '</span>' });
    toastsEl.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2200);
    while (toastsEl.children.length > 4) toastsEl.firstChild.remove();
  };
  ui.hud = (iconName, value, label) => {
    hudEl.innerHTML = '<div style="display:flex;gap:8px;align-items:center">' + MAC.icon(iconName, { sw: 1.8 }) +
      '<span style="font-size:12.5px">' + (label || Math.round(value * 100) + '%') + '</span></div>' +
      '<div class="hud-bar"><i style="width:' + Math.round(value * 100) + '%"></i></div>' +
      '<div class="hud-label">' + MAC.icon(iconName, { sw: 1.6 }) + '</div>';
    hudEl.hidden = false;
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { hudEl.hidden = true; }, 1300);
  };
  MAC.bus.on('toast', (m, ic) => ui.toast(m, ic));

  /* ══════════════════════════ 右鍵選單 ══════════════════════════ */
  ui.ctxMenu = (e, items) => {
    ctxEl.innerHTML = '';
    items.forEach((it) => {
      if (it.sep) { ctxEl.appendChild(el('div', { cls: 'msep' })); return; }
      const row = el('div', {
        cls: 'mi' + (it.dis ? ' dis' : ''),
        html: '<span class="tick">' + (it.checked ? '✓' : '') + '</span><span>' + it.label + '</span><span class="k">' + (it.key || '') + '</span>',
      });
      row.style.paddingLeft = '22px';
      if (!it.dis) {
        row.addEventListener('click', () => { ui.closeCtx(); if (it.action) it.action(e); });
        row.addEventListener('mouseenter', () => {
          $$('.mi', ctxEl).forEach((r) => r.classList.remove('hot'));
          row.classList.add('hot');
        });
      }
      ctxEl.appendChild(row);
      if (it.sub) ctxEl.appendChild(el('div', { cls: 'mhead', text: it.sub }));
    });
    const box = screen.getBoundingClientRect();
    const k = screen.offsetWidth / (box.width || 1);
    ctxEl.hidden = false;
    const w = ctxEl.offsetWidth, h = ctxEl.offsetHeight;
    let x = (e.clientX - box.left) * k, y = (e.clientY - box.top) * k;
    if (x + w > screen.offsetWidth - 6) x -= w;
    if (y + h > screen.offsetHeight - 6) y -= h;
    ctxEl.style.left = Math.max(4, x) + 'px';
    ctxEl.style.top = Math.max(4, y) + 'px';
  };
  ui.closeCtx = () => { ctxEl.hidden = true; };

  /** 系統級輸入對話框（取代原生 prompt：可主題化、可嵌入、不阻塞） */
  ui.prompt = function (opts) {
    const o = typeof opts === 'string' ? { title: opts } : (opts || {});
    return new Promise((resolve) => {
      const back = el('div', { style: 'position:absolute;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.26)' });
      const box = el('div', { cls: 'glass', style: 'width:340px;padding:18px;border-radius:16px;box-shadow:var(--shadow-panel);color:var(--text)' });
      box.appendChild(el('div', { style: 'font-size:13px;font-weight:600;margin-bottom:10px', text: o.title || '' }));
      const input = el('input', {
        attrs: { type: 'text', value: o.value || '', spellcheck: 'false' },
        style: 'width:100%;height:28px;padding:0 10px;border-radius:7px;background:var(--field-bg);box-shadow:inset 0 0 0 .5px var(--line);font-size:13px',
      });
      box.appendChild(input);
      const row = el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px' });
      const cancel = el('button', { cls: 'btn', text: o.cancel || '取消' });
      const ok = el('button', { cls: 'btn primary', text: o.ok || '確定' });
      row.appendChild(cancel); row.appendChild(ok);
      box.appendChild(row);
      back.appendChild(box);
      desktopEl.appendChild(back);
      const done = (v) => { document.removeEventListener('keydown', key); back.remove(); resolve(v); };
      const key = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); done(null); }
        else if (e.key === 'Enter') { e.preventDefault(); done(input.value.trim() || null); }
      };
      cancel.addEventListener('click', () => done(null));
      ok.addEventListener('click', () => done(input.value.trim() || null));
      back.addEventListener('pointerdown', (e) => { if (e.target === back) done(null); });
      document.addEventListener('keydown', key);
      setTimeout(() => { input.focus(); input.select(); }, 30);
    });
  };

  /* ══════════════════════════ 開機 / 登入 ══════════════════════════ */
  ui.boot = function (opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      booted = false;
      desktopEl.hidden = true;
      loginEl.hidden = true;
      bootEl.hidden = false;
      bootEl.classList.remove('done');
      bootFill.style.width = '0%';
      bootHint.textContent = opts.afterShutdown ? '已關機 — 按任意鍵開機' : 'macOS 正在啟動…（按任意鍵略過）';
      const off = () => {
        document.removeEventListener('keydown', onAny);
        document.removeEventListener('pointerdown', onAny);
      };
      let finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        off();
        clearInterval(bootProgress.timer);
        bootFill.style.width = '100%';
        setTimeout(() => {
          bootEl.classList.add('done');
          setTimeout(() => { bootEl.hidden = true; resolve(); }, 620);
        }, 220);
      }
      function onAny() {
        if (opts.afterShutdown) { off(); bootProgress().then(finishSkip); }
        else finish();
      }
      function finishSkip() { bootFill.style.width = '100%'; finish(); }
      // 兩個分支都要允許「按任意鍵」：開機中＝略過動畫；關機後＝按下即開機
      document.addEventListener('keydown', onAny);
      document.addEventListener('pointerdown', onAny);
      if (!opts.afterShutdown) bootProgress().then(finish);
    });
  };

  /** 開機進度條動畫（純視覺，不做事） */
  function bootProgress() {
    if (bootProgress.p) return bootProgress.p;
    bootProgress.timer = null;
    bootProgress.p = new Promise((resolve) => {
      let p = 0;
      bootProgress.timer = setInterval(() => {
        p += 4 + Math.random() * 9;
        bootFill.style.width = Math.min(100, p) + '%';
        if (p >= 100) { clearInterval(bootProgress.timer); setTimeout(resolve, 240); }
      }, 110);
    }).then((v) => { bootProgress.p = null; return v; });
    return bootProgress.p;
  }

  let loginResolve = null, loginUnlock = false;
  function submitLogin(e) {
    if (e) e.preventDefault();
    if (loginUnlock && !loginPass.value) {                 // 解鎖必須輸入密碼
      loginForm.classList.add('shake');
      setTimeout(() => loginForm.classList.remove('shake'), 460);
      loginHint('請輸入密碼');
      return;
    }
    loginEl.classList.add('out');
    document.body.dataset.locked = 'false';
    setTimeout(() => {
      loginEl.hidden = true;
      const r = loginResolve; loginResolve = null;
      if (r) r();
    }, 520);
  }
  function loginHint(t) { $('#loginHint').textContent = t; }

  ui.login = function (mode) {
    loginUnlock = mode === 'unlock';
    document.body.dataset.locked = 'true';
    loginEl.hidden = false;
    loginEl.classList.remove('out');
    loginPass.value = '';
    $('#loginTime').textContent = MAC.util.clock(new Date());
    $('#loginDate').textContent = MAC.util.dateCN(new Date());
    loginHint(loginUnlock ? '輸入密碼以解鎖（任意字元）' : '按 Return 或點擊箭頭即可登入');
    setTimeout(() => loginPass.focus(), 60);
    return new Promise((resolve) => { loginResolve = resolve; });
  };
  loginForm.addEventListener('submit', submitLogin);

  ui.lock = function () {
    ui.closeAll();
    ui.login('unlock').then(() => applyState());
  };

  ui.shutdown = function () {
    ui.closeAll();
    $$('.window').forEach((w) => w.remove());
    MAC.wm.wins.clear();
    desktopEl.style.transition = 'opacity .6s';
    desktopEl.style.opacity = '0';
    setTimeout(() => {
      desktopEl.hidden = true;
      desktopEl.style.opacity = '';
      S().set('booted', false);
      ui.boot({ afterShutdown: true }).then(() => bootFlow());
    }, 620);
  };

  ui.restart = function () {
    ui.closeAll();
    $$('.window').forEach((w) => w.remove());
    MAC.wm.wins.clear();
    ui.toast('正在重新啟動…', MAC.icon('restart'));
    desktopEl.hidden = true;
    ui.boot({}).then(() => bootFlow());
  };

  /* ══════════════════════════ 選單列 ══════════════════════════ */
  const FALLBACK_MENUS = {
    '檔案': [
      { label: '新增 Finder 視窗', key: '⌘N', action: () => MAC.openApp('finder') },
      { label: '新增檔案夾', key: '⇧⌘N', action: () => MAC.bus.emit('toast', '請先開啟 Finder 視窗') },
      { sep: true },
      { label: '關閉視窗', key: '⌘W', dis: true },
    ],
    '編輯': [{ label: '還原', key: '⌘Z', dis: true }, { label: '全選', key: '⌘A', dis: true }],
    '顯示方式': [{ label: '顯示側邊欄', checked: true, action: () => {} }, { label: '顯示預覽', action: () => {} }],
    '前往': [
      { label: '桌面', key: '⇧⌘D', action: () => MAC.wm.open('finder', { path: '/Users/apple/桌面' }) },
      { label: '文件', key: '⇧⌘O', action: () => MAC.wm.open('finder', { path: '/Users/apple/文件' }) },
      { label: '應用程式', key: '⇧⌘A', action: () => MAC.wm.open('finder', { path: '/應用程式' }) },
    ],
    '視窗': [{ label: '縮到最小', key: '⌘M', dis: true }, { label: '縮放', dis: true }],
    '輔助說明': [{ label: 'macOS 桌面環境使用手冊', action: () => MAC.bus.emit('toast', '手冊：README.md') }],
  };

  /** 蘋果選單（最近使用清單為動態產生） */
  function appleMenu() {
    const recents = (S().get('recents') || []).filter((id) => MAC.apps[id]).slice(0, 3);
    return [
      { label: '關於這台 Mac', action: () => MAC.openApp('about') },
      { sep: true },
      { label: '系統設定…', key: '⌘,', action: () => MAC.openApp('settings') },
      { label: 'App Store…', action: () => MAC.bus.emit('toast', 'App Store 未安裝於模擬環境') },
      { sep: true },
      { label: '最近使用的項目', dis: true },
    ].concat(recents.map((id) => ({ label: '　' + MAC.apps[id].name, action: () => MAC.openApp(id) })))
      .concat([
        { sep: true },
        { label: '睡眠', action: () => ui.sleep() },
        { label: '重新啟動…', action: () => ui.restart() },
        { label: '關機…', action: () => ui.shutdown() },
        { sep: true },
        { label: '鎖定畫面', key: '⌃⌘Q', action: () => ui.lock() },
        { label: '登出 Apple 使用者…', key: '⇧⌘Q', action: () => ui.lock() },
      ]);
  }

  function currentApp() {
    const win = MAC.wm.focusedWin();
    if (win && win.app) return { app: win.app, win: win };
    return { app: MAC.apps.finder, win: null };
  }

  function renderMenus() {
    const cur = currentApp();
    const appName = cur.app ? cur.app.name : 'Finder';
    mbMenus.innerHTML = '';
    const nameBtn = el('div', { cls: 'mb-item app-name', text: appName });
    mbMenus.appendChild(nameBtn);

    let menus;
    try { menus = (cur.app && cur.app.menus) ? cur.app.menus(cur.win) : FALLBACK_MENUS; }
    catch (e) { menus = FALLBACK_MENUS; }
    if (!menus || !Object.keys(menus).length) menus = FALLBACK_MENUS;

    Object.keys(menus).forEach((title) => {
      const btn = el('div', { cls: 'mb-item', text: title });
      btn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(btn, menus[title], title); });
      btn.addEventListener('mouseenter', () => { if (activeMenu) openMenu(btn, menus[title], title); });
      mbMenus.appendChild(btn);
    });
  }

  function openMenu(btn, items, title) {
    const box = screen.getBoundingClientRect();
    const k = screen.offsetWidth / (box.width || 1);
    mbDrop.innerHTML = '';
    items.forEach((it) => {
      if (it.sep) { mbDrop.appendChild(el('div', { cls: 'msep' })); return; }
      const row = el('div', {
        cls: 'mi' + (it.dis ? ' dis' : ''),
        html: '<span class="tick">' + (it.checked ? '✓' : '') + '</span><span>' + it.label + '</span><span class="k">' + (it.key || '') + '</span>',
      });
      if (!it.dis) {
        row.addEventListener('mouseenter', () => { $$('.mi', mbDrop).forEach((r) => r.classList.remove('hot')); row.classList.add('hot'); });
        row.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); if (it.action) it.action(currentApp().win); else MAC.bus.emit('toast', it.label); });
      }
      mbDrop.appendChild(row);
    });
    const r = btn.getBoundingClientRect();
    mbDrop.hidden = false;
    mbDrop.style.left = Math.round((r.left - box.left) * k) + 'px';
    mbDrop.style.top = Math.round((r.bottom - box.top) * k + 2) + 'px';
    btn.classList.add('open');
    if (activeMenu && activeMenu.btn !== btn) activeMenu.btn.classList.remove('open');
    activeMenu = { btn: btn, title: title };
  }
  function closeMenu() {
    mbDrop.hidden = true;
    if (activeMenu) activeMenu.btn.classList.remove('open');
    activeMenu = null;
  }
  ui.closeMenu = closeMenu;

  /* 狀態項目（右側） */
  function refreshRightStatus() {
    const st = S().get('menubar');
    mbRight.innerHTML = '';
    if (S().get('dnd')) mbRight.appendChild(item(MAC.icon('moon', { sw: 1.6 }), '勿擾模式已開啟', () => ui.toggleCC()));
    mbRight.appendChild(item(MAC.icon('wifi', { sw: 1.7 }), S().get('wifi') ? 'Wi-Fi 已連接「Studio-5G」' : 'Wi-Fi 已關閉', () => ui.toggleCC()));
    if (S().get('bluetooth')) mbRight.appendChild(item(MAC.icon('bluetooth', { sw: 1.7 }), '藍牙已開啟', () => ui.toggleCC()));
    const batt = el('div', { cls: 'mb-battery' });
    batt.innerHTML = (st.showPercent ? '<span>' + st.battery + '%</span>' : '') +
      '<span class="mb-batt-shape"><span class="mb-batt-fill" style="transform:scaleX(' + (st.battery / 100) + ')"></span></span>' +
      (st.charging ? '<span style="font-size:11px">⚡</span>' : '');
    batt.title = st.charging ? '電池充電中' : '電池狀態良好';
    mbRight.appendChild(batt);
    mbRight.appendChild(item(MAC.icon('search', { sw: 1.8 }), '聚光燈搜尋（⌘空白鍵）', () => ui.toggleSpotlight()));
    const ccBtn = item(MAC.icon('sliders', { sw: 1.7 }), '控制中心', () => ui.toggleCC());
    ccBtn.id = 'mbCC';
    mbRight.appendChild(ccBtn);
    const clock = el('div', { cls: 'mb-item', attrs: { id: 'mbClock' }, text: MAC.util.clock(new Date(), st.clockSeconds) });
    clock.title = '通知中心';
    clock.addEventListener('click', (e) => { e.stopPropagation(); ui.toggleNC(); });
    mbRight.appendChild(clock);
  }
  function item(html, title, onClick) {
    const b = el('div', { cls: 'mb-item icon-only', html: html, attrs: { title: title } });
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
    return b;
  }

  /* Apple 選單 */
  function bindApple() {
    $('#mbApple').addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeMenu && activeMenu.title === 'apple') { closeMenu(); return; }
      openMenu($('#mbApple'), appleMenu(), 'apple');
    });
    $('#mbApple').addEventListener('mouseenter', () => {
      if (activeMenu && activeMenu.title !== 'apple') openMenu($('#mbApple'), appleMenu(), 'apple');
    });
  }

  /* ══════════════════════════ Dock ══════════════════════════ */
  function refreshDock() {
    const keep = dockEl.__built;
    dockEl.innerHTML = '';
    MAC.dockApps().forEach((app) => {
      const dk = el('button', {
        cls: 'dk', attrs: { 'data-app': app.id, title: app.name, 'aria-label': app.name },
        html: '<span class="dk-ic">' + MAC.appIcon(app.id) + '</span><span class="dk-tip">' + app.name + '</span>',
      });
      dk.addEventListener('click', (e) => { e.stopPropagation(); launch(app.id); });
      dk.addEventListener('contextmenu', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const wins = MAC.wm.byApp(app.id);
        ui.ctxMenu(ev, [
          { label: wins.length ? '顯示所有視窗' : '打開', action: () => launch(app.id) },
          { sep: true },
          { label: '新增視窗', key: '⌘N', dis: !!app.overlay, action: () => MAC.wm.open(app.id) },
          { sep: true },
          { label: '選項', dis: true },
          { label: '結束', key: '⌘Q', dis: !wins.length, action: () => MAC.wm.quitApp(app.id) },
        ]);
      });
      dockEl.appendChild(dk);
    });
    dockEl.appendChild(el('div', { cls: 'dk-sep' }));
    const trash = el('button', {
      cls: 'dk', attrs: { 'data-app': 'trash', title: '垃圾桶' },
      html: '<span class="dk-ic">' + MAC.appIcon('trash') + '</span><span class="dk-tip">垃圾桶</span>',
    });
    trash.addEventListener('click', () => MAC.bus.emit('toast', '垃圾桶是空的 ' + MAC.icon('trash')));
    trash.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ui.ctxMenu(ev, [{ label: '清空垃圾桶', action: () => MAC.bus.emit('toast', '垃圾桶已清空') }]); });
    dockEl.appendChild(trash);
    dockEl.__built = true;
    paintRunning();
  }
  function paintRunning() {
    $$('.dk', dockEl).forEach((dk) => {
      const id = dk.dataset.app;
      dk.classList.toggle('run', !!MAC.wm.byApp(id).filter((w) => w.state !== 'min').length || !!MAC.wm.byApp(id).length);
    });
  }
  function launch(id) {
    const app = MAC.apps[id];
    if (!app) return;
    bounce(id);
    if (app.overlay) { MAC.openApp(id); return; }
    const wins = MAC.wm.byApp(id);
    const focused = MAC.wm.focusedWin();
    if (!wins.length) { MAC.openApp(id); return; }
    if (focused && focused.appId === id) {                       // 已在前景 → 縮到最小
      MAC.wm.minimize(focused.id);
      return;
    }
    const visible = wins.filter((w) => w.state !== 'min');
    if (visible.length) MAC.wm.focus(visible[visible.length - 1].id);
    else MAC.wm.restore(wins[wins.length - 1].id);
  }
  ui.dock = {
    bounce(id, times) {
      const dk = $('.dk[data-app="' + id + '"]', dockEl);
      if (!dk) return;
      dk.classList.add('bounce');
      setTimeout(() => dk.classList.remove('bounce'), (times || 2) * 760);
    },
    iconRect(appId) {
      const dk = $('.dk[data-app="' + appId + '"]', dockEl) || $('.dk[data-app="trash"]', dockEl);
      if (!dk) return null;
      const r = dk.getBoundingClientRect();
      const box = screen.getBoundingClientRect();
      const k = screen.offsetWidth / (box.width || 1);
      return { x: (r.left - box.left) * k, y: (r.top - box.top) * k, w: r.width * k, h: r.height * k };
    },
    refresh: refreshDock,
  };
  ui.dock = ui.dock;

  /* Dock 放大效果（依滑鼠距離的平滑衰減曲線） */
  function magnify(e) {
    const st = S().get('dock');
    const icons = $$('.dk-ic', dockEl);
    if (!st.magnify) { icons.forEach((i) => (i.style.transform = '')); return; }
    const box = screen.getBoundingClientRect();
    const k = (box.width || screen.offsetWidth) / screen.offsetWidth;   // 螢幕座標 → 視窗座標
    const R = 132 * k;                                                   // 影響半徑（約 2.5 個圖示）
    icons.forEach((ic) => {
      const r = ic.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      const t = Math.max(0, 1 - d / R);
      const smooth = t * t * (3 - 2 * t);                                 // smoothstep，避免生硬線性
      ic.style.transform = 'scale(' + (1 + (st.magnitude - 1) * smooth).toFixed(3) + ')';
    });
  }
  function resetMagnify() { $$('.dk-ic', dockEl).forEach((i) => (i.style.transform = '')); }

  /* ══════════════════════════ 控制中心 ══════════════════════════
     DOM 只建構一次（buildCC），之後只做「就地同步」（syncCC）。
     重要：若每次狀態變更都重建面板，拖曳滑桿的第一個 input 事件就會把滑桿
     從 DOM 移除，導致拖到一半就斷掉 —— 這是真實使用中會被發現的體驗缺陷。 */
  let ccRefs = null;
  const CC_TILES = [['wifi', 'Wi-Fi', 'Studio-5G'], ['bluetooth', '藍牙', '開啟'], ['airdrop', 'AirDrop', '僅限聯絡人']];
  const CC_STACK = [['dnd', 'moon', '勿擾模式'], ['night', 'sun', '夜覽']];

  function buildCC() {
    ccEl.innerHTML = '';
    const refs = ccRefs = { toggles: {}, sub: {}, sliders: {} };
    const toggle = (key) => {
      const b = el('button', { cls: 'cc-btn' });
      b.addEventListener('click', () => S().set(key, !S().get(key)));
      refs.toggles[key] = b;
      return b;
    };

    const tile = el('div', 'cc-tile');
    CC_TILES.forEach(([k, label, sub], i) => {
      const b = toggle(k);
      if (i === 2) b.style.gridColumn = 'span 2';
      b.innerHTML = '<span class="cc-ic">' + MAC.icon(k, { sw: 1.8 }) + '</span><span><b>' + label + '</b><small></small></span>';
      refs.sub[k] = { el: b.querySelector('small'), on: sub, off: '關閉' };
      tile.appendChild(b);
    });
    const stage = toggle('stageManager');
    stage.style.gridColumn = 'span 2';
    stage.innerHTML = '<span class="cc-ic">' + MAC.icon('window', { sw: 1.8 }) + '</span><span><b>幕前調度</b><small></small></span>';
    refs.sub.stageManager = { el: stage.querySelector('small'), on: '開啟', off: '關閉' };
    tile.appendChild(stage);
    ccEl.appendChild(tile);

    const wide = el('div', 'cc-wide');
    [['mirror', '螢幕鏡像輸出', '未連接', () => MAC.bus.emit('toast', '沒有可用的顯示器')],
     ['desktop', '螢幕畫面', '1512 × 945', () => MAC.bus.emit('toast', '目前只有一個內建顯示器')]].forEach(([ic, label, sub, fn]) => {
      const b = el('button', { cls: 'cc-btn' });
      b.innerHTML = '<span class="cc-ic">' + MAC.icon(ic, { sw: 1.8 }) + '</span><span><b>' + label + '</b><small>' + sub + '</small></span>';
      b.addEventListener('click', fn);
      wide.appendChild(b);
    });
    ccEl.appendChild(wide);

    const stack = el('div', 'cc-stack');
    CC_STACK.forEach(([k, ic, label]) => {
      const b = toggle(k);
      b.innerHTML = '<span class="cc-ic">' + MAC.icon(ic, { sw: 1.8 }) + '</span><span><b>' + label + '</b><small></small></span>';
      refs.sub[k] = { el: b.querySelector('small'), on: '開啟', off: '關閉' };
      stack.appendChild(b);
    });
    const lock = el('button', { cls: 'cc-btn' });
    lock.innerHTML = '<span class="cc-ic">' + MAC.icon('lock', { sw: 1.8 }) + '</span><span><b>鎖定畫面</b><small>鎖定並回到登入畫面</small></span>';
    lock.addEventListener('click', () => { ui.closeCC(); ui.lock(); });
    stack.appendChild(lock);
    ccEl.appendChild(stack);

    [['brightness', 'sun', '顯示器亮度', '亮度'], ['volume', 'volume', '音效音量', '音量']].forEach(([key, ic, label, hud]) => {
      const box = el('div', 'cc-slider');
      box.innerHTML = '<label>' + label + '</label>';
      const input = el('input', { cls: 'sl', attrs: { type: 'range', min: key === 'brightness' ? '15' : '0', max: '100' } });
      input.addEventListener('input', () => {
        const v = parseFloat(input.value) / 100;
        S().set(key, v);
        ui.hud(key === 'volume' && v === 0 ? 'volume-mute' : ic, v, hud + ' ' + input.value + '%');
      });
      box.appendChild(input);
      refs.sliders[key] = input;
      ccEl.appendChild(box);
    });
    syncCC();
  }

  function syncCC() {
    if (!ccRefs) return;
    for (const k in ccRefs.toggles) {
      const on = !!S().get(k);
      ccRefs.toggles[k].classList.toggle('on', on);
      const s = ccRefs.sub[k];
      if (s && s.el) s.el.textContent = on ? s.on : s.off;
    }
    ['brightness', 'volume'].forEach((k) => {
      const input = ccRefs.sliders[k];
      if (input && document.activeElement !== input) input.value = String(Math.round(S().get(k) * 100));
    });
  }

  function refreshCC() {
    if (ccEl.hidden) return;
    if (!ccRefs || !ccEl.firstChild) buildCC();
    else syncCC();
  }

  function togglePanel(which) {
    const isOpen = { cc: !ccEl.hidden, nc: ncEl.classList.contains('open') }[which];
    ui.closeAll();
    if (isOpen) return false;
    if (which === 'cc') { ccEl.hidden = false; refreshCC(); }
    if (which === 'nc') {
      ncEl.hidden = false;
      void ncEl.offsetWidth;                     // 強制回流，讓滑入動畫從畫面外開始（不依賴 rAF）
      ncEl.classList.add('open');
      document.body.classList.add('nc-open');
      refreshNC();
    }
    return true;
  }
  ui.toggleCC = () => togglePanel('cc');
  ui.toggleNC = () => togglePanel('nc');
  ui.closeCC = () => { ccEl.hidden = true; };
  ui.closeNC = () => { ncEl.classList.remove('open'); document.body.classList.remove('nc-open'); setTimeout(() => { if (!ncEl.classList.contains('open')) ncEl.hidden = true; }, 420); };
  ui.closeAll = () => { ui.closeCC(); ui.closeNC(); ui.closeMenu(); ui.closeCtx(); ui.closeSpotlight(); closeSwitcher(); };
  ui.sleep = () => { ui.closeAll(); document.body.dataset.locked = 'true'; dimEl.style.opacity = '1'; setTimeout(() => ui.lock(), 500); };

  /* ══════════════════════════ 通知中心 ══════════════════════════ */
  function refreshNC() {
    if (ncEl.hidden) return;
    ncInner.innerHTML = '';
    const now = new Date();

    // 日曆小工具
    const cal = el('div', 'w');
    const y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    let grid = '<span class="dow">日</span><span class="dow">一</span><span class="dow">二</span><span class="dow">三</span><span class="dow">四</span><span class="dow">五</span><span class="dow">六</span>';
    for (let i = 0; i < first; i++) grid += '<span class="out">' + (days - first + i + 1) + '</span>';
    for (let d = 1; d <= days; d++) grid += '<span class="' + (d === now.getDate() ? 'today' : '') + '">' + d + '</span>';
    cal.innerHTML = '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">' +
      '<span style="font-size:12px;font-weight:700;color:#ff5f57">' + (m + 1) + '月</span>' +
      '<span style="font-size:13px;font-weight:600">' + util.dateCN(now) + '</span>' +
      '<span style="margin-left:auto;font-size:11px;color:var(--text-3)">' + y + '</span></div>' +
      '<div class="w-cal-grid">' + grid + '</div>';
    ncInner.appendChild(cal);

    // 天氣小工具
    const weather = el('div', 'w');
    weather.innerHTML = '<div class="w-head"><span class="w-title">台北市</span><span class="w-sub">現在</span></div>' +
      '<div class="w-weather"><div><div class="w-big">26°</div><div class="w-sub">多雲時晴</div></div>' + MAC.icon('cloud', { sw: 1.2, cls: 'ic' }).replace('<svg', '<svg style="width:46px;height:46px;stroke-width:1.1"') + '</div>' +
      '<div class="w-sub" style="margin-top:8px">最高 31° 最低 22° · 降雨機率 20%</div>';
    ncInner.appendChild(weather);

    // 螢幕使用時間
    const usage = el('div', 'w');
    const bars = [42, 68, 35, 88, 54, 26, 61];
    usage.innerHTML = '<div class="w-head"><span class="w-title">螢幕使用時間</span><span class="w-sub">本週平均 5 小時 12 分</span></div>' +
      '<div style="display:flex;align-items:flex-end;gap:6px;height:56px">' +
      bars.map((b, i) => '<div style="flex:1;height:' + b + '%;border-radius:4px;background:' + (i === 3 ? 'var(--accent)' : 'var(--ctl-on)') + ';opacity:' + (i === 3 ? 1 : .45) + '"></div>').join('') +
      '</div><div class="w-row" style="margin-top:6px"><span class="w-sub">日 一 二 三 四 五 六</span></div>';
    ncInner.appendChild(usage);

    // 通知
    const list = S().get('notifications');
    if (!list.length) {
      const empty = el('div', { cls: 'w', style: 'text-align:center;color:var(--text-3);font-size:12.5px', text: '沒有新的通知' });
      ncInner.appendChild(empty);
    } else {
      ncInner.appendChild(el('div', { cls: 'w-title', text: '通知', style: 'padding-left:4px;margin-top:4px' }));
      list.slice(0, 8).forEach((n) => {
        const card = el('div', { cls: 'note' });
        card.innerHTML = '<div class="note-ic">' + MAC.appIcon(n.icon || n.app) + '</div>' +
          '<div class="note-body"><b><span>' + util.esc(n.title) + '</span><time>' + util.rel(n.time) + '</time></b>' +
          '<p>' + util.esc(n.body) + '</p></div>' +
          '<button class="note-x" title="清除">✕</button>';
        card.addEventListener('click', () => {
          if (MAC.apps[n.app]) MAC.openApp(n.app);
          ui.closeNC();
        });
        card.querySelector('.note-x').addEventListener('click', (e) => {
          e.stopPropagation();
          card.classList.add('gone');
          setTimeout(() => { S().patch('notifications', (arr) => { const i = arr.findIndex((x) => x.id === n.id); if (i >= 0) arr.splice(i, 1); }); refreshNC(); }, 280);
        });
        ncInner.appendChild(card);
      });
    }
  }

  /* ══════════════════════════ 聚光燈 ══════════════════════════ */
  let spItems = [], spIndex = 0;
  ui.toggleSpotlight = () => {
    if (!spEl.hidden) { ui.closeSpotlight(); return; }
    ui.closeAll();
    spEl.hidden = false;
    spInput.value = '';
    spInput.focus();
    searchSpotlight('');
  };
  ui.closeSpotlight = () => { spEl.hidden = true; };

  function evalMath(expr) {
    const s = expr.replace(/[×]/g, '*').replace(/[÷]/g, '/').replace(/[−–]/g, '-');
    if (!/^[-+*/%(). \d]+$/.test(s)) return null;
    let i = 0;
    const skip = () => { while (s[i] === ' ') i++; };
    function expr2() {
      let v = term();
      for (;;) {
        skip();
        if (s[i] === '+') { i++; v += term(); }
        else if (s[i] === '-') { i++; v -= term(); }
        else return v;
      }
    }
    function term() {
      let v = unary();
      for (;;) {
        skip();
        if (s[i] === '*') { i++; v *= unary(); }
        else if (s[i] === '/') { i++; v /= unary(); }
        else if (s[i] === '%') { i++; v %= unary(); }
        else return v;
      }
    }
    function unary() {
      skip();
      if (s[i] === '-') { i++; return -unary(); }
      if (s[i] === '+') { i++; return unary(); }
      return atom();
    }
    function atom() {
      skip();
      if (s[i] === '(') { i++; const v = expr2(); skip(); if (s[i] === ')') i++; return v; }
      const start = i;
      while (i < s.length && /[\d.]/.test(s[i])) i++;
      if (start === i) throw new Error('bad');
      return parseFloat(s.slice(start, i));
    }
    try { const v = expr2(); if (i !== s.replace(/\s/g, '').length && i < s.length) return null; return isFinite(v) ? v : null; }
    catch (e) { return null; }
  }

  const SYS_CMDS = [
    { k: '深色模式 深色 暗色 dark', i: 'moon', run: () => S().set('appearance', 'dark') },
    { k: '淺色模式 亮色 light', i: 'sun', run: () => S().set('appearance', 'light') },
    { k: '自動外觀 auto', i: 'sparkle', run: () => S().set('appearance', 'auto') },
    { k: '勿擾模式 dnd', i: 'bell', run: () => S().set('dnd', !S().get('dnd')) },
    { k: '夜覽 night shift', i: 'sunscreen', run: () => S().set('night', !S().get('night')) },
    { k: '截圖 screenshot', i: 'image', run: () => MAC.bus.emit('toast', '已儲存截圖到桌面（示範）') },
    { k: '鎖定畫面 鎖定 lock', i: 'lock', run: () => ui.lock() },
    { k: '關機 shutdown', i: 'power', run: () => ui.shutdown() },
    { k: '重新啟動 restart', i: 'restart', run: () => ui.restart() },
    { k: '清空垃圾桶 trash', i: 'trash', run: () => MAC.bus.emit('toast', '垃圾桶已清空') },
    { k: '系統設定 settings', i: 'gear', run: () => MAC.openApp('settings') },
  ];

  function searchSpotlight(q) {
    const query = q.trim();
    spResults.innerHTML = '';
    spItems = []; spIndex = 0;
    if (!query) {
      const apps = MAC.listApps();
      spResults.appendChild(el('div', { cls: 'sp-group', text: '應用程式' }));
      apps.slice(0, 6).forEach((a) => addItem({ icon: a.id, title: a.name, sub: '應用程式', run: () => MAC.openApp(a.id), kind: '開啟' }));
      spResults.appendChild(el('div', { cls: 'sp-group', text: '最近使用' }));
      (S().get('recents') || []).slice(0, 3).forEach((id) => { if (MAC.apps[id]) addItem({ icon: id, title: MAC.apps[id].name, sub: '最近使用過', run: () => MAC.openApp(id), kind: '開啟' }); });
      finish();
      return;
    }
    const lower = query.toLowerCase();
    // 1) 計算
    const val = evalMath(query);
    if (val != null) {
      addItem({ icon: 'calculator', title: query + ' = ' + (Math.round(val * 1e10) / 1e10), sub: '計算機', iconRing: 'calculator', run: () => MAC.wm.open('calculator'), kind: '計算', isCalc: true });
    }
    // 2) 應用程式
    const apps = MAC.listApps().filter((a) => a.name.toLowerCase().indexOf(lower) >= 0);
    if (apps.length) {
      spResults.appendChild(el('div', { cls: 'sp-group', text: '應用程式' }));
      apps.forEach((a) => addItem({ icon: a.id, title: a.name, sub: '應用程式', run: () => MAC.openApp(a.id), kind: '開啟' }));
    }
    // 3) 檔案
    const files = [];
    MAC.fs.walk(MAC.fs.home, (f) => { if (f.name.toLowerCase().indexOf(lower) >= 0 && files.length < 8) files.push(f); });
    if (files.length) {
      spResults.appendChild(el('div', { cls: 'sp-group', text: '檔案與檔案夾' }));
      files.forEach((f) => {
        const fi = MAC.icons.fileIcon({ t: f.node.t, kind: f.node.kind, name: f.name, app: f.node.app });
        addItem({
          html: '<span class="sp-item-ic" style="color:' + (fi.color || '') + '">' + fi.svg + '</span>',
          title: f.name, sub: f.path.replace(MAC.fs.home, '~'), kind: '顯示',
          run: () => { if (f.node.t === 'app') MAC.openApp(f.node.app); else if (f.node.t === 'dir') MAC.wm.open('finder', { path: f.path }); else MAC.wm.open('textedit', { path: f.path }); },
        });
      });
    }
    // 4) 系統指令
    const cmds = SYS_CMDS.filter((c) => c.k.toLowerCase().indexOf(lower) >= 0 || c.k.split(' ').some((w) => w && w.toLowerCase().indexOf(lower) === 0));
    if (cmds.length) {
      spResults.appendChild(el('div', { cls: 'sp-group', text: '系統指令' }));
      cmds.forEach((c) => addItem({ icon: c.i, title: c.k.split(' ')[0], sub: '執行系統動作', kind: '執行', run: c.run }));
    }
    // 5) 網頁搜尋
    addItem({ icon: 'globe', title: '在 Safari 中搜尋「' + query + '」', sub: '網頁搜尋', kind: '搜尋', run: () => { MAC.openApp('safari'); setTimeout(() => { const w = MAC.wm.byApp('safari')[0]; if (w && w.field) { w.field.value = query; } }, 200); } });
    finish();
  }

  function addItem(o) {
    const node = el('div', { cls: 'sp-item' });
    const iconHtml = o.html || ('<span class="sp-item-ic"' + (o.isCalc ? '' : ' style="border-radius:22%;overflow:hidden"') + '>' + MAC.appIcon(o.icon) + '</span>');
    node.innerHTML = iconHtml + '<span class="sp-item-txt">' + util.esc(o.title) + '<br><small>' + util.esc(o.sub) + '</small></span><span class="sp-kind">' + o.kind + '</span>';
    node.addEventListener('mouseenter', () => { spIndex = spItems.indexOf(o); paintSpotlight(); });
    node.addEventListener('click', () => { ui.closeSpotlight(); o.run(); });
    spItems.push(o);
    spResults.appendChild(node);
  }
  function finish() {
    if (!spItems.length) spResults.appendChild(el('div', { cls: 'sp-empty', text: '沒有結果' }));
    paintSpotlight();
  }
  function paintSpotlight() {
    $$('.sp-item', spResults).forEach((n, i) => n.classList.toggle('on', i === spIndex));
  }
  function spotlightKey(e) {
    if (spItems.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); spIndex = (spIndex + 1) % spItems.length; paintSpotlight(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); spIndex = (spIndex - 1 + spItems.length) % spItems.length; paintSpotlight(); }
    }
    if (e.key === 'Enter') { e.preventDefault(); const it = spItems[spIndex]; ui.closeSpotlight(); if (it) it.run(); }
    if (e.key === 'Escape') { e.preventDefault(); ui.closeSpotlight(); }
  }
  spInput.addEventListener('input', () => searchSpotlight(spInput.value));
  spInput.addEventListener('keydown', spotlightKey);
  spEl.addEventListener('pointerdown', (e) => { if (e.target === spEl) ui.closeSpotlight(); });

  /* ══════════════════════════ ⌘Tab 切換器 ══════════════════════════ */
  let swOpen = false, swIndex = 0, swApps = [];
  function openSwitcher() {
    if (swOpen) return;
    swApps = (S().get('recents') || []).filter((id) => MAC.apps[id] && !MAC.apps[id].overlay);
    if (!swApps.length) swApps = MAC.listApps().filter((a) => !a.overlay).map((a) => a.id);
    if (!swApps.length) return;
    swOpen = true; swIndex = 1 % swApps.length;
    paintSwitcher();
    swEl.hidden = false;
  }
  function paintSwitcher() {
    if (!swEl.hidden) swEl.innerHTML = '';
    const row = el('div', 'sw-row');
    swApps.forEach((id, i) => {
      const a = MAC.apps[id];
      const cell = el('div', { cls: 'sw-app' + (i === swIndex ? ' on' : '') });
      cell.innerHTML = '<span class="sw-ic">' + MAC.appIcon(id) + '</span><span>' + a.name + '</span>';
      cell.addEventListener('click', () => { swIndex = i; commitSwitcher(); });
      row.appendChild(cell);
    });
    swEl.appendChild(row);
    swEl.appendChild(el('div', { cls: 'sw-name', text: MAC.apps[swApps[swIndex]].name }));
  }
  function cycleSwitcher() {
    if (!swOpen) { openSwitcher(); return; }
    swIndex = (swIndex + 1) % swApps.length;
    paintSwitcher();
  }
  function commitSwitcher() {
    if (!swOpen) return;
    const id = swApps[swIndex];
    closeSwitcher();
    if (MAC.apps[id]) {
      const wins = MAC.wm.byApp(id).filter((w) => w.state !== 'min');
      if (wins.length) MAC.wm.focus(wins[wins.length - 1].id);
      else if (MAC.wm.byApp(id).length) MAC.wm.restore(MAC.wm.byApp(id)[0].id);
      else MAC.openApp(id);
    }
  }
  function closeSwitcher() { swOpen = false; swEl.hidden = true; }

  /* ══════════════════════════ Launchpad ══════════════════════════ */
  function openLaunchpad() {
    if (overlay) return;
    ui.closeAll();
    overlay = el('div', {
      style: 'position:absolute;inset:0;z-index:820;background:rgba(0,0,0,.42);-webkit-backdrop-filter:saturate(180%) blur(46px);backdrop-filter:saturate(180%) blur(46px);padding:80px 90px;overflow-y:auto',
    });
    const search = el('input', {
      attrs: { type: 'text', placeholder: '搜尋', spellcheck: 'false' },
      style: 'display:block;margin:0 auto 34px;width:280px;height:32px;border-radius:999px;text-align:center;background:rgba(255,255,255,.16);color:#fff;font-size:13px;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.24)',
    });
    const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:34px 10px;max-width:900px;margin:0 auto' });
    const paint = () => {
      grid.innerHTML = '';
      const q = search.value.trim().toLowerCase();
      MAC.listApps().filter((a) => !a.overlay && (!q || a.name.toLowerCase().indexOf(q) >= 0)).forEach((a) => {
        const cell = el('button', { cls: 'sw-app', style: 'width:100%' });
        cell.innerHTML = '<span class="sw-ic" style="width:76px;height:76px;border-radius:19px">' + MAC.appIcon(a.id) + '</span><span style="color:#fff">' + a.name + '</span>';
        cell.addEventListener('click', () => { closeLaunchpad(); MAC.openApp(a.id); });
        grid.appendChild(cell);
      });
    };
    search.addEventListener('input', paint);
    overlay.appendChild(search);
    overlay.appendChild(grid);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) closeLaunchpad(); });
    desktopEl.appendChild(overlay);
    paint();
    setTimeout(() => search.focus(), 30);
  }
  function closeLaunchpad() { if (overlay) { overlay.remove(); overlay = null; } }
  MAC.bus.on('overlay:launchpad', openLaunchpad);

  /* ══════════════════════════ 桌面圖示 ══════════════════════════ */
  function buildDesktopIcons() {
    const host = $('#desktopIcons');
    host.innerHTML = '';
    const items = [
      { n: 'Macintosh HD', ic: 'hdd', color: '#b9c0ca', open: () => MAC.wm.open('finder', { path: '/' }) },
      { n: '專案', ic: 'folder', color: '#4aa3ff', open: () => MAC.wm.open('finder', { path: '/Users/apple/專案' }) },
      { n: '產品藍圖.md', ic: 'file-text', color: '#8f98a4', open: () => MAC.wm.open('textedit', { path: '/Users/apple/桌面/產品藍圖.md' }) },
      { n: '受邀名單.csv', ic: 'file-text', color: '#8f98a4', open: () => MAC.wm.open('textedit', { path: '/Users/apple/下載項目/受邀名單.csv' }) },
    ];
    items.forEach((it) => {
      const di = el('div', { cls: 'di', html: '<span class="di-ic" style="color:' + it.color + '">' + MAC.icon(it.ic, { sw: 1.4 }) + '</span><span class="di-name">' + it.n + '</span>' });
      di.addEventListener('click', (e) => { e.stopPropagation(); $$('.di', host).forEach((d) => d.classList.remove('sel')); di.classList.add('sel'); });
      di.addEventListener('dblclick', it.open);
      host.appendChild(di);
    });
  }

  /* ══════════════════════════ 全域事件綁定 ══════════════════════════ */
  function bindGlobal() {
    // 點擊空白處關閉面板
    document.addEventListener('pointerdown', (e) => {
      const t = e.target;
      if (!t.closest('#menubar') && !t.closest('#mbDrop') && activeMenu) closeMenu();
      if (!t.closest('#cc') && !t.closest('#mbCC') && !ccEl.hidden && !t.closest('#mbRight')) ui.closeCC();
      if (!ctxEl.hidden && !t.closest('#ctxMenu')) ui.closeCtx();
      if (t.closest('#desktopIcons') === null && $('#desktopIcons')) $$('.di').forEach((d) => d.classList.remove('sel'));
    });

    // Dock 放大（游標在 Dock 區域或剛離開時仍持續追蹤，讓縮放平滑收回）
    dockEl.addEventListener('pointerenter', () => { hoverDock = true; });
    dockEl.addEventListener('pointerleave', () => { hoverDock = false; resetMagnify(); });
    document.addEventListener('pointermove', (e) => {
      if (hoverDock || dockEl.contains(e.target)) { hoverDock = dockEl.contains(e.target); magnify(e); }

      // 自動隱藏：靠近畫面邊緣時顯示選單列 / Dock
      const b = screen.getBoundingClientRect();
      const k = screen.offsetWidth / (b.width || 1);
      const x = (e.clientX - b.left) * k, y = (e.clientY - b.top) * k;
      if (S().get('menubar.autohide')) menubar.classList.toggle('peek', y <= 6);
      if (S().get('dock.autohide')) {
        const pos = S().get('dock.position');
        document.body.classList.toggle('dock-peek', pos === 'bottom' ? y > screen.offsetHeight - 6 : pos === 'left' ? x < 6 : x > screen.offsetWidth - 6);
      }
    });

    // 鍵盤
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // 視窗事件 → Dock / 選單列
    MAC.bus.on('app:open', () => { finishPaint(); });
    MAC.bus.on('app:close', () => { finishPaint(); });
    MAC.bus.on('app:minimize', () => { finishPaint(); });
    MAC.bus.on('app:restore', () => { finishPaint(); });
    MAC.bus.on('app:focus', () => { renderMenus(); finishPaint(); });
    MAC.bus.on('app:launch', (app) => {
      S().patch('recents', (arr) => { const i = arr.indexOf(app.id); if (i >= 0) arr.splice(i, 1); arr.unshift(app.id); if (arr.length > 8) arr.length = 8; });
    });
    MAC.bus.on('notify', () => { ui.toast('新通知：' + (S().get('notifications')[0] || {}).title, MAC.icon('bell')); if (!ncEl.hidden) refreshNC(); });
    MAC.bus.on('hud:volume', () => ui.hud(S().get('volume') > 0 ? 'volume' : 'volume-mute', S().get('volume'), '音量 ' + Math.round(S().get('volume') * 100) + '%'));
    MAC.bus.on('clipboard', (text) => {
      if (!text) return;
      try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) { /* 忽略 */ }
      ui.toast('已拷貝到剪貼簿', MAC.icon('check'));
    });
    MAC.bus.on('state', (key) => applyState(key));
  }
  let hoverDock = false;

  function finishPaint() { paintRunning(); renderMenus(); }

  function onKeyDown(e) {
    const meta = e.metaKey || e.ctrlKey;
    // 聚光燈
    if (meta && (e.key === ' ' || e.code === 'Space')) { e.preventDefault(); ui.toggleSpotlight(); return; }
    // ⌘Tab
    if (meta && e.key === 'Tab') { e.preventDefault(); if (!swOpen) openSwitcher(); else cycleSwitcher(); return; }
    if (e.key === 'Escape') {
      if (!ctxEl.hidden) { ui.closeCtx(); return; }
      if (!mbDrop.hidden) { closeMenu(); return; }
      if (!spEl.hidden) { ui.closeSpotlight(); return; }
      if (!ccEl.hidden) { ui.closeCC(); return; }
      if (ncEl.classList.contains('open')) { ui.closeNC(); return; }
      if (overlay) { closeLaunchpad(); return; }
      return;
    }
    if (e.key === 'F11') { e.preventDefault(); const w = MAC.wm.focusedWin(); if (w) MAC.wm.toggleFull(w.id); }
    if (!meta) return;
    const win = MAC.wm.focusedWin();
    const k = e.key.toLowerCase();
    if (k === 'w') { e.preventDefault(); if (win) MAC.wm.close(win.id); }
    else if (k === 'm') { e.preventDefault(); if (win) MAC.wm.minimize(win.id); }
    else if (k === 'q') { e.preventDefault(); if (win) MAC.wm.quitApp(win.appId); }
    else if (k === ',') { e.preventDefault(); MAC.openApp('settings'); }
    else if (k === 'n') { e.preventDefault(); if (win) MAC.wm.open(win.appId); }
    else if (k === 'z') { e.preventDefault(); document.execCommand('undo'); }
    else if (k === 'h') { e.preventDefault(); if (win) MAC.bus.emit('toast', '已隱藏 ' + win.app.name); MAC.wm.minimize(win.id); }
  }
  function onKeyUp(e) {
    if ((e.key === 'Meta' || e.key === 'Control') && swOpen) commitSwitcher();
  }

  /* ══════════════════════════ 啟動流程 ══════════════════════════ */
  function tick() {
    const st = S().get('menubar');
    const c = $('#mbClock');
    if (c) c.textContent = MAC.util.clock(new Date(), st.clockSeconds);
    const lt = $('#loginTime');
    if (lt && !loginEl.hidden) { lt.textContent = MAC.util.clock(new Date()); $('#loginDate').textContent = MAC.util.dateCN(new Date()); }
    if (S().get('appearance') === 'auto') {
      const h = new Date().getHours();
      const want = (h > 7 && h < 19) ? 'light' : 'dark';
      if (document.documentElement.dataset.theme !== want) document.documentElement.dataset.theme = want;
    }
  }

  /** 進入桌面：開機與登入的最終狀態 */
  function enterDesktop(alpha) {
    booted = true;
    S().set('booted', true);
    bootEl.hidden = true;
    loginEl.hidden = true;
    desktopEl.hidden = false;
    document.body.dataset.locked = 'false';
    applyState();
    finishPaint();
    if (alpha) {
      // 首次開機：自動開啟 Finder 並送上歡迎通知
      setTimeout(() => {
        MAC.wm.open('finder', { path: '/Users/apple/桌面' });
        S().notify('about', '歡迎使用', '試著拖曳視窗邊緣分割畫面，或用 ⌘空白鍵 叫出 Spotlight。', 'about');
      }, 420);
    } else {
      setTimeout(() => MAC.wm.open('finder', { path: '/Users/apple/桌面' }), 300);
    }
  }

  function bootFlow() {
    return ui.boot({})
      .then(() => ui.login('boot'))
      .then(() => enterDesktop(!sessionStorage.getItem('macos.greeted')))
      .then(() => { try { sessionStorage.setItem('macos.greeted', '1'); } catch (e) { /* 私密模式 */ } });
  }

  ui.init = function (opts) {
    opts = opts || {};
    MAC.icons.mountSprite();
    fitScreen();
    window.addEventListener('resize', fitScreen);
    applyState();
    bindApple();
    bindGlobal();
    buildDesktopIcons();
    refreshDock();
    renderMenus();
    refreshRightStatus();
    refreshCC();
    setInterval(tick, 1000);
    tick();
    if (opts.skip) { enterDesktop(!sessionStorage.getItem('macos.greeted')); return Promise.resolve(); }
    return bootFlow();
  };
})();
