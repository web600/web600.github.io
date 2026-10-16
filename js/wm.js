/* ==========================================================================
   wm.js — WindowManager（視窗管理層）
   職責：開窗／關窗／最小化／還原／縮放／全螢幕／圖層堆疊／拖曳／八向縮放／
        邊緣吸附分割／焦點廣播。完全不認識任何具體 App 的實作。
   ========================================================================== */
'use strict';

MAC.WindowManager = class WindowManager {
  constructor() {
    this.screen = util.$('#screen');
    this.layer = util.$('#windows');
    this.preview = util.$('#snapPreview');
    this.wins = new Map();
    this.z = 100;
    this.seq = 0;
    this.cascade = 0;
    this.focused = null;
    this.mbH = 26;
    this.gap = 8;                     // 分割吸附時的邊距
    this._bindGlobal();
    window.addEventListener('resize', () => { /* 螢幕尺寸由 CSS scale 處理，不需重算 */ });
  }

  /* ------------------------------------------------ 幾何 / 工作區 */
  workArea() {
    const w = this.screen.offsetWidth || 1512;
    const h = this.screen.offsetHeight || 945;
    return { x: 0, y: this.mbH, w: w, h: h - this.mbH };
  }
  /** 吸附區域：left / right / top / null */
  snapZone(px, py) {
    const wa = this.workArea();
    const edge = 7;
    if (py <= wa.y + edge) return 'top';
    if (px <= edge) return 'left';
    if (px >= wa.w - edge) return 'right';
    return null;
  }
  snapRect(zone) {
    const wa = this.workArea(), g = this.gap;
    if (zone === 'left') return { x: g, y: wa.y + g, w: (wa.w - g * 3) / 2, h: wa.h - g * 2 };
    if (zone === 'right') return { x: wa.w - g - (wa.w - g * 3) / 2, y: wa.y + g, w: (wa.w - g * 3) / 2, h: wa.h - g * 2 };
    return { x: 0, y: wa.y, w: wa.w, h: wa.h };               // top → 全螢幕工作區
  }
  centerRect(w, h) {
    const wa = this.workArea();
    return { x: Math.round(wa.x + (wa.w - w) / 2), y: Math.round(wa.y + Math.max(24, (wa.h - h) / 2.6)), w: w, h: h };
  }

  /* ------------------------------------------------ 開窗 */
  open(appId, opts) {
    opts = opts || {};
    const app = MAC.apps[appId];
    if (!app) { MAC.bus.emit('toast', '找不到應用程式：' + appId); return null; }

    // 單例 App：已開著就聚焦
    if (app.singleton !== false) {
      const ex = this.byApp(appId)[0];
      if (ex) {
        if (ex.state === 'min') this.restore(ex.id); else this.focus(ex.id);
        if (opts.path && ex.app.setPath) ex.app.setPath(ex, opts.path);
        return ex;
      }
    }

    const spec = app.win || {};
    const wa = this.workArea();
    const w = Math.min(opts.w || spec.w || 900, wa.w - 40);
    const h = Math.min(opts.h || spec.h || 560, wa.h - 40);
    const off = (this.cascade++ % 6) * 28;
    const rect = (opts.x != null && opts.y != null)
      ? { x: opts.x, y: opts.y, w: w, h: h }
      : { x: Math.round((wa.w - w) / 2 + off - 60), y: Math.round(wa.y + Math.max(16, (wa.h - h) / 2.4) + off - 40), w: w, h: h };

    const id = 'w' + (++this.seq);
    const el = util.el('div', {
      cls: 'window opening', attrs: { 'data-id': id, 'data-app': appId, role: 'dialog', 'aria-label': app.name },
      style: 'left:' + rect.x + 'px;top:' + rect.y + 'px;width:' + rect.w + 'px;height:' + rect.h + 'px;z-index:' + (++this.z),
    });

    /* 標題列 */
    const bar = util.el('div', {
      cls: 'win-bar', html:
        '<div class="lights">' +
        '<button class="light close" title="關閉" aria-label="關閉">' + MAC.icon('x', { sw: 1.9 }) + '</button>' +
        '<button class="light min" title="縮到最小" aria-label="縮到最小">' + MAC.icon('minus', { sw: 1.9 }) + '</button>' +
        '<button class="light zoom" title="縮放" aria-label="縮放">' + MAC.icon('zoom-out', { sw: 1.9 }) + '</button>' +
        '</div>' +
        '<div class="win-title"></div>' +
        '<div class="win-right"></div>',
    });

    const body = util.el('div', { cls: 'win-body' });
    el.appendChild(bar); el.appendChild(body);
    ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].forEach((d) => el.appendChild(util.el('div', { cls: 'rz ' + d, attrs: { 'data-rz': d } })));
    this.layer.appendChild(el);

    const win = {
      id: id, appId: appId, app: app, el: el, bar: bar, bodyEl: body, opts: opts,
      titleEl: util.$('.win-title', bar),
      title: opts.title || app.name,
      rect: rect, restore: null, state: 'normal', minRect: null, openedAt: Date.now(),
      setTitle(t) { this.title = t; this.titleEl.textContent = t; if (this.state === 'full') document.title = t + ' — macOS'; return this; },
      setCaption(t) { this.titleEl.textContent = t; return this; },
    };
    this.wins.set(id, win);
    win.setTitle(win.title);

    /* App 內容（工具列 + 主體） */
    try {
      if (app.toolbar) { const tb = app.toolbar(win, MAC); if (tb) body.appendChild(tb); }
      const content = app.render(win, MAC);
      if (content) body.appendChild(content);
    } catch (e) {
      console.error('[wm] ' + appId + ' 渲染失敗', e);
      body.appendChild(util.el('div', { cls: 'fnd-empty', text: '應用程式載入失敗：' + e.message }));
    }

    /* 事件 */
    util.$('.light.close', bar).addEventListener('click', (e) => { e.stopPropagation(); this.close(id); });
    util.$('.light.min', bar).addEventListener('click', (e) => { e.stopPropagation(); this.minimize(id); });
    util.$('.light.zoom', bar).addEventListener('click', (e) => { e.stopPropagation(); e.altKey ? this.toggleFull(id) : this.zoom(id); });
    bar.addEventListener('pointerdown', (e) => this._startDrag(win, e));
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.light')) this.zoom(id); });
    bar.addEventListener('contextmenu', (e) => { e.preventDefault(); this._windowMenu(win, e); });
    el.addEventListener('pointerdown', () => this.focus(id), true);
    el.addEventListener('dblclick', (e) => { if (e.target.classList.contains('win-bar') || e.target.classList.contains('win-title')) this.zoom(id); });
    util.$$('.rz', el).forEach((rz) => rz.addEventListener('pointerdown', (e) => this._startResize(win, e, rz.dataset.rz)));

    /* 開窗動畫：由 Dock 圖示位置長出 */
    const from = MAC.ui.dock && MAC.ui.dock.iconRect ? MAC.ui.dock.iconRect(appId) : null;
    const originXY = from
      ? { x: from.x + from.w / 2 - rect.x, y: from.y + from.h / 2 - rect.y }
      : { x: rect.w / 2, y: 0 };
    el.style.transformOrigin = originXY.x + 'px ' + originXY.y + 'px';
    setTimeout(() => el.classList.remove('opening'), 320);

    this.focus(id, true);
    MAC.bus.emit('app:open', win);
    return win;
  }

  /* ------------------------------------------------ 焦點 / 圖層 */
  focus(id, silent) {
    const win = this.wins.get(id);
    if (!win) return;
    if (win.state === 'min') this.restore(id);
    if (this.focused !== id) {
      this.focused = id;
      this.wins.forEach((w) => w.el.classList.toggle('blur', w.id !== id));
      if (++this.z > 90000) this._renumber();
      win.el.style.zIndex = ++this.z;
      if (!silent) MAC.bus.emit('app:focus', win);
      else MAC.bus.emit('app:focus', win);
    }
    return win;
  }
  _renumber() {
    this.z = 100;
    const sorted = this.list();
    sorted.forEach((w) => { w.el.style.zIndex = ++this.z; });
  }
  list() { return Array.from(this.wins.values()).sort((a, b) => Number(a.el.style.zIndex) - Number(b.el.style.zIndex)); }
  byApp(appId) { return this.list().filter((w) => w.appId === appId); }
  get(id) { return this.wins.get(id); }
  focusedWin() { return this.focused ? this.wins.get(this.focused) : null; }

  /* ------------------------------------------------ 關閉 */
  close(id) {
    const win = this.wins.get(id);
    if (!win) return;
    if (win.app.onClose) { try { win.app.onClose(win, MAC); } catch (e) { console.warn(e); } }
    win.el.classList.add('closing');
    const done = () => {
      win.el.remove();
      this.wins.delete(id);
      if (this.focused === id) {
        this.focused = null;
        const next = this.list().filter((w) => w.state !== 'min').pop();
        if (next) this.focus(next.id); else MAC.bus.emit('app:focus', null);
      }
      MAC.bus.emit('app:close', win);
    };
    const onEnd = () => { win.el.removeEventListener('animationend', onEnd); done(); };
    win.el.addEventListener('animationend', onEnd);
    setTimeout(() => { if (this.wins.has(id)) done(); }, 300);   // 保險：動畫被中斷也要收乾淨
  }
  closeFocused() { if (this.focused) this.close(this.focused); }
  quitApp(appId) {
    this.byApp(appId).slice().forEach((w) => this.close(w.id));
    MAC.bus.emit('toast', MAC.apps[appId] ? MAC.apps[appId].name + ' 已結束' : '已結束');
  }

  /* ------------------------------------------------ 拖曳移動 */
  _startDrag(win, e) {
    if (e.target.closest('.light') || e.target.closest('.win-right button')) return;
    e.preventDefault();
    this.focus(win.id);
    const start = this.toLocal(e);
    const r = win.rect;
    const off = { x: start.x - r.x, y: start.y - r.y };
    let moved = false, zone = null;
    const wa = this.workArea();

    // 從「最大化／全螢幕」拖出時還原尺寸（macOS 行為）
    if (win.state === 'full' || win.state === 'zoom') {
      const saved = win.restore || { w: 900, h: 560 };
      const nw = saved.w, nh = saved.h;
      win.el.classList.add('dragging');
      win.el.classList.remove('full', 'zooming');
      win.state = 'normal';
      win.rect = { x: Math.round(start.x - nw / 2), y: Math.round(start.y - 20), w: nw, h: nh };
      this.applyRect(win, true);
      document.body.classList.remove('win-full');
      off.x = nw / 2; off.y = 20;
    }
    win.el.classList.add('dragging');

    const move = (ev) => {
      const p = this.toLocal(ev);
      if (!moved && Math.abs(p.x - start.x) + Math.abs(p.y - start.y) < 3) return;
      moved = true;
      win.rect.x = Math.round(util.clamp(p.x - off.x, -win.rect.w + 140, wa.w - 80));
      win.rect.y = Math.round(util.clamp(p.y - off.y, 0, wa.h + this.mbH - 30));
      this.applyRect(win);
      const z = this.snapZone(p.x, p.y);
      if (z !== zone) { zone = z; this.showPreview(zone); }
      MAC.bus.emit('window:geometry', win);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      win.el.classList.remove('dragging');
      this.hidePreview();
      if (zone) {
        const r2 = this.snapRect(zone);
        if (!win.restore) win.restore = { w: r ? r.w : win.rect.w, h: r ? r.h : win.rect.h };
        win.rect = { x: r2.x, y: r2.y, w: r2.w, h: r2.h };
        win.state = zone === 'top' ? 'zoom' : 'snap';
        win.el.classList.add('snapping');
        this.applyRect(win, true);
        setTimeout(() => win.el.classList.remove('snapping'), 240);
        MAC.bus.emit('toast', zone === 'top' ? '已放至全螢幕' : (zone === 'left' ? '分割顯示：左半邊' : '分割顯示：右半邊'));
      }
      zone = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* ------------------------------------------------ 八向縮放 */
  _startResize(win, e, dir) {
    e.preventDefault(); e.stopPropagation();
    this.focus(win.id);
    const start = this.toLocal(e);
    const r0 = { x: win.rect.x, y: win.rect.y, w: win.rect.w, h: win.rect.h };
    const min = (win.app.win && win.app.win.min) || [320, 200];
    const wa = this.workArea();
    win.el.classList.add('dragging');
    const move = (ev) => {
      const p = this.toLocal(ev);
      const dx = p.x - start.x, dy = p.y - start.y;
      let x = r0.x, y = r0.y, w = r0.w, h = r0.h;
      if (dir.indexOf('e') >= 0) w = Math.max(min[0], r0.w + dx);
      if (dir.indexOf('s') >= 0) h = Math.max(min[1], r0.h + dy);
      if (dir.indexOf('w') >= 0) { w = Math.max(min[0], r0.w - dx); x = r0.x + (r0.w - w); }
      if (dir.indexOf('n') >= 0) { h = Math.max(min[1], r0.h - dy); y = Math.max(this.mbH, r0.y + (r0.h - h)); h = r0.h + (r0.y - y); }
      win.rect = { x: Math.round(x), y: Math.round(y), w: Math.round(util.clamp(w, min[0], wa.w * 1.05)), h: Math.round(util.clamp(h, min[1], wa.h * 1.05)) };
      win.state = 'normal';
      this.applyRect(win);
      MAC.bus.emit('window:geometry', win);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      win.el.classList.remove('dragging');
      if (win.app.onResize) { try { win.app.onResize(win, MAC); } catch (err) { console.warn(err); } }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  applyRect(win, smooth) {
    const s = win.el.style;
    s.left = win.rect.x + 'px'; s.top = win.rect.y + 'px';
    s.width = win.rect.w + 'px'; s.height = win.rect.h + 'px';
    if (smooth) {
      win.el.classList.add('zooming');
      setTimeout(() => win.el.classList.remove('zooming'), 300);
    }
  }

  /* ------------------------------------------------ 縮放 / 全螢幕 */
  zoom(id) {
    const win = this.wins.get(id);
    if (!win) return;
    if (win.state === 'zoom' || win.state === 'full') {
      const r = win.restore || this.centerRect(900, 560);
      win.restore = null; win.state = 'normal';
      document.body.classList.remove('win-full');
      win.el.classList.remove('full');
      win.el.classList.add('zooming');
      win.rect = { x: r.x, y: r.y, w: r.w, h: r.h };
      this.applyRect(win);
      setTimeout(() => win.el.classList.remove('zooming'), 300);
    } else {
      win.restore = { x: win.rect.x, y: win.rect.y, w: win.rect.w, h: win.rect.h };
      const wa = this.workArea();
      const spec = win.app.win || {};
      const w = spec.best ? spec.best[0] : Math.round(wa.w * 0.74);
      const h = spec.best ? spec.best[1] : Math.round(wa.h * 0.84);
      win.rect = this.centerRect(w, h);
      win.state = 'zoom';
      win.el.classList.add('zooming');
      this.applyRect(win);
      setTimeout(() => win.el.classList.remove('zooming'), 300);
      this.focus(id);
    }
    if (win.app.onResize) { try { win.app.onResize(win, MAC); } catch (e) { console.warn(e); } }
  }

  toggleFull(id) {
    const win = this.wins.get(id);
    if (!win) return;
    if (win.state === 'full') {
      win.state = 'normal';
      const r = win.restore || this.centerRect(900, 560);
      win.rect = { x: r.x, y: r.y, w: r.w, h: r.h };
      win.el.classList.remove('full');
      win.el.classList.add('zooming');
      document.body.classList.remove('win-full');
      this.applyRect(win);
      setTimeout(() => win.el.classList.remove('zooming'), 300);
    } else {
      win.restore = { x: win.rect.x, y: win.rect.y, w: win.rect.w, h: win.rect.h };
      const wa = this.workArea();
      win.rect = { x: 0, y: 0, w: this.screen.offsetWidth, h: this.screen.offsetHeight };
      win.state = 'full';
      win.el.classList.add('full', 'zooming');
      document.body.classList.add('win-full');
      this.applyRect(win);
      setTimeout(() => win.el.classList.remove('zooming'), 300);
    }
    if (win.app.onResize) { try { win.app.onResize(win, MAC); } catch (e) { console.warn(e); } }
  }

  /* ------------------------------------------------ 最小化 / 還原 */
  minimize(id) {
    const win = this.wins.get(id);
    if (!win || win.state === 'min') return;
    const from = MAC.ui.dock && MAC.ui.dock.iconRect ? MAC.ui.dock.iconRect(win.appId) : null;
    win.minRect = { x: win.rect.x, y: win.rect.y, w: win.rect.w, h: win.rect.h };
    if (from) {
      const dx = (from.x + from.w / 2) - (win.rect.x + win.rect.w / 2);
      const dy = (from.y + from.h / 2) - (win.rect.y + win.rect.h / 2);
      const scale = Math.max(0.06, from.w / win.rect.w);
      win.el.classList.add('minimizing');
      win.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')';
      win.el.style.opacity = '0';
    } else {
      win.el.classList.add('minimizing');
      win.el.style.opacity = '0';
    }
    win.state = 'min';
    setTimeout(() => {
      win.el.classList.remove('minimizing');
      win.el.style.transform = '';
      win.el.style.opacity = '';
      win.el.classList.add('min');
      if (win.app.onMinimize) { try { win.app.onMinimize(win, MAC); } catch (e) {} }
    }, 380);
    if (MAC.ui.dock) MAC.ui.dock.bounce(win.appId, 1);
    MAC.bus.emit('app:minimize', win);
    if (this.focused === id) {
      this.focused = null;
      const next = this.list().filter((w) => w.state !== 'min').pop();
      if (next) this.focus(next.id);
    }
  }

  restore(id) {
    const win = this.wins.get(id);
    if (!win) return;
    if (win.state !== 'min') { this.focus(id); return; }
    const from = MAC.ui.dock && MAC.ui.dock.iconRect ? MAC.ui.dock.iconRect(win.appId) : null;
    win.el.classList.remove('min');
    win.state = 'normal';
    if (win.minRect) { win.rect = win.minRect; this.applyRect(win); }
    if (from) {
      const dx = (from.x + from.w / 2) - (win.rect.x + win.rect.w / 2);
      const dy = (from.y + from.h / 2) - (win.rect.y + win.rect.h / 2);
      const scale = Math.max(0.06, from.w / win.rect.w);
      win.el.classList.add('minimizing');
      win.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')';
      win.el.style.opacity = '0';
      void win.el.offsetWidth;                                  // 強制回流以啟動過場
      win.el.style.transform = '';
      win.el.style.opacity = '1';
      setTimeout(() => { win.el.classList.remove('minimizing'); win.el.style.opacity = ''; }, 400);
    }
    win.el.style.zIndex = ++this.z;
    this.focused = id;
    this.wins.forEach((w) => w.el.classList.toggle('blur', w.id !== id));
    MAC.bus.emit('app:focus', win);
    MAC.bus.emit('app:restore', win);
  }

  /* ------------------------------------------------ 吸附預覽 */
  showPreview(zone) {
    if (!zone) return this.hidePreview();
    const r = this.snapRect(zone);
    const el = this.preview;
    el.hidden = false;
    el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
    el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
    el.setAttribute('data-label', zone === 'top' ? '全螢幕' : zone === 'left' ? '視窗並排 — 左' : '視窗並排 — 右');
  }
  hidePreview() { this.preview.hidden = true; }

  /* ------------------------------------------------ 右鍵視窗選單 */
  _windowMenu(win, e) {
    if (!MAC.ui.ctxMenu) return;
    MAC.ui.ctxMenu(e, [
      { label: '縮到最小', key: '⌘M', action: () => this.minimize(win.id) },
      { label: '縮放', action: () => this.zoom(win.id) },
      { label: '進入全螢幕', key: '⌃⌘F', action: () => this.toggleFull(win.id) },
      { sep: true },
      { label: '移動到左半邊', action: () => this.snapTo(win, 'left') },
      { label: '移動到右半邊', action: () => this.snapTo(win, 'right') },
      { label: '移到另一個顯示器', dis: true },
      { sep: true },
      { label: '關閉視窗', key: '⌘W', action: () => this.close(win.id) },
    ]);
  }
  snapTo(win, zone) {
    if (!win.restore) win.restore = { x: win.rect.x, y: win.rect.y, w: win.rect.w, h: win.rect.h };
    const r = this.snapRect(zone);
    win.rect = { x: r.x, y: r.y, w: r.w, h: r.h };
    win.state = 'snap';
    win.el.classList.add('snapping');
    this.applyRect(win, true);
    setTimeout(() => win.el.classList.remove('snapping'), 240);
  }

  /* ------------------------------------------------ 座標換算（處理 CSS scale） */
  toLocal(e) {
    const box = this.screen.getBoundingClientRect();
    const sx = this.screen.offsetWidth / (box.width || 1);
    const sy = this.screen.offsetHeight / (box.height || 1);
    return { x: (e.clientX - box.left) * sx, y: (e.clientY - box.top) * sy };
  }

  /* ------------------------------------------------ 全域 */ 
  _bindGlobal() {
    // 點擊桌面空白處：關閉面板（由 shell 處理），並讓視窗失焦但不改變圖層
    MAC.bus.on('app:quit', (id) => this.quitApp(id));
  }
};

/* 全域快捷鍵在 main.js 綁定（需要 shell 提供的面板控制） */
