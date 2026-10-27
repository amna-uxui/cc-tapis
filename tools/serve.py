# Local dev server: like `python3 -m http.server`, but tells browsers not to cache,
# so every reload (on the laptop or the phone) shows the latest changes.
# Run from the project folder:  python3 tools/serve.py
import http.server
import os

PORT = 8000
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


print(f"Serving on http://localhost:{PORT}")
http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler).serve_forever()
