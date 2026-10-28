# Local dev server: like `python3 -m http.server`, but tells browsers not to cache,
# so every reload (on the laptop or the phone) shows the latest changes.
# Run from the project folder:  python3 tools/serve.py
#
# Phones only allow the microphone and motion on secure pages. To test those from your phone on
# the same Wi-Fi without pushing:  python3 tools/serve.py --https
# then open https://<this Mac's IP>:8443 and accept the "not private" warning once
# (the certificate is made here, on your Mac, in tools/.cert, and is not committed).
import http.server
import os
import ssl
import subprocess
import sys

HTTPS = "--https" in sys.argv
PORT = 8443 if HTTPS else 8000
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


server = http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler)

if HTTPS:
    cert_dir = os.path.join("tools", ".cert")
    cert = os.path.join(cert_dir, "cert.pem")
    key = os.path.join(cert_dir, "key.pem")
    if not os.path.exists(cert):
        os.makedirs(cert_dir, exist_ok=True)
        subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "365",
             "-subj", "/CN=cc-tapis local", "-keyout", key, "-out", cert],
            check=True, capture_output=True,
        )
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    server.socket = context.wrap_socket(server.socket, server_side=True)

ip = subprocess.run(["ipconfig", "getifaddr", "en0"], capture_output=True, text=True).stdout.strip()
scheme = "https" if HTTPS else "http"
print(f"Serving on {scheme}://localhost:{PORT}" + (f"  (phone: {scheme}://{ip}:{PORT})" if ip else ""), flush=True)
server.serve_forever()
