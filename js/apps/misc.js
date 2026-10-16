/* ==========================================================================
   apps/misc.js — 計算機 · 文字編輯 · 關於這台 Mac
   ========================================================================== */
'use strict';

(function () {
  const el = MAC.util.el;

  /* ============================== 計算機 ============================== */
  MAC.defApp({
    id: 'calculator', name: '計算機', icon: 'calculator',
    win: { w: 288, h: 416, min: [240, 340] },
    menus: () => ({
      '檔案': [{ label: '新建計算機視窗', key: '⌘N', action: () => MAC.wm.open('calculator') }],
      '編輯': [{ label: '拷貝結果', key: '⌘C', action: (win) => MAC.bus.emit('clipboard', win.out.textContent) }],
      '顯示方式': [
        { label: '基本', checked: true, action: () => {} },
        { label: '工程用', dis: true },
      ],
    }),
    render(win) {
      const wrap = el('div', 'calc');
      const out = el('div', { cls: 'calc-out', text: '0' });
      const keys = el('div', 'calc-keys');
      win.out = out;

      const layout = [
        ['AC', 'fn'], ['±', 'fn'], ['%', 'fn'], ['÷', 'op'],
        ['7'], ['8'], ['9'], ['×', 'op'],
        ['4'], ['5'], ['6'], ['−', 'op'],
        ['1'], ['2'], ['3'], ['+', 'op'],
        ['0'], ['.'], ['=', 'op'],
      ];
      /* 計算機狀態機：display 為字串，acc 為累計值，op 為待運算子 */
      const st = { display: '0', acc: null, op: null, fresh: true };

      const compute = (a, b, op) => {
        switch (op) {
          case '÷': return b === 0 ? NaN : a / b;
          case '×': return a * b;
          case '−': return a - b;
          case '+': return a + b;
        }
        return b;
      };
      const fmt = (n) => {
        if (!isFinite(n) || isNaN(n)) return '錯誤';
        const r = Math.round(n * 1e10) / 1e10;
        const s = String(r);
        return s.length > 13 ? Number(r).toExponential(6) : s;
      };
      const paint = () => {
        out.textContent = st.display;
        util.$$('.calc-key', keys).forEach((b) => b.classList.toggle('on', b.dataset.k === st.op));
      };
      const press = (k) => {
        if (/^[0-9]$/.test(k)) {
          st.display = (st.fresh || st.display === '0' || st.display === '錯誤') ? k : st.display + k;
          st.fresh = false;
          if (st.display.replace(/[^0-9]/g, '').length > 12) st.display = st.display.slice(0, 13);
        } else if (k === '.') {
          if (st.fresh || st.display === '錯誤') { st.display = '0.'; st.fresh = false; }
          else if (st.display.indexOf('.') < 0) st.display += '.';
        } else if (k === 'AC') {
          st.display = '0'; st.acc = null; st.op = null; st.fresh = true;
        } else if (k === '±') {
          st.display = st.display.charAt(0) === '-' ? st.display.slice(1) : (st.display === '0' ? '0' : '-' + st.display);
        } else if (k === '%') {
          st.display = fmt(parseFloat(st.display) / 100);
        } else if (k === '=') {
          if (st.op != null && st.acc != null) {
            st.display = fmt(compute(st.acc, parseFloat(st.display), st.op));
            st.acc = null; st.op = null; st.fresh = true;
          }
        } else {                                   // ÷ × − +
          const cur = parseFloat(st.display);
          if (st.op != null && !st.fresh && st.acc != null) {
            st.acc = compute(st.acc, cur, st.op);
            st.display = fmt(st.acc);
          } else {
            st.acc = isNaN(cur) ? 0 : cur;
          }
          st.op = k; st.fresh = true;
        }
        paint();
      };

      layout.forEach(([k, cls]) => {
        const b = el('button', { cls: 'calc-key' + (cls ? ' ' + cls : ''), text: k, attrs: { 'data-k': k } });
        if (k === '0') b.style.gridColumn = 'span 2';
        b.addEventListener('click', () => press(k));
        keys.appendChild(b);
      });
      const keydown = (e) => {
        if (MAC.wm.focused !== win.id) return;
        const map = { '/': '÷', '*': '×', '-': '−', '+': '+', Enter: '=', '=': '=', Escape: 'AC', Backspace: 'AC', '%': '%' };
        const k = map[e.key] || e.key;
        if (/^[0-9.]$/.test(k) || ['÷', '×', '−', '+', '=', 'AC', '%'].indexOf(k) >= 0) {
          e.preventDefault(); press(k);
        }
      };
      win.cleanup = () => document.removeEventListener('keydown', keydown);
      document.addEventListener('keydown', keydown);
      paint();

      wrap.appendChild(out); wrap.appendChild(keys);
      return wrap;
    },
    onClose(win) { if (win.cleanup) win.cleanup(); },
  });

  /* ============================ 文字編輯 ============================ */
  MAC.defApp({
    id: 'textedit', name: '文字編輯', icon: 'textedit', inDock: false, singleton: false,
    win: { w: 660, h: 520, min: [420, 300] },
    menus: (win) => ({
      '檔案': [
        { label: '儲存', key: '⌘S', action: (w) => save(w) },
        { label: '另存新檔…', dis: true },
        { sep: true },
        { label: '關閉', key: '⌘W', action: (w) => MAC.wm.close(w.id) },
      ],
      '編輯': [
        { label: '還原', key: '⌘Z', action: (w) => document.execCommand('undo') },
        { label: '重做', key: '⇧⌘Z', action: () => document.execCommand('redo') },
      ],
      '格式': [
        { label: '粗體', key: '⌘B', action: () => document.execCommand('bold') },
        { label: '斜體', key: '⌘I', action: () => document.execCommand('italic') },
      ],
    }),
    toolbar(win) {
      const bar = el('div', 'app-toolbar');
      bar.appendChild(el('button', { cls: 'icb', html: MAC.icon('sidebar'), title: '側邊欄' }));
      bar.appendChild(el('div', 'tsep'));
      const name = el('b', { text: MAC.util.base(win.opts && win.opts.path ? win.opts.path : '未命名.txt'), style: 'font-size:12.5px' });
      bar.appendChild(name);
      const save = el('button', { cls: 'btn primary', text: '儲存', style: 'margin-left:auto' });
      save.addEventListener('click', () => saveFile(win));
      bar.appendChild(save);
      win.saveBtn = save;
      return bar;
    },
    render(win) {
      const page = el('div', { cls: 'set-main', style: 'background:var(--content-bg)' });
      const file = win.opts && win.opts.path;
      const text = file ? (MAC.fs.read(file) || '') : '';
      const area = el('div', {
        cls: 'nt-body', attrs: { contenteditable: 'true', spellcheck: 'false' },
        html: MAC.util.esc(text).replace(/\n/g, '<br>') || '開始輸入…',
      });
      area.style.minHeight = '100%';
      area.addEventListener('focus', () => { if (area.textContent === '開始輸入…') area.innerHTML = ''; });
      page.appendChild(area);
      win.area = area;
      win.filePath = file;
      if (file) win.setTitle(MAC.util.base(file));
      return page;
    },
    onClose(win) { if (win.filePath) saveFile(win, true); },
  });

  function saveFile(win, quiet) {
    if (!win.filePath) {
      win.filePath = MAC.util.joinPath(MAC.fs.home + '/文件', '未命名文件.txt');
      win.setTitle(MAC.util.base(win.filePath));
    }
    const text = win.area.innerText.replace(/\n{3,}/g, '\n\n');
    MAC.fs.write(win.filePath, text);
    if (!quiet) MAC.bus.emit('toast', '已儲存 ' + MAC.util.base(win.filePath), MAC.icon('check'));
    if (win.saveBtn) { win.saveBtn.textContent = '已儲存'; setTimeout(() => (win.saveBtn.textContent = '儲存'), 1200); }
  }
  function save(win) { saveFile(win); }

  /* ========================== 關於這台 Mac ========================== */
  MAC.defApp({
    id: 'about', name: '關於這台 Mac', icon: 'about', inDock: false,
    win: { w: 420, h: 430, min: [420, 430] },
    menus: () => ({ '視窗': [{ label: '關閉', key: '⌘W', action: (win) => MAC.wm.close(win.id) }] }),
    render(win) {
      const wrap = el('div', { cls: 'about' });
      wrap.innerHTML =
        '<div class="a-logo">' + MAC.icon('apple') + '</div>' +
        '<h2>macOS 桌面環境模擬器</h2>' +
        '<div class="a-model">MacBook Pro（14 吋，2026）</div>';
      const specs = el('div', 'a-specs');
      [
        ['晶片', 'Apple M5 Pro'],
        ['記憶體', '36 GB'],
        ['啟動磁碟', 'Macintosh HD'],
        ['序列號', 'C02SIM-' + String(new Date().getFullYear()) + 'M4'],
        ['作業系統', 'macOS ' + MAC.version],
        ['繪製引擎', 'HTML · CSS · JavaScript'],
      ].forEach(([k, v]) => {
        specs.appendChild(el('div', { cls: 'set-row', html: '<span class="lbl">' + k + '</span><span class="val">' + v + '</span>' }));
      });
      wrap.appendChild(specs);
      const row = el('div', { style: 'display:flex;gap:10px;margin-top:18px' });
      const more = el('button', { cls: 'btn', text: '更多資訊…' });
      more.addEventListener('click', () => MAC.openApp('settings', { section: 'general' }));
      const ok = el('button', { cls: 'btn primary', text: '好' });
      ok.addEventListener('click', () => MAC.wm.close(win.id));
      row.appendChild(more); row.appendChild(ok);
      wrap.appendChild(row);
      return wrap;
    },
  });
})();
