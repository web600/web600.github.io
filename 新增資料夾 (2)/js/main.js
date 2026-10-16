/* ==========================================================================
   main.js — 啟動組裝（Composition Root）
   1. 建立唯一的狀態儲存（含 localStorage 持久化）
   2. 建立視窗管理員
   3. 啟動系統外殼（掛載圖示 sprite、計算螢幕縮放、執行開機與登入流程）
   開發者可用 ?fast=1 略過開機與登入，直接進入桌面（方便展示與自動化截圖）。
   ========================================================================== */
'use strict';

(function () {
  MAC.store = new MAC.Store(MAC.defaults, 'macos.state.v1');
  MAC.wm = new MAC.WindowManager();

  /** 全域錯誤可視化：開發時一眼看出哪個模組壞了 */
  MAC.errors = [];
  window.addEventListener('error', (e) => {
    MAC.errors.push(e.message + ' @ ' + e.filename + ':' + e.lineno);
    console.error('[macOS] 未捕捉的錯誤：', e.message, e.filename + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    MAC.errors.push('Promise: ' + (e.reason && e.reason.message));
    console.error('[macOS] 未處理的 Promise 拒絕：', e.reason);
  });

  const fast = new URLSearchParams(location.search).get('fast') === '1';
  if (MAC.ui && MAC.ui.init) MAC.ui.init({ skip: fast });
})();
