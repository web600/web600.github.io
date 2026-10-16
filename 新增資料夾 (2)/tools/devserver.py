#!/usr/bin/env python3
"""
devserver.py — 開發用靜態伺服器（零依賴）

用途：本專案是純前端、無建置步驟的靜態站台，開發時最惱人的問題是
瀏覽器對 .js / .css 採用啟發式快取，改了檔案卻拿到舊版。
此伺服器為每個回應加上 `Cache-Control: no-store`，並在終端機印出請求，
方便確認「瀏覽器確實拿到最新的檔案」。

用法：
    python tools/devserver.py [port] [--bind 127.0.0.1] [--root .]
預設：port 8138、綁定 127.0.0.1、根目錄為此檔案的上層目錄（macos/）。
"""
import argparse
import functools
import http.server
import os
import socketserver
import sys
import time


class Handler(http.server.SimpleHTTPRequestHandler):
    """加上 no-store 的靜態檔案處理器"""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.path.endswith(('.js', '.css', '.html', '.svg')) or '/api/' in self.path:
            sys.stderr.write('[%s] %s\n' % (time.strftime('%H:%M:%S'), fmt % args))


def main():
    ap = argparse.ArgumentParser(description='macOS 模擬器開發用伺服器（停用快取）')
    ap.add_argument('port', nargs='?', type=int, default=8138)
    ap.add_argument('--bind', default='127.0.0.1')
    ap.add_argument('--root', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    args = ap.parse_args()

    handler = functools.partial(Handler, directory=args.root)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((args.bind, args.port), handler) as httpd:
        print('macOS 模擬器開發伺服器 → http://%s:%d/  (root=%s, 已停用快取)'
              % (args.bind, args.port, args.root))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n已停止')


if __name__ == '__main__':
    main()
