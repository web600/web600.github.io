/* ==========================================================================
   apps/settings.js — 系統設定
   每個控制項都直接寫入 MAC.store，並訂閱 'state:<key>' 即時反映外部變更
   （例如用終端機改主題、或用控制中心拉亮度，這裡的 UI 會同步更新）。
   ========================================================================== */
'use strict';

(function () {
  const el = MAC.util.el;
  const S = () => MAC.store;

  const ACCENTS = [
    ['#0a84ff', '藍色'], ['#bf5af2', '紫色'], ['#ff375f', '粉紅'], ['#ff453a', '紅色'],
    ['#ff9f0a', '橘色'], ['#ffd60a', '黃色'], ['#32d74b', '綠色'], ['#8e8e93', '石墨'],
  ];
  const WALLS = [
    ['aurora', '極光夜幕'], ['sunset', '暮色緋紅'], ['graphite', '石墨深空'], ['mint', '晨曦薄荷'],
  ];

  const PANES = [
    { id: 'appearance', name: '外觀', ic: 'sun' },
    { id: 'wallpaper', name: '桌面圖片', ic: 'image' },
    { id: 'dock', name: '桌面與 Dock', ic: 'desktop' },
    { id: 'control', name: '控制中心', ic: 'sliders' },
    { id: 'battery', name: '電池', ic: 'cpu' },
    { id: 'privacy', name: '隱私權與安全性', ic: 'shield' },
    { id: 'general', name: '一般', ic: 'gear' },
  ];

  /* ------------------------- 共用小元件 ------------------------- */
  function row(label, right, hint) {
    const r = el('div', 'set-row');
    r.appendChild(el('span', { cls: 'lbl', text: label }));
    const box = el('span', 'val');
    box.appendChild(right);
    r.appendChild(box);
    if (hint) r.title = hint;
    return r;
  }
  function seg(items, get, onPick) {
    const s = el('div', 'seg');
    items.forEach((it) => {
      const b = el('button', { text: it[1] });
      b.addEventListener('click', () => { onPick(it[0]); paint(); });
      s.appendChild(b);
    });
    function paint() { util.$$('button', s).forEach((b, i) => b.classList.toggle('on', items[i][0] === get())); }
    paint();
    s.repaint = paint;
    return s;
  }
  function slider(min, max, step, get, set) {
    const w = el('div', 'sl-wrap');
    const i = el('input', { cls: 'sl', attrs: { type: 'range', min: min, max: max, step: step } });
    i.value = get();
    i.addEventListener('input', () => set(parseFloat(i.value)));
    w.appendChild(el('span', { html: MAC.icon('minus', { sw: 2 }), style: 'color:var(--text-3);display:flex' }));
    w.appendChild(i);
    w.appendChild(el('span', { html: MAC.icon('plus', { sw: 2 }), style: 'color:var(--text-3);display:flex' }));
    w.sync = () => { i.value = get(); };
    return w;
  }
  function toggle(get, set) {
    const b = el('button', { cls: 'switch' + (get() ? ' on' : '') });
    b.addEventListener('click', () => { set(!get()); b.classList.toggle('on', !!get()); });
    b.sync = () => b.classList.toggle('on', !!get());
    return b;
  }

  MAC.defApp({
    id: 'settings', name: '系統設定', icon: 'settings',
    win: { w: 780, h: 560, min: [620, 420], best: [880, 640] },

    menus: (win) => ({
      '檔案': [{ label: '關閉', key: '⌘W', action: () => MAC.wm.close(win.id) }],
      '顯示方式': [
        { label: '全部顯示', action: () => open(win, 'appearance') },
        { sep: true },
        ...PANES.map((p) => ({ label: p.name, checked: win.st && win.st.pane === p.id, action: () => open(win, p.id) })),
      ],
      '視窗': [
        { label: '縮到最小', key: '⌘M', action: () => MAC.wm.minimize(win.id) },
        { label: '重設所有設定…', action: () => resetAll(win) },
      ],
    }),

    render(win) {
      const st = win.st = { pane: (win.opts && win.opts.section) || 'appearance' };
      const wrap = el('div', 'set');

      const side = el('div', 'side');
      side.style.width = '206px';
      const searchBox = el('div', 'nt-search');
      const sb = el('label', { cls: 'fnd-search', style: 'margin:0 0 6px;width:100%', html: MAC.icon('search', { sw: 1.8 }) });
      const si = el('input', { attrs: { type: 'text', placeholder: '搜尋設定', spellcheck: 'false' }, style: 'width:100%' });
      sb.appendChild(si);
      searchBox.appendChild(sb);
      side.appendChild(searchBox);
      PANES.forEach((p) => {
        const r = el('div', { cls: 'it', html: '<span class="ic">' + MAC.icon(p.ic, { sw: 1.7 }) + '</span><span>' + p.name + '</span>' });
        r.dataset.pane = p.id;
        r.addEventListener('click', () => open(win, p.id));
        side.appendChild(r);
      });
      si.addEventListener('input', () => {
        const q = si.value.trim().toLowerCase();
        util.$$('[data-pane]', side).forEach((r) => {
          const p = PANES.filter((x) => x.id === r.dataset.pane)[0];
          r.style.display = (!q || p.name.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
        });
      });

      const main = el('div', 'set-main scroll');
      wrap.appendChild(side); wrap.appendChild(main);
      win.setPane = (id) => open(win, id);

      const syncers = [];
      win.st.refresh = () => { syncers.forEach((f) => { try { f(); } catch (e) {} }); };

      function open(w, id) {
        st.pane = id;
        util.$$('[data-pane]', side).forEach((r) => r.classList.toggle('on', r.dataset.pane === id));
        main.innerHTML = '';
        syncers.length = 0;
        const pane = PANES.filter((p) => p.id === id)[0] || PANES[0];
        main.appendChild(el('h1', { cls: 'set-head', text: pane.name }));
        main.appendChild(el('div', { cls: 'set-sub', text: subOf(id) }));
        ({ appearance: appearancePane, wallpaper: wallpaperPane, dock: dockPane, control: controlPane, battery: batteryPane, privacy: privacyPane, general: generalPane }[id] || appearancePane)(main, win, syncers);
        main.scrollTop = 0;
      }

      /* 訂閱所有狀態變更：任何來源改動都會讓控制項同步 */
      const off = MAC.bus.on('state', () => win.st.refresh && win.st.refresh());
      win.offState = () => off();
      open(win, st.pane);

      /* 讓外部（例如重設）能重新載入 */
      win.setPane = (id) => open(win, id);
      win.reopen = () => open(win, st.pane);
      return wrap;
    },
    onClose(win) { if (win.offState) win.offState(); win.st = null; },
  });

  function open(win, id) { if (win.setPane) win.setPane(id); }

  function resetAll(win) {
    MAC.store.reset();
    if (win.reopen) win.reopen();
    MAC.bus.emit('toast', '所有設定已回到預設值');
    setTimeout(() => location.reload(), 600);
  }

  function subOf(id) {
    return {
      appearance: '選擇淺色或深色外觀，並挑選系統強調色。',
      wallpaper: '桌布以純 SVG 程序化繪製，切換後立即套用於桌面。',
      dock: '調整 Dock 大小、放大效果與位置，以及選單列顯示方式。',
      control: '決定控制中心與通知中心顯示的項目。',
      battery: '檢視電池狀態與省電選項。',
      privacy: '管理應用程式對檔案、相機與位置的存取權限。',
      general: '關於本機資訊與資料重設。',
    }[id];
  }

  /* --------------------------- 各面板 --------------------------- */
  function card(parent) { const c = el('div', 'set-card'); parent.appendChild(c); return c; }

  function appearancePane(main, win, syncers) {
    const c = card(main);
    const s = seg([['light', '淺色'], ['dark', '深色'], ['auto', '自動']], () => S().get('appearance'),
      (v) => { S().set('appearance', v); MAC.bus.emit('toast', '外觀：' + ({ light: '淺色', dark: '深色', auto: '自動' }[v])); });
    c.appendChild(row('外觀模式', s));
    syncers.push(s.repaint);

    const sw = el('div', 'swatches');
    ACCENTS.forEach(([hex, name]) => {
      const b = el('button', { cls: 'swatch' + (S().get('accent') === hex ? ' on' : ''), attrs: { title: name }, style: 'background:' + hex + ';--sw:' + hex });
      b.addEventListener('click', () => { S().set('accent', hex); MAC.bus.emit('toast', '強調色：' + name); });
      sw.appendChild(b);
    });
    const c2 = card(main);
    c2.appendChild(row('強調色', sw));
    syncers.push(() => util.$$('.swatch', sw).forEach((b, i) => b.classList.toggle('on', ACCENTS[i][0] === S().get('accent'))));

    const c3 = card(main);
    c3.appendChild(row('醒目提示顏色', el('span', { cls: 'swatch on', style: 'background:' + S().get('accent') })));
    c3.appendChild(row('側邊欄圖示大小', seg([['s', '小'], ['m', '中'], ['l', '大']], () => 'm', () => MAC.bus.emit('toast', '側邊欄圖示大小已更新')), '示範用控制項'));
    c3.appendChild(row('允許桌布著色', toggle(() => S().get('stageManager'), (v) => S().set('stageManager', v)), '讓系統依桌布微調視窗色調'));
    syncers.push(() => {
      util.$$('.switch', c3).forEach((b) => b.sync && b.sync());
      const chip = util.$('.swatch', util.$$('.set-row', c3)[0]);
      if (chip) chip.style.background = S().get('accent');
    });

    main.appendChild(el('div', { cls: 'set-note', text: '提示：外觀與強調色會即時套用到整個系統，包括選單列、視窗、Dock 與所有應用程式。' }));
  }

  function wallpaperPane(main, win, syncers) {
    const c = card(main);
    const grid = el('div', 'wp-grid');
    WALLS.forEach(([id, name]) => {
      const b = el('button', { cls: 'wp' + (S().get('wallpaper') === id ? ' on' : ''), style: 'background-image:url("assets/wallpapers/' + id + '.svg")' });
      b.innerHTML = '<b>' + name + '</b>';
      b.addEventListener('click', () => { S().set('wallpaper', id); MAC.bus.emit('toast', '桌布：' + name); });
      grid.appendChild(b);
    });
    c.appendChild(grid);
    syncers.push(() => util.$$('.wp', grid).forEach((b, i) => b.classList.toggle('on', WALLS[i][0] === S().get('wallpaper'))));
    const c2 = card(main);
    c2.appendChild(row('動態桌布', toggle(() => false, () => MAC.bus.emit('toast', '此示範僅提供靜態桌布')), '依時間自動更換'));
    c2.appendChild(row('顯示於登入畫面', toggle(() => true, () => {})));
  }

  function dockPane(main, win, syncers) {
    const c = card(main);
    const size = slider(34, 72, 2, () => S().get('dock.size'), (v) => S().set('dock.size', v));
    c.appendChild(row('Dock 大小', size));
    syncers.push(size.sync);
    const mag = toggle(() => S().get('dock.magnify'), (v) => S().set('dock.magnify', v));
    c.appendChild(row('放大效果', mag));
    const amt = slider(1.2, 2.2, 0.1, () => S().get('dock.magnitude'), (v) => S().set('dock.magnitude', v));
    c.appendChild(row('放大比例', amt));
    syncers.push(amt.sync, mag.sync);
    const pos = seg([['left', '左側'], ['bottom', '底部'], ['right', '右側']], () => S().get('dock.position'), (v) => S().set('dock.position', v));
    c.appendChild(row('位置', pos));
    syncers.push(pos.repaint);
    const hide = toggle(() => S().get('dock.autohide'), (v) => S().set('dock.autohide', v));
    c.appendChild(row('自動隱藏與顯示 Dock', hide));
    syncers.push(hide.sync);

    const c2 = card(main);
    const mbHide = toggle(() => S().get('menubar.autohide'), (v) => S().set('menubar.autohide', v));
    c2.appendChild(row('自動隱藏選單列', mbHide));
    const pct = toggle(() => S().get('menubar.showPercent'), (v) => S().set('menubar.showPercent', v));
    c2.appendChild(row('顯示電池百分比', pct));
    const secs = toggle(() => S().get('menubar.clockSeconds'), (v) => S().set('menubar.clockSeconds', v));
    c2.appendChild(row('顯示時鐘秒數', secs));
    syncers.push(mbHide.sync, pct.sync, secs.sync);
  }

  function controlPane(main, win, syncers) {
    const c = card(main);
    [['wifi', 'Wi-Fi'], ['bluetooth', '藍牙'], ['airdrop', 'AirDrop'], ['dnd', '勿擾模式'], ['night', '夜覽'], ['stageManager', '幕前調度']].forEach(([key, label]) => {
      const t = toggle(() => S().get(key), (v) => { S().set(key, v); MAC.bus.emit('toast', label + '：' + (v ? '開啟' : '關閉')); });
      c.appendChild(row('在控制中心顯示 ' + label, t));
      syncers.push(t.sync);
    });
    main.appendChild(el('div', { cls: 'set-note', text: '這些開關與控制中心共用同一份狀態：在此切換，控制中心會立即同步，反之亦然。' }));
  }

  function batteryPane(main, win, syncers) {
    const c = card(main);
    const pct = S().get('menubar.battery');
    c.appendChild(row('電池電量', el('b', { text: pct + '%' })));
    const chg = toggle(() => S().get('menubar.charging'), (v) => S().set('menubar.charging', v));
    c.appendChild(row('連接電源', chg));
    c.appendChild(row('低耗電模式', toggle(() => S().get('lowPower'), (v) => S().set('lowPower', v))));
    syncers.push(chg.sync, () => {});
    const c2 = card(main);
    c2.appendChild(row('上次充電', el('span', { text: '昨天 22:41', style: 'color:var(--text-2)' })));
    c2.appendChild(row('循環使用次數', el('span', { text: '128 次', style: 'color:var(--text-2)' })));
    c2.appendChild(row('電池健康度', el('span', { text: '98%', style: 'color:var(--text-2)' })));
    c2.appendChild(row('螢幕開啟時間', el('span', { text: '5 小時 12 分', style: 'color:var(--text-2)' })));
  }

  function privacyPane(main, win, syncers) {
    const c = card(main);
    [['檔案與檔案夾', 'doc', '12 個 App'], ['相機', 'eye', '4 個 App'], ['麥克風', 'mic', '6 個 App'],
     ['定位服務', 'pin', '9 個 App'], ['完全取用磁碟', 'hdd', '關閉'], ['開發者模式', 'terminal', '開啟']].forEach(([n, ic, v]) => {
      const r = el('div', 'set-row');
      r.appendChild(el('span', { html: MAC.icon(ic, { sw: 1.6 }), style: 'display:flex;color:var(--accent)' }));
      r.appendChild(el('span', { text: n }));
      r.appendChild(el('span', { cls: 'val', html: '<span style="color:var(--text-2)">' + v + '</span>' + MAC.icon('chevron-right', { sw: 1.8 }) }));
      r.style.cursor = 'default';
      r.addEventListener('click', () => MAC.bus.emit('toast', '「' + n + '」權限為唯讀示範'));
      c.appendChild(r);
    });
    main.appendChild(el('div', { cls: 'set-note', text: '此為模擬環境：權限清單僅供示意，不會存取真實系統資源。' }));
  }

  function generalPane(main, win, syncers) {
    const c = card(main);
    c.appendChild(row('名稱', el('span', { text: 'Apple 使用者', style: 'color:var(--text-2)' })));
    c.appendChild(row('軟體版本', el('span', { text: 'macOS 模擬器 ' + MAC.version, style: 'color:var(--text-2)' })));
    c.appendChild(row('儲存空間', el('span', { text: '62 GB / 994 GB', style: 'color:var(--text-2)' })));
    const about = el('button', { cls: 'btn', text: '開啟「關於這台 Mac」' });
    about.addEventListener('click', () => MAC.openApp('about'));
    c.appendChild(row('關於本機', about));

    const c2 = card(main);
    const reset = el('button', { cls: 'btn', text: '回復所有設定' });
    reset.addEventListener('click', () => resetAll(win));
    c2.appendChild(row('重設', reset, '會清除 localStorage 中的主題、桌布、Dock 與備忘錄'));
    const clearNotes = el('button', { cls: 'btn', text: '清除通知' });
    clearNotes.addEventListener('click', () => { S().set('notifications', []); MAC.bus.emit('toast', '已清除所有通知'); });
    c2.appendChild(row('通知', clearNotes));
    main.appendChild(el('div', { cls: 'set-note', text: '所有設定即時寫入 localStorage，重新整理後仍會保留。' }));
  }
})();
