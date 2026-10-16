/* ==========================================================================
   apps/notes.js — 備忘錄
   資料存於 MAC.store.notes（寫入 localStorage），具備搜尋、新增、刪除、
   字數統計與自動存檔；編輯器使用 contenteditable + execCommand 示範格式化。
   ========================================================================== */
'use strict';

(function () {
  const el = MAC.util.el;

  const plain = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

  MAC.defApp({
    id: 'notes', name: '備忘錄', icon: 'notes',
    win: { w: 900, h: 580, min: [560, 360], best: [1080, 700] },

    menus: (win) => ({
      '檔案': [
        { label: '新增備忘錄', key: '⌘N', action: () => create(win) },
        { label: '刪除備忘錄', key: '⌘⌫', action: () => remove(win) },
        { sep: true },
        { label: '關閉', key: '⌘W', action: () => MAC.wm.close(win.id) },
      ],
      '編輯': [
        { label: '還原', key: '⌘Z', action: () => document.execCommand('undo') },
        { label: '重做', key: '⇧⌘Z', action: () => document.execCommand('redo') },
        { sep: true },
        { label: '全選', key: '⌘A', action: () => document.execCommand('selectAll') },
      ],
      '格式': [
        { label: '粗體', key: '⌘B', action: () => fmt(win, 'bold') },
        { label: '斜體', key: '⌘I', action: () => fmt(win, 'italic') },
        { label: '底線', key: '⌘U', action: () => fmt(win, 'underline') },
        { sep: true },
        { label: '項目符號清單', action: () => fmt(win, 'insertUnorderedList') },
        { label: '文字放大', action: () => fmt(win, 'fontSize', '4') },
        { label: '文字縮小', action: () => fmt(win, 'fontSize', '2') },
      ],
      '顯示方式': [
        { label: '顯示附件', dis: true },
        { label: '排序：編輯日期', checked: true },
        { label: '排序：建立日期', action: () => MAC.bus.emit('toast', '已改為依建立日期排序') },
      ],
    }),

    render(win) {
      const st = win.nt = { id: (MAC.store.get('notes')[0] || {}).id, query: '' };
      const wrap = el('div', 'nt');

      /* ---------------- 側邊欄 ---------------- */
      const side = el('div', 'nt-side');
      const searchWrap = el('div', 'nt-search');
      const searchBox = el('label', { cls: 'fnd-search', style: 'margin:0;width:100%' , html: MAC.icon('search', { sw: 1.8 }) });
      const search = el('input', { attrs: { type: 'text', placeholder: '搜尋', spellcheck: 'false' }, style: 'width:100%' });
      search.addEventListener('input', () => { st.query = search.value.trim().toLowerCase(); paintList(); });
      searchBox.appendChild(search);
      searchWrap.appendChild(searchBox);
      side.appendChild(searchWrap);

      const list = el('div', 'nt-list scroll');
      side.appendChild(list);

      const footWrap = el('div', { style: 'padding:8px 10px;display:flex;gap:6px' });
      const addBtn = el('button', { cls: 'btn', style: 'flex:1', text: '新增備忘錄' });
      addBtn.addEventListener('click', () => create(win));
      const delBtn = el('button', { cls: 'btn', html: MAC.icon('trash', { sw: 1.6 }), title: '刪除' });
      delBtn.addEventListener('click', () => remove(win));
      footWrap.appendChild(addBtn); footWrap.appendChild(delBtn);
      side.appendChild(footWrap);

      /* ---------------- 編輯器 ---------------- */
      const main = el('div', 'nt-main');
      const tools = el('div', 'nt-tools');
      [['text-bold', 'bold', '粗體'], ['text-italic', 'italic', '斜體'], ['text-underline', 'underline', '底線'], ['list-bullet', 'insertUnorderedList', '清單']].forEach(([ic, cmd, title]) => {
        const b = el('button', { cls: 'icb', html: MAC.icon(ic), title: title });
        b.addEventListener('click', () => fmt(win, cmd));
        tools.appendChild(b);
      });
      tools.appendChild(el('div', 'tsep'));
      const done = el('span', { style: 'font-size:11.5px;color:var(--text-3);margin-left:auto', text: '自動儲存' });
      tools.appendChild(done);

      const editor = el('div', 'nt-editor scroll');
      const title = el('input', { cls: 'nt-title', attrs: { type: 'text', placeholder: '標題', spellcheck: 'false' }, style: 'width:100%;background:none' });
      const dateEl = el('div', 'nt-date');
      const body = el('div', { cls: 'nt-body', attrs: { contenteditable: 'true', spellcheck: 'false' } });
      editor.appendChild(title); editor.appendChild(dateEl); editor.appendChild(body);
      const foot = el('div', { cls: 'nt-foot', text: '' });
      main.appendChild(tools); main.appendChild(editor); main.appendChild(foot);
      wrap.appendChild(side); wrap.appendChild(main);
      win.ntRefs = { title: title, body: body, date: dateEl, foot: foot, done: done, list: list };

      /* ---------------- 行為 ---------------- */
      const save = util.debounce(() => {
        const note = current();
        if (!note) return;
        note.title = title.value.trim() || '新增備忘錄';
        note.body = body.innerHTML;
        note.updated = Date.now();
        MAC.bus.emit('state:notes', MAC.store.get('notes'));
        MAC.store.save();
        done.textContent = '已儲存 · 剛剛';
        paintList();
      }, 420);

      title.addEventListener('input', save);
      body.addEventListener('input', () => { save(); countWords(); });
      body.addEventListener('keyup', countWords);

      title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });

      function current() { return MAC.store.get('notes').filter((n) => n.id === st.id)[0]; }
      win.ntState = { current: current };

      function countWords() {
        const text = plain(body.innerHTML);
        const chars = text.replace(/\s/g, '').length;
        const words = text.split(/[\s，。、；：!?（）「」]+/).filter(Boolean).length;
        foot.textContent = words + ' 個字 · ' + chars + ' 個字元';
      }

      function paintList() {
        list.innerHTML = '';
        let notes = MAC.store.get('notes').slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
        if (st.query) notes = notes.filter((n) => (n.title + ' ' + plain(n.body)).toLowerCase().indexOf(st.query) >= 0);
        if (!notes.length) list.appendChild(el('div', { cls: 'fnd-empty', text: st.query ? '沒有符合的備忘錄' : '沒有備忘錄' }));
        notes.forEach((n) => {
          const item = el('div', {
            cls: 'nt-item' + (n.id === st.id ? ' on' : ''),
            html: '<b>' + util.esc(n.title || '新增備忘錄') + '</b><p>' + util.esc(plain(n.body).replace(/\n/g, ' ').slice(0, 60) || '沒有其他文字') + '</p>' +
              '<time>' + util.rel(n.updated || Date.now()) + '</time>',
          });
          item.addEventListener('click', () => { if (st.id !== n.id) { st.id = n.id; load(); paintList(); } });
          list.appendChild(item);
        });
      }

      function load() {
        const n = current();
        title.value = n ? (n.title || '') : '';
        body.innerHTML = n ? (n.body || '') : '';
        dateEl.textContent = n ? MAC.util.dateFull(n.updated || Date.now()) : '';
        win.setCaption((n ? n.title : '備忘錄') + ' — 備忘錄');
        countWords();
      }

      function create() {
        const n = { id: util.uid('note'), title: '新增備忘錄', body: '', updated: Date.now() };
        MAC.store.patch('notes', (arr) => arr.unshift(n));
        st.id = n.id;
        load(); paintList();
        title.focus(); title.select();
      }

      function remove() {
        const n = current();
        if (!n) return;
        MAC.store.patch('notes', (arr) => { const i = arr.findIndex((x) => x.id === n.id); if (i >= 0) arr.splice(i, 1); });
        st.id = (MAC.store.get('notes')[0] || {}).id;
        load(); paintList();
        MAC.bus.emit('toast', '備忘錄已刪除 ' + MAC.icon('trash'));
      }

      win.ntCreate = create; win.ntRemove = remove; win.ntPaint = paintList; win.ntLoad = load;
      win.ntFlush = () => {
        const n = current(); if (!n) return;
        n.title = title.value.trim() || '新增備忘錄';
        n.body = body.innerHTML;
        n.updated = Date.now();
        MAC.store.save();
      };
      paintList(); load();

      // 外部（Spotlight / 其他 App）新增備忘錄時同步列表
      win.offNotes = MAC.bus.on('state', (key) => {
        if (key === 'notes') { win.ntPaint(); win.ntLoad(); }
      });
      return wrap;
    },

    onClose(win) {
      if (win.ntFlush) win.ntFlush();            // 關窗前強制落盤（debounce 可能還沒跑完）
      if (win.offNotes) win.offNotes();
      win.nt = null;
    },
  });

  function fmt(win, cmd, val) {
    const body = win.ntRefs.body;
    if (body) body.focus();
    try { document.execCommand(cmd, false, val || null); } catch (e) { /* 忽略不支援的指令 */ }
    if (win.nt && win.ntRefs) {
      const note = win.ntState.current();
      if (note) { note.body = win.ntRefs.body.innerHTML; note.updated = Date.now(); MAC.store.save(); }
    }
  }
  function create(win) { if (win.ntCreate) win.ntCreate(); }
  function remove(win) { if (win.ntRemove) win.ntRemove(); }
})();
