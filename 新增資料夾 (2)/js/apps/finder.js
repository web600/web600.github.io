/* ==========================================================================
   apps/finder.js — Finder 檔案總管
   與 MAC.fs（虛擬檔案系統）連動；雙擊 .app 會開啟對應應用程式，
   雙擊文字檔會交給「文字編輯」開啟 —— 示範跨 App 協作。
   ========================================================================== */
'use strict';

(function () {
  const el = MAC.util.el;
  const F = MAC.fs;

  const SIDEBAR = [
    { grp: '常用項目', items: [
      { n: 'AirDrop', ic: 'airdrop', path: 'airdrop' },
      { n: '最近使用', ic: 'clock', path: 'recent' },
      { n: '應用程式', ic: 'apps', path: '/應用程式' },
      { n: '桌面', ic: 'desktop', path: '/Users/apple/桌面' },
      { n: '文件', ic: 'doc', path: '/Users/apple/文件' },
      { n: '下載項目', ic: 'download', path: '/Users/apple/下載項目' },
      { n: '圖片', ic: 'image', path: '/Users/apple/圖片' },
      { n: '音樂', ic: 'music', path: '/Users/apple/音樂' },
    ] },
    { grp: 'iCloud', items: [{ n: 'iCloud 雲碟', ic: 'cloud', path: 'icloud' }] },
    { grp: '位置', items: [
      { n: 'Macintosh HD', ic: 'hdd', path: '/' },
      { n: '網路', ic: 'globe', path: 'net' },
    ] },
  ];

  function iconBox(it, size) {
    const fi = MAC.icons.fileIcon(it);
    return '<span class="ic" style="color:' + (fi.color || 'currentColor') + '">' + fi.svg + '</span>';
  }

  MAC.defApp({
    id: 'finder', name: 'Finder', icon: 'finder', singleton: false,
    win: { w: 880, h: 556, min: [600, 380], best: [1120, 720] },

    menus(win) {
      const s = win.st = win.st || defaultState(win);   // 選單可能在工具列建立前被取用
      const viewItem = (label, mode) => ({ label: label, key: mode === 'grid' ? '⌘1' : mode === 'list' ? '⌘2' : '⌘3', checked: s.view === mode, action: () => setView(win, mode) });
      return {
        '檔案': [
          { label: '新增 Finder 視窗', key: '⌘N', action: () => MAC.openApp('finder') },
          { label: '新增檔案夾', key: '⇧⌘N', action: () => newFolder(win) },
          { label: '新增標籤', key: '⌃⌘T', action: () => MAC.bus.emit('toast', '已加上「重要」標籤 ' + MAC.icon('tag')) },
          { sep: true },
          { label: '取得資訊', key: '⌘I', dis: !s.sel, action: () => info(win) },
          { label: '重新命名', dis: !s.sel, action: () => rename(win) },
          { label: '丟到垃圾桶', key: '⌘⌫', dis: !s.sel, action: () => trash(win) },
          { sep: true },
          { label: '關閉視窗', key: '⌘W', action: () => MAC.wm.close(win.id) },
        ],
        '編輯': [
          { label: '還原', key: '⌘Z', dis: true },
          { sep: true },
          { label: '拷貝', key: '⌘C', action: () => MAC.bus.emit('clipboard', s.sel ? s.sel.path : '') },
          { label: '貼上項目', key: '⌘V', dis: true },
          { label: '全選', key: '⌘A', action: () => selectAll(win) },
        ],
        '顯示方式': [
          viewItem('圖示', 'grid'), viewItem('列表', 'list'), viewItem('直欄', 'columns'),
          { sep: true },
          { label: '排序方式：名稱', checked: s.sort === 'name', action: () => setSort(win, 'name') },
          { label: '排序方式：日期', checked: s.sort === 'date', action: () => setSort(win, 'date') },
          { label: '排序方式：大小', checked: s.sort === 'size', action: () => setSort(win, 'size') },
          { sep: true },
          { label: '顯示路徑列', checked: s.crumb, action: () => { win.st.crumb = !win.st.crumb; refresh(win); } },
          { label: '顯示狀態列', checked: s.status, action: () => { win.st.status = !win.st.status; refresh(win); } },
        ],
        '前往': [
          { label: '上一頁', key: '⌘[', action: () => goBack(win) },
          { label: '下一頁', key: '⌘]', action: () => goFwd(win) },
          { label: '上層檔案夾', key: '⌘↑', action: () => go(win, util.dirname(win.st.path)) },
          { sep: true },
          { label: '個人專屬', key: '⇧⌘H', action: () => go(win, F.home) },
          { label: '桌面', key: '⇧⌘D', action: () => go(win, F.home + '/桌面') },
          { label: '文件', key: '⇧⌘O', action: () => go(win, F.home + '/文件') },
          { label: '下載項目', key: '⌥⌘L', action: () => go(win, F.home + '/下載項目') },
          { label: '應用程式', key: '⇧⌘A', action: () => go(win, '/應用程式') },
        ],
        '視窗': [
          { label: '縮到最小', key: '⌘M', action: () => MAC.wm.minimize(win.id) },
          { label: '縮放', action: () => MAC.wm.zoom(win.id) },
          { label: '進入全螢幕', key: '⌃⌘F', action: () => MAC.wm.toggleFull(win.id) },
        ],
        '輔助說明': [
          { label: 'Finder 使用手冊', action: () => MAC.bus.emit('toast', '雙擊項目開啟，⌘↑ 回到上層，拖曳視窗到邊緣可分割畫面') },
          { label: 'macOS 桌面環境使用手冊', action: () => MAC.bus.emit('toast', '完整說明請見 README.md') },
        ],
      };
    },

    toolbar(win) {
      const s = win.st = win.st || defaultState(win);
      const tb = el('div', 'fnd-tools');
      const back = el('button', { cls: 'icb', html: MAC.icon('chevron-left'), title: '上一頁' });
      const fwd = el('button', { cls: 'icb', html: MAC.icon('chevron-right'), title: '下一頁' });
      back.addEventListener('click', () => goBack(win));
      fwd.addEventListener('click', () => goFwd(win));
      win.backBtn = back; win.fwdBtn = fwd;
      tb.appendChild(back); tb.appendChild(fwd);
      tb.appendChild(el('div', 'tsep'));

      const seg = el('div', 'seg');
      [['grid', 'grid', '圖示'], ['list', 'list', '列表'], ['columns', 'columns', '直欄']].forEach(([mode, ic, title]) => {
        const b = el('button', { html: MAC.icon(ic), title: title });
        b.addEventListener('click', () => setView(win, mode));
        seg.appendChild(b);
      });
      win.viewSeg = seg;
      tb.appendChild(seg);
      tb.appendChild(el('div', 'tsep'));

      const sortBtn = el('button', { cls: 'icb', html: MAC.icon('sort'), title: '排序方式' });
      sortBtn.addEventListener('click', (e) => {
        MAC.ui.ctxMenu(e, [
          { label: '名稱', checked: s.sort === 'name', action: () => setSort(win, 'name') },
          { label: '日期', checked: s.sort === 'date', action: () => setSort(win, 'date') },
          { label: '大小', checked: s.sort === 'size', action: () => setSort(win, 'size') },
        ]);
      });
      tb.appendChild(sortBtn);
      const share = el('button', { cls: 'icb', html: MAC.icon('share'), title: '分享' });
      share.addEventListener('click', () => MAC.bus.emit('toast', '已建立分享連結 ' + MAC.icon('link')));
      tb.appendChild(share);
      const tagBtn = el('button', { cls: 'icb', html: MAC.icon('tag'), title: '標籤' });
      tagBtn.addEventListener('click', () => MAC.bus.emit('toast', '已標記為「重要」'));
      tb.appendChild(tagBtn);

      const search = el('label', { cls: 'fnd-search', html: MAC.icon('search', { sw: 1.8 }) });
      const input = el('input', { attrs: { type: 'text', placeholder: '搜尋', spellcheck: 'false' } });
      input.addEventListener('input', () => { win.st.query = input.value.trim(); refresh(win); });
      search.appendChild(input);
      tb.appendChild(search);

      const crumb = el('div', 'fnd-crumb');
      win.crumbEl = crumb;
      return tb;
    },

    render(win) {
      const s = win.st;
      const wrap = el('div', 'fnd');
      const side = el('div', 'side');
      SIDEBAR.forEach((group) => {
        side.appendChild(el('div', { cls: 'grp', text: group.grp }));
        group.items.forEach((it) => {
          const row = el('div', { cls: 'it', html: '<span class="ic">' + MAC.icon(it.ic, { sw: 1.7 }) + '</span><span>' + it.n + '</span>' });
          row.dataset.path = it.path;
          row.addEventListener('click', () => go(win, it.path));
          side.appendChild(row);
        });
      });
      const tags = el('div', { cls: 'grp', text: '標籤' });
      side.appendChild(tags);
      ['紅', '橘', '黃', '綠', '藍', '紫'].forEach((c, i) => {
        const colors = ['#ff5f57', '#ff9f0a', '#ffd60a', '#32d74b', '#0a84ff', '#bf5af2'];
        const row = el('div', { cls: 'it', html: '<span class="ic" style="color:' + colors[i] + '">' + MAC.icon('tag', { sw: 1.7 }) + '</span><span>' + c + '</span>' });
        row.addEventListener('click', () => MAC.bus.emit('toast', '篩選「' + c + '」標籤項目'));
        side.appendChild(row);
      });
      wrap.appendChild(side);
      win.sideEl = side;

      const main = el('div', 'fnd-main');
      const content = el('div', 'fnd-content scroll');
      win.contentEl = content;
      main.appendChild(content);
      const st = el('div', 'fnd-st');
      win.statusEl = st;
      main.appendChild(st);
      wrap.appendChild(main);

      go(win, s.path, true);
      return wrap;
    },

    onClose(win) { win.st = null; },
  });

  function defaultState(win) {
    return {
      path: (win.opts && win.opts.path) || F.home + '/桌面',
      view: 'grid', sort: 'name', sel: null, history: [], hi: -1, crumb: false, status: true, query: '',
    };
  }

  /* ----------------------------- 導覽 ----------------------------- */
  function go(win, path, initial) {
    const s = win.st;
    if (path === 'airdrop' || path === 'icloud' || path === 'net') {
      MAC.bus.emit('toast', '此位置在模擬環境中沒有實際內容');
      return;
    }
    if (path === 'recent') path = F.home + '/下載項目';
    const node = F.find(path);
    if (!node) { MAC.bus.emit('toast', '找不到位置：' + path); return; }
    if (node.t !== 'dir') { openItem(win, { path: path, t: 'file', node: node, name: util.base(path), kind: node.kind }); return; }
    s.path = F.norm(path);
    s.sel = null;
    if (!initial) {
      s.history = s.history.slice(0, s.hi + 1);
      s.history.push(s.path);
      s.hi = s.history.length - 1;
    } else if (s.hi < 0) { s.history = [s.path]; s.hi = 0; }
    refresh(win);
  }
  function goBack(win) { const s = win.st; if (s.hi > 0) { s.hi--; s.path = s.history[s.hi]; s.sel = null; refresh(win); } }
  function goFwd(win) { const s = win.st; if (s.hi < s.history.length - 1) { s.hi++; s.path = s.history[s.hi]; s.sel = null; refresh(win); } }
  function setView(win, mode) { win.st.view = mode; refresh(win); }
  function setSort(win, sort) { win.st.sort = sort; refresh(win); }

  function items(win) {
    const s = win.st;
    let list = F.list(s.path);
    if (s.query) list = list.filter((i) => i.name.toLowerCase().indexOf(s.query.toLowerCase()) >= 0);
    if (s.sort === 'date') list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    if (s.sort === 'size') list.sort((a, b) => (b.size || 0) - (a.size || 0));
    return list;
  }

  function refresh(win) {
    const s = win.st, host = win.contentEl;
    if (!host) return;
    host.innerHTML = '';
    const list = items(win);
    const label = { grid: '圖示', list: '列表', columns: '直欄' };

    // 工具列狀態
    if (win.viewSeg) util.$$('button', win.viewSeg).forEach((b, i) => b.classList.toggle('on', ['grid', 'list', 'columns'][i] === s.view));
    if (win.backBtn) win.backBtn.classList.toggle('dis', s.hi <= 0);
    if (win.fwdBtn) win.fwdBtn.classList.toggle('dis', s.hi >= s.history.length - 1);
    if (win.crumbEl) {
      const parts = s.path.split('/').filter(Boolean);
      win.crumbEl.innerHTML = '';
      if (s.crumb) {
        let acc = '';
        [{ n: 'Macintosh HD', p: '/' }].concat(parts.map((p) => { acc += '/' + p; return { n: p, p: acc }; })).forEach((seg, i, arr) => {
          if (i === arr.length - 1) win.crumbEl.appendChild(el('b', { text: seg.n }));
          else {
            const a = el('button', { text: seg.n, style: 'color:var(--text-3)' });
            a.addEventListener('click', () => go(win, seg.p));
            win.crumbEl.appendChild(a);
            win.crumbEl.appendChild(el('span', { text: '›', style: 'opacity:.5' }));
          }
        });
      } else {
        win.crumbEl.appendChild(el('b', { text: util.base(s.path) || 'Macintosh HD' }));
      }
    }
    // 側邊欄選取狀態
    if (win.sideEl) util.$$('.it', win.sideEl).forEach((r) => r.classList.toggle('on', r.dataset.path === s.path));

    win.setCaption((util.base(s.path) || 'Macintosh HD') + ' — ' + list.length + ' 個項目');

    if (!list.length) host.appendChild(el('div', { cls: 'fnd-empty', text: s.query ? '沒有符合「' + s.query + '」的項目' : '此檔案夾是空的' }));

    /* ---------- 圖示檢視 ---------- */
    if (s.view === 'grid') {
      const grid = el('div', 'fnd-grid');
      list.forEach((it) => {
        const cell = el('div', { cls: 'fitem' });
        // macOS 預設隱藏副檔名（列表檢視仍顯示完整檔名）
        const label = it.t === 'dir' ? it.name : it.name.replace(/\.[A-Za-z0-9]{1,6}$/, '');
        cell.innerHTML = iconBox(it, 54) + '<span>' + util.esc(label) + '</span>';
        cell.dataset.path = it.path;
        bindItem(win, cell, it);
        grid.appendChild(cell);
      });
      host.appendChild(grid);
    }

    /* ---------- 列表檢視 ---------- */
    if (s.view === 'list') {
      const tbl = el('table', 'fnd-rows');
      tbl.innerHTML = '<thead><tr><th style="width:44%">名稱</th><th style="width:22%">日期修改</th><th style="width:14%">大小</th><th style="width:20%">種類</th></tr></thead>';
      const tb = el('tbody');
      list.forEach((it) => {
        const tr = el('tr');
        tr.innerHTML = '<td><span class="nm">' + iconBox(it, 18) + util.esc(it.name) + '</span></td>' +
          '<td>' + (it.mtime ? MAC.util.rel(it.mtime) : '--') + '</td>' +
          '<td>' + (it.t === 'dir' ? '--' : MAC.util.bytes(it.size)) + '</td>' +
          '<td>' + kindOf(it) + '</td>';
        tr.dataset.path = it.path;
        bindItem(win, tr, it);
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      host.appendChild(tbl);
    }

    /* ---------- 直欄檢視 ---------- */
    if (s.view === 'columns') {
      const cols = el('div', 'fnd-cols');
      cols.style.height = '100%';
      const mk = (path) => {
        const col = el('div', 'fnd-col scroll');
        F.list(path).forEach((it) => {
          const row = el('div', { cls: 'fitem', style: 'flex-direction:row;justify-content:flex-start;gap:8px;padding:4px 6px;text-align:left' });
          row.innerHTML = iconBox(it, 18) + '<span>' + util.esc(it.name) + '</span>';
          row.dataset.path = it.path;
          bindItem(win, row, it, true);
          col.appendChild(row);
        });
        return col;
      };
      const chain = s.path.split('/').filter(Boolean);
      let acc = '';
      cols.appendChild(mk('/'));
      chain.forEach((p) => { acc += '/' + p; cols.appendChild(mk(acc)); });
      const prev = el('div', 'fnd-preview');
      prev.innerHTML = s.sel
        ? '<div style="text-align:center">' + iconBox(s.sel, 96) + '<div style="margin-top:12px;font-weight:600">' + util.esc(s.sel.name) + '</div>' +
          '<div style="color:var(--text-3);font-size:12px;margin-top:4px">' + kindOf(s.sel) + ' · ' + (s.sel.t === 'dir' ? '--' : MAC.util.bytes(s.sel.size)) + '</div></div>'
        : '<div style="color:var(--text-3);font-size:13px">選取項目以預覽</div>';
      cols.appendChild(prev);
      host.appendChild(cols);
    }

    // 狀態列
    if (win.statusEl) {
      win.statusEl.hidden = !s.status;
      win.statusEl.textContent = list.length + ' 個項目' + (s.sel ? ('，已選取 1 個') : '') + '，可用 994.6 GB';
      if (s.view === 'list') win.statusEl.textContent = list.length + ' 個項目';
    }
    // 反白已選取項目
    if (s.sel) util.$$('[data-path]', host).forEach((n) => n.classList.toggle('sel', n.dataset.path === s.sel.path));
  }

  function kindOf(it) {
    if (it.t === 'dir') return '檔案夾';
    if (it.kind === 'app') return '應用程式';
    if (/\.(md|txt|csv|js|css|html|json)$/i.test(it.name)) return '純文字文件';
    if (/\.(png|jpg|jpeg|svg)$/i.test(it.name)) return '影像';
    if (/\.(m4a|mp3)$/i.test(it.name)) return '音訊';
    return '文件';
  }

  function bindItem(win, node, it, colMode) {
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      win.st.sel = it;
      util.$$('[data-path]', win.contentEl).forEach((n) => n.classList.toggle('sel', n.dataset.path === it.path && n === node));
      node.classList.add('sel');
      if (win.st.view === 'columns') refresh(win);
      else if (win.statusEl) win.statusEl.textContent = '已選取「' + it.name + '」 · ' + kindOf(it) + ' · ' + (it.t === 'dir' ? '檔案夾' : MAC.util.bytes(it.size));
    });
    node.addEventListener('dblclick', () => openItem(win, it));
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      win.st.sel = it;
      MAC.ui.ctxMenu(e, [
        { label: '打開', action: () => openItem(win, it) },
        { label: '在「' + (it.t === 'dir' ? 'Finder' : '文字編輯') + '」中打開', action: () => openItem(win, it) },
        { sep: true },
        { label: '取得資訊', key: '⌘I', action: () => info(win) },
        { label: '重新命名', action: () => rename(win) },
        { label: '拷貝', key: '⌘C', action: () => MAC.bus.emit('clipboard', it.path) },
        { sep: true },
        { label: '加上標籤…', action: () => MAC.bus.emit('toast', '已加上「重要」標籤') },
        { label: '丟到垃圾桶', key: '⌘⌫', action: () => trash(win) },
      ]);
    });
  }

  function openItem(win, it) {
    if (it.t === 'dir') { go(win, it.path); return; }
    if (it.kind === 'app' || it.app) { MAC.openApp(it.app); return; }
    if (/\.(png|jpe?g|svg|heic)$/i.test(it.name)) { MAC.openApp('photos', { path: it.path }); return; }
    if (/\.(m4a|mp3|wav)$/i.test(it.name)) { MAC.openApp('music', { path: it.path }); return; }
    MAC.wm.open('textedit', { path: it.path, title: it.name });
  }

  function selectAll(win) { win.st.sel = null; util.$$('[data-path]', win.contentEl).forEach((n) => n.classList.add('sel')); }
  function info(win) {
    const it = win.st.sel; if (!it) return;
    MAC.bus.emit('toast', it.name + ' · ' + kindOf(it) + ' · ' + (it.t === 'dir' ? '檔案夾' : MAC.util.bytes(it.size)) + ' · 修改於 ' + MAC.util.rel(it.mtime));
  }
  function rename(win) {
    const it = win.st.sel; if (!it) return;
    // 使用系統級對話框（可主題化、非阻塞）而非原生 prompt
    MAC.ui.prompt({ title: '重新命名「' + it.name + '」', value: it.name, ok: '重新命名' }).then((name) => {
      if (!name || name === it.name) return;
      const body = it.node && it.node.t === 'file' ? (it.node.body || '') : null;
      F.rm(it.path);
      if (it.t === 'dir') F.mkdir(util.joinPath(util.dirname(it.path), name));
      else if (body != null) F.write(util.joinPath(util.dirname(it.path), name), body);
      win.st.sel = null;
      refresh(win);
      MAC.bus.emit('toast', '已重新命名為「' + name + '」');
    });
  }
  function trash(win) {
    const it = win.st.sel; if (!it) return;
    F.rm(it.path);
    win.st.sel = null;
    refresh(win);
    MAC.store.notify('finder', '垃圾桶', '「' + it.name + '」已移到垃圾桶。', 'trash');
    MAC.bus.emit('toast', '已移到垃圾桶 ' + MAC.icon('trash'));
  }
  function newFolder(win) {
    let name = '未命名檔案夾', i = 1;
    while (F.find(util.joinPath(win.st.path, name))) name = '未命名檔案夾 ' + i++;
    F.mkdir(util.joinPath(win.st.path, name));
    refresh(win);
    MAC.bus.emit('toast', '已新增「' + name + '」');
  }
})();
