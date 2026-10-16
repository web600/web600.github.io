/* ==========================================================================
   apps/terminal.js — 終端機
   一個真正可用的虛擬 shell：檔案操作走 MAC.fs（與 Finder 共用同一份資料），
   theme / wallpaper / volume / accent 等指令則直接改寫 MAC.store，
   因此能看到整個作業系統即時跟著改變 —— 這是狀態集中管理的最佳示範。
   ========================================================================== */
'use strict';

(function () {
  const el = MAC.util.el;
  const F = MAC.fs;

  /* ------------------------- 指令實作 ------------------------- */
  const CMD = {
    help() {
      return [
        '可用指令：',
        '  檔案   ls  cd  pwd  cat  mkdir  touch  rm  tree  find  open',
        '  系統   whoami  hostname  date  uname  sw_vers  df  ps  neofetch',
        '  設定   theme  wallpaper  accent  volume  brightness  notify  say',
        '  其他   clear  history  echo  which  apps  sudo  man  curl  exit',
        '  串接   指令可以用 && 連接：cd 專案 && ls',
        '',
        '提示：按 Tab 可自動補齊指令與路徑，↑ ↓ 可翻找歷史。',
      ].join('\n');
    },
    ls(a, c) {
      const target = a[0] ? c.resolve(a[0]) : c.cwd;
      const node = F.find(target);
      if (!node) return 'ls: ' + target + ': 沒有此檔案或目錄';
      if (node.t === 'file') return node.name;
      const items = F.list(target);
      if (!items.length) return '';
      return items.map((i) => (i.t === 'dir' ? i.name + '/' : i.name)).join('   ');
    },
    cd(a, c) {
      const target = a[0] ? c.resolve(a[0]) : F.home;
      const node = F.find(target);
      if (!node) return 'cd: ' + target + ': 沒有此目錄';
      if (node.t !== 'dir') return 'cd: ' + target + ': 不是目錄';
      c.cwd = F.norm(target);
      return '';
    },
    pwd(a, c) { return c.cwd; },
    cat(a, c) {
      if (!a[0]) return 'usage: cat <檔案>';
      const p = c.resolve(a[0]);
      const node = F.find(p);
      if (!node) return 'cat: ' + a[0] + ': 沒有此檔案';
      if (node.t === 'dir') return 'cat: ' + a[0] + ': 是一個目錄';
      return node.body || '(二進位檔案，無法顯示)';
    },
    mkdir(a, c) {
      if (!a[0]) return 'usage: mkdir <名稱>';
      const p = c.resolve(a[0]);
      return F.mkdir(p) ? '' : 'mkdir: ' + a[0] + ': 建立失敗（已存在或路徑無效）';
    },
    touch(a, c) {
      if (!a[0]) return 'usage: touch <檔案>';
      const p = c.resolve(a[0]);
      const ex = F.find(p);
      return (ex || F.write(p, '')) ? '' : 'touch: ' + a[0] + ': 無法建立';
    },
    rm(a, c) {
      if (!a[0]) return 'usage: rm <路徑>';
      const p = c.resolve(a[0]);
      return F.rm(p) ? '' : 'rm: ' + a[0] + ': 沒有此檔案';
    },
    tree(a, c) {
      const root = F.find(a[0] ? c.resolve(a[0]) : c.cwd);
      if (!root) return 'tree: 路徑不存在';
      const out = [];
      const rec = (n, pre, depth) => {
        if (depth > 3) return;
        const keys = Object.keys(n.c || {});
        keys.slice(0, 14).forEach((k, i) => {
          const last = i === keys.length - 1 || i === 13;
          const node = n.c[k];
          out.push(pre + (last ? '└── ' : '├── ') + k + (node.t === 'dir' ? '/' : ''));
          if (node.t === 'dir') rec(node, pre + (last ? '    ' : '│   '), depth + 1);
        });
        if (keys.length > 14) out.push(pre + '└── … 其餘 ' + (keys.length - 14) + ' 項');
      };
      out.push('.');
      rec(root, '', 0);
      return out.join('\n');
    },
    find(a, c) {
      if (!a[0]) return 'usage: find <關鍵字>';
      const q = a[0].toLowerCase();
      const hits = [];
      F.walk(c.cwd, (f) => { if (f.name.toLowerCase().indexOf(q) >= 0) hits.push(f.path); });
      return hits.length ? hits.join('\n') : '沒有符合「' + a[0] + '」的項目';
    },
    open(a, c, t) {
      if (!a[0]) return 'usage: open <應用程式|檔案>';
      const key = a[0].toLowerCase();
      const map = { finder: 'finder', safari: 'safari', mail: 'mail', notes: 'notes', music: 'music', photos: 'photos', terminal: 'terminal', calculator: 'calculator', settings: 'settings', textedit: 'textedit' };
      if (map[key]) { MAC.openApp(map[key]); return ''; }
      const p = c.resolve(a[0]);
      if (F.find(p)) { MAC.wm.open('textedit', { path: p }); return ''; }
      return 'open: 找不到 ' + a[0];
    },
    whoami() { return 'apple'; },
    hostname() { return 'macbook-pro.local'; },
    date() { return MAC.util.dateFull(new Date()); },
    uname() { return 'Darwin macbook-pro.local 25.1.0 Darwin Kernel Version 25.1.0: macOS 模擬器 · arm64'; },
    sw_vers() { return 'ProductName:\t\tmacOS\nProductVersion:\t\t模擬器 ' + MAC.version + '\nBuildVersion:\t\t25A101'; },
    df() {
      return 'Filesystem      Size   Used  Avail Capacity  Mounted on\n' +
        '/dev/disk3s1   994Gi   62Gi  932Gi     7%    /';
    },
    ps() {
      return '  PID TTY           TIME CMD\n' +
        '  501 ttys000    0:00.42 -zsh\n' +
        '  742 ttys000    0:00.11 /usr/bin/terminal\n' +
        '  118 console      0:12.08 /System/Library/CoreServices/WindowServer\n' +
        '   92 console      0:03.55 /usr/libexec/Dock';
    },
    top() {
      return 'Processes: 384 total, 2 running, 382 sleeping\n' +
        'CPU usage: 6.4% user, 3.1% sys, 90.5% idle\n' +
        'PhysMem: 11G used, 25G unused\n' +
        'Load Avg: 1.42, 1.31, 1.18';
    },
    neofetch() {
      const art = [
        '                    \'c.',
        '                 ,xNMM.',
        '               .OMMMMo',
        '               OMMM0,',
        '     .;loddo:\' loolloddol;.',
        '   cKMMMMMMMMMMNWMMMMMMMMMM0:',
        ' .KMMMMMMMMMMMMMMMMMMMMMMMWd.',
        ' XMMMMMMMMMMMMMMMMMMMMMMMX.',
        ';MMMMMMMMMMMMMMMMMMMMMMMM:',
        ':MMMMMMMMMMMMMMMMMMMMMMMM:',
        '.MMMMMMMMMMMMMMMMMMMMMMMMX.',
        ' kMMMMMMMMMMMMMMMMMMMMMMMMWd.',
        ' \'XMMMMMMMMMMMMMMMMMMMMMMMMMMk',
        '  \'XMMMMMMMMMMMMMMMMMMMMMMMMK.',
        '    kMMMMMMMMMMMMMMMMMMMMMMd',
        '     ;KMMMMMMMWXXWMMMMMMMk.',
        '       "cooc*"    "*coo\'"',
      ];
      const info = [
        'apple@macbook-pro',
        '-----------------',
        'OS: macOS 模擬器 ' + MAC.version,
        'Host: MacBook Pro (14-inch, 2026)',
        'Kernel: Darwin 25.1.0',
        'Shell: zsh 5.9',
        'Resolution: 1512x945',
        'DE: Aqua (HTML/CSS/JS)',
        'WM: MAC.WindowManager',
        'Terminal: 終端機.app',
        'CPU: Apple M5 Pro (12)',
        'GPU: Apple M5 Pro (18-core)',
        'Memory: 11GiB / 36GiB',
        '',
        '外觀: ' + MAC.store.get('appearance') + '   桌布: ' + MAC.store.get('wallpaper'),
      ];
      const n = Math.max(art.length, info.length);
      const out = [];
      for (let i = 0; i < n; i++) out.push((art[i] || ' '.repeat(30)).padEnd(32) + (info[i] || ''));
      return out.join('\n');
    },
    theme(a) {
      const v = (a[0] || '').toLowerCase();
      if (['light', 'dark', 'auto', '淺色', '深色', '自動'].indexOf(v) < 0) return 'usage: theme <light|dark|auto>';
      const map = { 淺色: 'light', 深色: 'dark', 自動: 'auto' };
      MAC.store.set('appearance', map[v] || v);
      return '外觀已切換為 ' + MAC.store.get('appearance');
    },
    wallpaper(a) {
      const list = ['aurora', 'sunset', 'graphite', 'mint'];
      if (!a[0]) return '可用桌布：' + list.join('  ') + '\n目前：' + MAC.store.get('wallpaper');
      if (list.indexOf(a[0]) < 0) return '沒有這張桌布。可用：' + list.join(', ');
      MAC.store.set('wallpaper', a[0]);
      return '桌布已設為 ' + a[0];
    },
    accent(a) {
      const presets = { blue: '#0a84ff', purple: '#bf5af2', pink: '#ff375f', red: '#ff453a', orange: '#ff9f0a', yellow: '#ffd60a', green: '#32d74b', graphite: '#8e8e93' };
      if (!a[0]) return '可用強調色：' + Object.keys(presets).join(', ');
      const hex = presets[a[0]] || (/^#[0-9a-f]{6}$/i.test(a[0]) ? a[0] : null);
      if (!hex) return 'accent: ' + a[0] + ': 無效（請用色名或 #RRGGBB）';
      MAC.store.set('accent', hex);
      return '強調色已設為 ' + hex;
    },
    volume(a) {
      if (!a[0]) return '音量：' + Math.round(MAC.store.get('volume') * 100) + '%';
      const v = parseInt(a[0], 10);
      if (isNaN(v)) return 'usage: volume <0-100>';
      MAC.store.set('volume', MAC.util.clamp(v / 100, 0, 1));
      MAC.bus.emit('hud:volume');
      return '音量已設為 ' + Math.round(MAC.store.get('volume') * 100) + '%';
    },
    brightness(a) {
      if (!a[0]) return '亮度：' + Math.round(MAC.store.get('brightness') * 100) + '%';
      const v = parseInt(a[0], 10);
      if (isNaN(v)) return 'usage: brightness <10-100>';
      MAC.store.set('brightness', MAC.util.clamp(v / 100, 0.1, 1));
      return '亮度已設為 ' + Math.round(MAC.store.get('brightness') * 100) + '%';
    },
    notify(a) {
      const text = a.join(' ');
      if (!text) return 'usage: notify <訊息>';
      MAC.store.notify('terminal', '終端機', text, 'terminal');
      return '已送出通知';
    },
    say(a) { return a.length ? '🔊 「' + a.join(' ') + '」（模擬語音）' : 'usage: say <文字>'; },
    apps() { return MAC.appOrder.map((id) => ((MAC.apps[id] ? MAC.apps[id].name : id) + ' (' + id + ')')).join('\n'); },
    sudo() { return 'apple 不在 sudoers 檔案中。此事將被記錄。🙂'; },
    man(a) { return a[0] ? '找不到 ' + a[0] + ' 的手冊頁（模擬環境僅提供 help 指令）' : 'usage: man <指令>'; },
    curl(a) {
      if (!a[0]) return 'usage: curl <網址>';
      return '（模擬）正在連線至 ' + a[0] + ' …\nHTTP/2 200\ncontent-type: text/html; charset=utf-8\n\n<!doctype html><title>示範頁面</html>';
    },
    echo(a) { return a.join(' '); },
    which(a) {
      if (!a[0]) return 'usage: which <指令>';
      return CMD[a[0]] ? '/usr/bin/' + a[0] : 'which: no ' + a[0] + ' in (/usr/bin:/bin:/usr/sbin:/sbin)';
    },
    history(a, c) {
      if (!c.hist.length) return '（尚無歷史紀錄）';
      return c.hist.map((h, i) => String(i + 1).padStart(4) + '  ' + h).join('\n');
    },
    clear(a, c, t) { t.clear(); return null; },
    exit(a, c, t) { MAC.wm.close(t.win.id); return null; },
  };

  /* ------------------------- 應用程式 ------------------------- */
  MAC.defApp({
    id: 'terminal', name: '終端機', icon: 'terminal', singleton: false,
    win: { w: 720, h: 460, min: [420, 260], best: [900, 560] },

    menus: (win) => ({
      'Shell': [
        { label: '新增視窗', key: '⌘N', action: () => MAC.openApp('terminal') },
        { label: '清除緩衝區', key: '⌘K', action: () => run(win, 'clear') },
        { sep: true },
        { label: '關閉', key: '⌘W', action: () => MAC.wm.close(win.id) },
      ],
      '編輯': [
        { label: '拷貝', key: '⌘C', action: () => MAC.bus.emit('clipboard', win.term.innerText.slice(-400)) },
        { label: '貼上（模擬）', key: '⌘V', action: () => MAC.bus.emit('toast', '剪貼簿內容已貼入') },
      ],
      '顯示方式': [
        { label: '字體放大', key: '⌘+', action: () => scale(win, 1) },
        { label: '字體縮小', key: '⌘-', action: () => scale(win, -1) },
        { sep: true },
        { label: '深色主題', checked: true, action: () => {} },
      ],
      '視窗': [
        { label: '縮到最小', key: '⌘M', action: () => MAC.wm.minimize(win.id) },
        { label: '縮放', action: () => MAC.wm.zoom(win.id) },
      ],
    }),

    render(win) {
      const term = el('div', 'term scroll');
      win.term = term;
      const st = win.sh = {
        cwd: F.home, hist: [], hi: -1, fontSize: 12.5,
        resolve(p) { return F.norm(p[0] === '/' || p[0] === '~' ? p : util.joinPath(st.cwd, p)); },
        clear() { term.innerHTML = ''; prompt(); },
        win: win,
      };

      const line = (html, cls) => {
        const n = el('div', { cls: 'term-line' + (cls ? ' ' + cls : ''), html: html });
        term.appendChild(n);
        term.scrollTop = term.scrollHeight;
        return n;
      };
      const prompt = () => {
        const row = el('div', 'term-in');
        const cwd = st.cwd.replace(F.home, '~');
        row.innerHTML = '<span class="tp">apple@macbook-pro</span><span class="tb">' + util.esc(cwd) + '</span><span class="td">%</span>';
        const input = el('input', { attrs: { type: 'text', spellcheck: 'false', autocomplete: 'off' } });
        row.appendChild(input);
        term.appendChild(row);
        term.scrollTop = term.scrollHeight;
        setTimeout(() => input.focus(), 0);
        win.input = input;
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { const v = input.value; input.remove(); accept(v); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); if (st.hi > 0 || st.hi === -1) { st.hi = st.hi === -1 ? st.hist.length - 1 : Math.max(0, st.hi - 1); input.value = st.hist[st.hi] || ''; } }
          else if (e.key === 'ArrowDown') { e.preventDefault(); if (st.hi >= 0) { st.hi = Math.min(st.hist.length, st.hi + 1); input.value = st.hist[st.hi] || ''; } }
          else if (e.key === 'Tab') { e.preventDefault(); tabComplete(input); }
          else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); st.clear(); }
          else if (e.key === 'c' && e.ctrlKey) { input.value = ''; }
        });
      };

      const tabComplete = (input) => {
        const parts = input.value.split(' ');
        if (parts.length === 1) {
          const hits = Object.keys(CMD).filter((c) => c.indexOf(parts[0]) === 0);
          if (hits.length === 1) input.value = hits[0] + ' ';
          else if (hits.length > 1) line(hits.join('   '), 'td');
        } else {
          const frag = parts[parts.length - 1];
          const dirp = frag.indexOf('/') >= 0 ? frag.slice(0, frag.lastIndexOf('/')) : '.';
          const base = frag.indexOf('/') >= 0 ? frag.slice(frag.lastIndexOf('/') + 1) : frag;
          const abs = st.resolve(dirp || '.');
          const hits = F.list(abs).filter((i) => i.name.indexOf(base) === 0);
          if (hits.length === 1) { parts[parts.length - 1] = (frag.indexOf('/') >= 0 ? frag.slice(0, frag.lastIndexOf('/') + 1) : '') + hits[0].name; input.value = parts.join(' '); }
          else if (hits.length > 1) line(hits.map((h) => h.name).join('   '), 'td');
        }
      };

      const accept = (raw) => {
        const cmdline = raw.trim();
        const cwd = st.cwd.replace(F.home, '~');
        line('<span class="tp">apple@macbook-pro</span> <span class="tb">' + util.esc(cwd) + '</span> <span class="td">%</span> ' + util.esc(cmdline));
        if (cmdline) { st.hist.push(cmdline); st.hi = -1; }
        run(win, cmdline);
      };

      /** 詞法分析：支援單／雙引號，讓 echo "hello world" 正確運作 */
      const tokenize = (str) => {
        const out = []; let cur = '', quote = null;
        for (let i = 0; i < str.length; i++) {
          const ch = str[i];
          if (quote) { if (ch === quote) quote = null; else cur += ch; continue; }
          if (ch === '"' || ch === "'") { quote = ch; continue; }
          if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } continue; }
          cur += ch;
        }
        if (cur) out.push(cur);
        return out;
      };
      const ERR_RE = /^(usage:|zsh:|[a-z_]+: )/;
      const render = (txt) => line(util.esc(txt).replace(/\n/g, '<br>').replace(/(apple@macbook-pro)/g, '<span class="tp">$1</span>').replace(/^(可用指令：)/, '<span class="ty">$1</span>'));

      /** 執行一行指令；支援以 && 串接，前一段失敗則中斷（與 zsh 一致） */
      const run = (w, cmdline) => {
        const raw = String(cmdline == null ? '' : cmdline).trim();
        if (!raw) { prompt(); return; }
        let suppress = false;
        const segments = raw.split('&&');
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i].trim();
          if (!seg) continue;
          const parts = tokenize(seg);
          const name = parts[0], args = parts.slice(1);
          const fn = CMD[name];
          if (!fn) {
            line('<span class="te">zsh: command not found: ' + util.esc(name) + '</span>');
            line('<span class="td">輸入 help 查看可用指令</span>');
            return;                                  // 錯誤即停（&& 語意）
          }
          let out = null, failed = false;
          try { out = fn(args, st, st); }
          catch (err) { out = 'zsh: ' + name + ': ' + err.message; failed = true; }
          if (out === null) suppress = true;          // 指令自行處理後續（clear / exit）
          else { if (out) render(out); if (ERR_RE.test(out)) failed = true; }
          if (failed) return;
        }
        if (!suppress) prompt();
      };
      win.run = (cmd) => run(win, cmd);

      line('<span class="td">Last login: ' + util.dateFull(new Date()) + ' on ttys000</span>');
      line('<span class="ty">macOS 模擬器終端機</span> <span class="td">· 輸入 </span><span class="tb">help</span><span class="td"> 開始</span>');
      prompt();

      term.addEventListener('click', (e) => { if (!e.target.closest('input') && win.input) win.input.focus(); });
      return term;
    },

    onClose(win) { win.sh = null; },
  });

  function scale(win, dir) {
    const st = win.sh;
    st.fontSize = util.clamp(st.fontSize + dir * 1, 10, 20);
    win.term.style.fontSize = st.fontSize + 'px';
    util.$$('input', win.term).forEach((i) => (i.style.fontSize = st.fontSize + 'px'));
    MAC.bus.emit('toast', '字體大小 ' + st.fontSize + 'px');
  }
})();
