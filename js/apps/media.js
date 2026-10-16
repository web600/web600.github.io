/* ==========================================================================
   apps/media.js — 郵件 · 音樂 · 照片
   三個輕量但完整可互動的內建應用，讓桌面環境更接近真實使用情境。
   ========================================================================== */
'use strict';

(function () {
  const el = MAC.util.el;

  /* ================================ 郵件 ================================ */
  const MAILS = [
    { id: 'm1', from: '設計團隊', mail: 'design@studio.tw', subj: '第四季視覺規範 — 定稿', time: '09:12',
      body: '嗨 Apple：\n\n附上第四季的視覺規範定稿。這次主要調整了三件事：\n\n1. 毛玻璃的模糊半徑從 28px 提到 34px，質感更沉穩。\n2. 強調色改用動態色票，允許使用者自選。\n3. 視窗圓角統一為 11px，面板則維持 20px。\n\n如果沒有問題，我們下週就可以進入實作。\n\n— 設計團隊' },
    { id: 'm2', from: 'Cloud Hosting', mail: 'billing@cloudhost.io', subj: '本月帳單已產生', time: '昨天',
      body: '您好：\n\n您 2026 年 10 月的服務費用為 NT$ 3,280，將於 10 月 20 日自動扣款。\n\n使用量摘要：\n· 運算時數 410 小時\n· 對外流量 1.2 TB\n· 物件儲存 240 GB\n\n謝謝您的使用。' },
    { id: 'm3', from: '王小明', mail: 'ming@example.com', subj: '週六聚餐確認', time: '週一',
      body: '老地方，週六中午 12 點，我訂了 8 人的位子。\n\n記得帶那台筆電，我想看看你做的桌面環境！' },
    { id: 'm4', from: 'GitHub', mail: 'noreply@github.com', subj: '[macos-sim] Pull request #42 已合併', time: '週一',
      body: 'Pull request #42「新增視窗分割吸附」已由 apple 合併至 main。\n\n變更：+412 −38，共 7 個檔案。' },
  ];

  MAC.defApp({
    id: 'mail', name: '郵件', icon: 'mail',
    win: { w: 940, h: 580, min: [620, 400], best: [1120, 720] },
    menus: () => ({
      '檔案': [
        { label: '新增郵件', key: '⌘N', action: () => MAC.bus.emit('toast', '已開啟新的郵件視窗（示範）') },
        { label: '回覆', key: '⌘R', action: () => MAC.bus.emit('toast', '已建立回覆草稿') },
        { sep: true },
        { label: '關閉', key: '⌘W', action: (win) => MAC.wm.close(win.id) },
      ],
      '信箱': [
        { label: '接收新郵件', key: '⇧⌘N', action: () => MAC.store.notify('mail', '郵件', '已接收 1 封新郵件。', 'mail') },
        { label: '清除垃圾郵件', action: () => MAC.bus.emit('toast', '已清除 6 封垃圾郵件') },
      ],
    }),
    render(win) {
      const st = win.ml = { id: 'm1', read: {} };
      const wrap = el('div', 'fnd');

      const side = el('div', 'side');
      ['收件匣', 'VIP', '已標示', '草稿', '已寄出', '垃圾郵件', '垃圾桶'].forEach((n, i) => {
        const r = el('div', { cls: 'it' + (i === 0 ? ' on' : ''), html: '<span class="ic">' + MAC.icon(i === 6 ? 'trash' : i === 3 ? 'pencil' : i === 0 ? 'mail' : 'folder', { sw: 1.7 }) + '</span><span>' + n + '</span>' });
        if (i === 0) r.appendChild(el('span', { cls: 'val', text: String(MAILS.length), style: 'margin-left:auto;font-size:11px;color:var(--text-3)' }));
        r.addEventListener('click', () => { util.$$('.it', side).forEach((x) => x.classList.remove('on')); r.classList.add('on'); MAC.bus.emit('toast', n + '（示範）'); });
        side.appendChild(r);
      });
      wrap.appendChild(side);

      const list = el('div', { style: 'width:290px;flex:none;border-right:.5px solid var(--line);overflow-y:auto', cls: 'scroll' });
      win.mlList = list;
      const pane = el('div', { style: 'flex:1;min-width:0;overflow-y:auto;padding:22px 26px', cls: 'scroll' });
      win.mlPane = pane;

      const paintList = () => {
        list.innerHTML = '';
        MAILS.forEach((m) => {
          const unread = !st.read[m.id];
          const it = el('div', { cls: 'nt-item' + (m.id === st.id ? ' on' : ''), style: 'border-radius:0;border-bottom:.5px solid var(--line);padding:10px 12px' });
          it.innerHTML = '<b style="display:flex;gap:8px;align-items:center">' + (unread ? '<span style="width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none"></span>' : '') +
            util.esc(m.from) + '<time style="margin-left:auto">' + m.time + '</time></b>' +
            '<div style="font-size:12.5px;font-weight:' + (unread ? '600' : '400') + '">' + util.esc(m.subj) + '</div>' +
            '<p style="margin-top:2px">' + util.esc(m.body.replace(/\n/g, ' ').slice(0, 44)) + '…</p>';
          it.addEventListener('click', () => { st.id = m.id; st.read[m.id] = true; paintList(); paintPane(); });
          list.appendChild(it);
        });
      };
      const paintPane = () => {
        const m = MAILS.filter((x) => x.id === st.id)[0] || MAILS[0];
        pane.innerHTML = '<h1 style="font-size:20px;margin:0 0 10px">' + util.esc(m.subj) + '</h1>' +
          '<div style="display:flex;align-items:center;gap:10px;padding-bottom:12px;border-bottom:.5px solid var(--line)">' +
          '<div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(140deg,#7f9dff,#4d5fe0);display:grid;place-items:center;color:#fff;font-weight:600">' + util.esc(m.from.charAt(0)) + '</div>' +
          '<div><b style="font-size:13px">' + util.esc(m.from) + '</b><div style="font-size:11.5px;color:var(--text-3)">' + util.esc(m.mail) + ' · ' + m.time + '</div></div>' +
          '<button class="btn" style="margin-left:auto" id="mlReply">回覆</button></div>' +
          '<div style="font-size:13.5px;line-height:1.7;white-space:pre-wrap;padding-top:16px">' + util.esc(m.body) + '</div>';
        const rep = util.$('#mlReply', pane);
        if (rep) rep.addEventListener('click', () => MAC.bus.emit('toast', '已建立回覆草稿 ✉️'));
        win.setCaption(m.subj + ' — 郵件');
      };
      paintList(); paintPane();
      wrap.appendChild(list); wrap.appendChild(pane);
      return wrap;
    },
    onClose(win) { win.ml = null; },
  });

  /* ================================ 音樂 ================================ */
  const TRACKS = [
    { t: '夜行電車', a: 'Aoi Circuit', d: 214, g: 'linear-gradient(140deg,#ff8fb0,#8b3fd8)' },
    { t: '午夜電台', a: 'Aoi Circuit', d: 186, g: 'linear-gradient(140deg,#5b7cff,#1b2a6b)' },
    { t: '輕軌', a: 'Neon Tide', d: 241, g: 'linear-gradient(140deg,#63e6c3,#0f8f7a)' },
    { t: '玻璃城市', a: 'Studio Lumen', d: 198, g: 'linear-gradient(140deg,#ffd479,#e0751b)' },
    { t: '凌晨三點', a: 'Lo-fi Taipei', d: 165, g: 'linear-gradient(140deg,#a78bfa,#4c1d95)' },
  ];

  MAC.defApp({
    id: 'music', name: '音樂', icon: 'music',
    win: { w: 820, h: 540, min: [560, 380], best: [960, 620] },
    menus: (win) => ({
      '檔案': [{ label: '關閉', key: '⌘W', action: (w) => MAC.wm.close(w.id) }],
      '播放': [
        { label: '播放／暫停', key: '空白鍵', action: () => toggle(win) },
        { label: '下一首', key: '⌘→', action: () => next(win) },
        { label: '上一首', key: '⌘←', action: () => prev(win) },
      ],
      '顯示方式': [{ label: '顯示歌詞', checked: false, action: () => MAC.bus.emit('toast', '此曲目沒有歌詞') }],
    }),
    render(win) {
      const st = win.mu = { i: 0, pos: 0, playing: false, timer: null, vol: MAC.store.get('volume') };
      const wrap = el('div', { style: 'display:flex;width:100%;height:100%' });

      const side = el('div', 'side');
      side.style.width = '176px';
      side.appendChild(el('div', { cls: 'grp', text: '資料庫' }));
      [['立即聆聽', 'sparkle'], ['瀏覽', 'grid'], ['廣播', 'globe']].forEach(([n, ic]) => {
        const r = el('div', { cls: 'it', html: '<span class="ic">' + MAC.icon(ic, { sw: 1.7 }) + '</span><span>' + n + '</span>' });
        r.addEventListener('click', () => MAC.bus.emit('toast', n + '（示範）'));
        side.appendChild(r);
      });
      side.appendChild(el('div', { cls: 'grp', text: '播放清單' }));
      ['通勤精選', '深夜專注', '2026 回顧'].forEach((n) => {
        const r = el('div', { cls: 'it', html: '<span class="ic">' + MAC.icon('music', { sw: 1.7 }) + '</span><span>' + n + '</span>' });
        r.addEventListener('click', () => MAC.bus.emit('toast', '已載入播放清單：' + n));
        side.appendChild(r);
      });
      wrap.appendChild(side);

      const main = el('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column' });
      const np = el('div', { style: 'display:flex;gap:22px;padding:26px 28px 20px;align-items:center' });
      const art = el('div', { style: 'width:150px;height:150px;border-radius:14px;flex:none;box-shadow:0 18px 40px -14px rgba(0,0,0,.55)' });
      const info = el('div', { style: 'flex:1;min-width:0' });
      info.innerHTML =
        '<div id="muTitle" style="font-size:22px;font-weight:700;letter-spacing:-.3px"></div>' +
        '<div id="muArtist" style="font-size:13px;color:var(--text-2);margin-top:2px"></div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:18px" id="muBar"><span id="muPos" style="font-size:11px;color:var(--text-3);width:34px">0:00</span>' +
        '<div style="flex:1;height:4px;border-radius:999px;background:var(--ctl-on);opacity:.5;position:relative"><i id="muFill" style="position:absolute;left:0;top:0;bottom:0;width:0;border-radius:999px;background:var(--accent)"></i></div>' +
        '<span id="muDur" style="font-size:11px;color:var(--text-3);width:34px;text-align:right">0:00</span></div>' +
        '<div style="display:flex;align-items:center;gap:16px;margin-top:16px">' +
        '<button class="icb" id="muPrev">' + MAC.icon('chevrons-left') + '</button>' +
        '<button class="icb" id="muPlay" style="width:38px;height:38px;background:var(--accent);color:#fff;border-radius:50%">' + MAC.icon('play') + '</button>' +
        '<button class="icb" id="muNext">' + MAC.icon('chevrons-right') + '</button>' +
        '<div style="margin-left:auto;display:flex;align-items:center;gap:8px;width:150px" id="muVolWrap">' + MAC.icon('volume', { sw: 1.6 }) + '<input class="sl" type="range" min="0" max="100" id="muVol"></div>' +
        '</div>';
      np.appendChild(art); np.appendChild(info);
      main.appendChild(np);

      const list = el('div', { style: 'flex:1;overflow-y:auto;padding:0 28px 20px', cls: 'scroll' });
      main.appendChild(list);
      wrap.appendChild(main);

      const paint = () => {
        const tr = TRACKS[st.i];
        art.style.background = tr.g;
        util.$('#muTitle', info).textContent = tr.t;
        util.$('#muArtist', info).textContent = tr.a;
        util.$('#muDur', info).textContent = fmt(tr.d);
        util.$('#muPos', info).textContent = fmt(st.pos);
        util.$('#muFill', info).style.width = Math.min(100, (st.pos / tr.d) * 100) + '%';
        util.$('#muPlay', info).innerHTML = MAC.icon(st.playing ? 'pause' : 'play');
        util.$$('.trk', list).forEach((n, i) => n.style.background = i === st.i ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : '');
        win.setCaption((st.playing ? '▶ ' : '') + tr.t + ' — ' + tr.a);
      };
      const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

      TRACKS.forEach((tr, i) => {
        const row = el('div', { cls: 'trk set-row', style: 'cursor:default;gap:12px' });
        row.innerHTML = '<span style="width:16px;color:var(--text-3);font-size:11px">' + (i + 1) + '</span>' +
          '<span style="width:34px;height:34px;border-radius:7px;background:' + tr.g + '"></span>' +
          '<span style="flex:1"><b style="font-size:13px">' + tr.t + '</b><div style="font-size:11.5px;color:var(--text-3)">' + tr.a + '</div></span>' +
          '<span style="color:var(--text-3);font-size:11.5px">' + fmt(tr.d) + '</span>';
        row.addEventListener('dblclick', () => { st.i = i; st.pos = 0; play(win, true); });
        row.addEventListener('click', () => { st.i = i; st.pos = 0; play(win, true); });
        list.appendChild(row);
      });

      util.$('#muPlay', info).addEventListener('click', () => toggle(win));
      util.$('#muNext', info).addEventListener('click', () => next(win));
      util.$('#muPrev', info).addEventListener('click', () => prev(win));
      const vol = util.$('#muVol', info);
      vol.value = Math.round(MAC.store.get('volume') * 100);
      vol.addEventListener('input', () => MAC.store.set('volume', parseFloat(vol.value) / 100));
      win.muVol = vol;
      win.muSync = () => { vol.value = Math.round(MAC.store.get('volume') * 100); };

      win.muPaint = paint;
      win.muStop = () => { clearInterval(st.timer); st.timer = null; st.playing = false; };
      paint();
      return wrap;
    },
    onClose(win) { if (win.muStop) win.muStop(); win.mu = null; },
  });

  function toggle(win) {
    const st = win.mu;
    if (!st || !win.muPaint) return;
    if (st.playing) {
      clearInterval(st.timer); st.timer = null; st.playing = false;
    } else {
      st.playing = true;
      st.timer = setInterval(() => {
        st.pos += 1;
        const tr = TRACKS[st.i];
        if (st.pos >= tr.d) { st.pos = 0; st.i = (st.i + 1) % TRACKS.length; }
        win.muPaint();
      }, 1000);
      MAC.bus.emit('toast', '正在播放：' + TRACKS[st.i].t + ' ' + MAC.icon('music'));
    }
    win.muPaint();
  }
  function next(win) { const st = win.mu; if (!st) return; st.i = (st.i + 1) % TRACKS.length; st.pos = 0; win.muPaint(); if (st.playing) { clearInterval(st.timer); st.timer = setInterval(() => { st.pos += 1; if (st.pos >= TRACKS[st.i].d) { st.pos = 0; st.i = (st.i + 1) % TRACKS.length; } win.muPaint(); }, 1000); } }
  function prev(win) { const st = win.mu; if (!st) return; st.i = (st.i - 1 + TRACKS.length) % TRACKS.length; st.pos = 0; win.muPaint(); }

  /* ================================ 照片 ================================ */
  const ALBUMS = [
    { n: '所有照片', c: 0 }, { n: '最近項目', c: 1 }, { n: '我的最愛', c: 2 },
    { n: '旅行', c: 3 }, { n: '螢幕截圖', c: 4 },
  ];
  function photoStyle(i) {
    const h1 = (i * 37) % 360, h2 = (h1 + 48) % 360;
    return 'linear-gradient(150deg, hsl(' + h1 + ' 82% 62%), hsl(' + h2 + ' 74% 44%))';
  }

  MAC.defApp({
    id: 'photos', name: '照片', icon: 'photos',
    win: { w: 900, h: 580, min: [560, 380], best: [1080, 700] },
    menus: () => ({
      '檔案': [{ label: '關閉', key: '⌘W', action: (win) => MAC.wm.close(win.id) }],
      '顯示方式': [
        { label: '放大', key: '⌘+', action: () => MAC.bus.emit('toast', '放大檢視') },
        { label: '顯示側邊欄', checked: true },
      ],
    }),
    render(win) {
      const st = win.ph = { album: '所有照片', sel: null };
      const wrap = el('div', 'fnd');
      const side = el('div', 'side');
      side.appendChild(el('div', { cls: 'grp', text: '圖庫' }));
      ALBUMS.forEach((a) => {
        const r = el('div', { cls: 'it', html: '<span class="ic">' + MAC.icon('image', { sw: 1.7 }) + '</span><span>' + a.n + '</span>' });
        r.addEventListener('click', () => { st.album = a.n; util.$$('.it', side).forEach((x) => x.classList.remove('on')); r.classList.add('on'); paint(); });
        side.appendChild(r);
      });
      wrap.appendChild(side);

      const main = el('div', 'fnd-main');
      const bar = el('div', 'fnd-tools');
      bar.appendChild(el('b', { text: '圖庫', style: 'font-size:13px' }));
      const note = el('span', { style: 'margin-left:auto;font-size:11.5px;color:var(--text-3)' });
      bar.appendChild(note);
      const grid = el('div', 'fnd-content scroll');
      main.appendChild(bar); main.appendChild(grid);
      wrap.appendChild(main);

      const paint = () => {
        grid.innerHTML = '';
        const g = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px' });
        const n = st.album === '所有照片' ? 18 : 9;
        for (let i = 0; i < n; i++) {
          const cell = el('div', { style: 'aspect-ratio:4/3;border-radius:10px;background:' + photoStyle(i + (st.album.length * 5)) + ';box-shadow:inset 0 0 0 .5px var(--line);transition:transform .2s;overflow:hidden;position:relative' });
          cell.innerHTML = '<span style="position:absolute;left:8px;bottom:6px;font-size:11px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.6)">IMG_' + (1000 + i) + '</span>';
          cell.addEventListener('mouseenter', () => (cell.style.transform = 'scale(1.03)'));
          cell.addEventListener('mouseleave', () => (cell.style.transform = ''));
          cell.addEventListener('click', () => lightbox(i));
          g.appendChild(cell);
        }
        grid.appendChild(g);
        note.textContent = st.album + ' · ' + n + ' 張照片';
        win.setCaption('照片 — ' + st.album);
      };
      const lightbox = (i) => {
        const box = el('div', { style: 'position:absolute;inset:0;z-index:5;background:rgba(0,0,0,.72);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px' });
        box.innerHTML = '<div style="width:62%;aspect-ratio:4/3;border-radius:14px;background:' + photoStyle(i + (st.album.length * 5)) + ';box-shadow:0 30px 70px -20px rgba(0,0,0,.8)"></div>' +
          '<div style="color:#fff;font-size:12.5px">IMG_' + (1000 + i) + ' · 4032 × 3024 · ' + (2 + (i % 4)) + '.' + (i % 9) + ' MB  · 按 Esc 關閉</div>';
        box.addEventListener('click', () => box.remove());
        const esc = (e) => { if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', esc); } };
        document.addEventListener('keydown', esc);
        win.bodyEl.appendChild(box);
      };
      paint();
      win.phPaint = paint;
      return wrap;
    },
    onClose(win) { win.ph = null; },
  });
})();
