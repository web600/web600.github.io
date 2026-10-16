/* ==========================================================================
   apps/registry.js — 應用程式註冊表
   外殼（Dock / 選單列 / Spotlight / ⌘Tab）只透過此註冊表認識應用程式，
   因此新增 App 不需修改外殼任何一行程式碼。
   ========================================================================== */
'use strict';

/** Dock 顯示順序（overlay:true 的項目不會開視窗，由外殼處理） */
MAC.appOrder = ['finder', 'launchpad', 'safari', 'mail', 'notes', 'music', 'photos', 'terminal', 'calculator', 'settings'];
MAC.trashAfter = true;

/**
 * 註冊一個應用程式。
 * @param {object} spec
 *   id        唯一識別碼
 *   name      顯示名稱（選單列 / Dock / Spotlight）
 *   icon      圖示名稱（MAC.icons.apps）
 *   win       { w, h, min:[w,h], best:[w,h] }
 *   singleton 同時間只允許一個視窗（預設 true）
 *   overlay   不是視窗型應用（例如 Launchpad）
 *   toolbar(win, sys) → Element         工具列（可省略）
 *   render(win, sys)  → Element         主要內容
 *   menus(win, sys)   → { '檔案': [...] } 動態選單列（可省略）
 *   onClose / onResize / onMinimize     生命週期鉤子
 */
MAC.defApp = function (spec) {
  if (!spec || !spec.id) throw new Error('defApp 需要 id');
  spec.singleton = spec.singleton !== false;
  spec.icon = spec.icon || spec.id;
  spec.name = spec.name || spec.id;
  MAC.apps[spec.id] = spec;
  return spec;
};

/** Launchpad 不是視窗型應用：外殼會以全螢幕覆蓋層呈現（overlay: true） */
MAC.defApp({ id: 'launchpad', name: 'Launchpad', icon: 'launchpad', overlay: true, inDock: true });

MAC.getApp = (id) => MAC.apps[id] || null;
MAC.listApps = () => MAC.appOrder.map((id) => MAC.apps[id]).filter(Boolean);
MAC.dockApps = () => MAC.listApps().filter((a) => a.inDock !== false);
/** 開啟應用的統一入口（處理 overlay 型 App） */
MAC.openApp = function (id, opts) {
  const app = MAC.apps[id];
  if (!app) { MAC.bus.emit('toast', '沒有這個應用程式：' + id); return null; }
  if (app.overlay) { MAC.bus.emit('overlay:' + id, opts); return null; }
  // 記錄使用紀錄（Spotlight「最近使用」與 Dock 最近項目）
  MAC.bus.emit('app:launch', app);
  return MAC.wm.open(id, opts);
};
