#!/usr/bin/env python3
"""Serve the static political dashboard with a CivicAPI proxy.

The dashboard can call CivicAPI directly when hosted somewhere that allows it.
For local development, this server exposes same-origin /api/civic/* routes so
browser extensions or CORS policy do not block the API calls.
"""

from __future__ import annotations

import json
import mimetypes
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
CIVIC_BASE = "https://civicapi.org/api/v2"


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/civic/"):
            self.proxy_civic(parsed)
            return
        if parsed.path == "/":
            self.path = "/Political%20Dashboard.html"
        super().do_GET()

    def proxy_civic(self, parsed: urllib.parse.ParseResult) -> None:
        suffix = parsed.path.removeprefix("/api/civic")
        url = f"{CIVIC_BASE}{suffix}"
        if parsed.query:
            url = f"{url}?{parsed.query}"
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "comcast-political-dashboard-local/1.0",
                },
            )
            with urllib.request.urlopen(request, timeout=18) as response:
                body = response.read()
                content_type = response.headers.get("Content-Type", "application/json")
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "public, max-age=300")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.HTTPError as exc:
            body = exc.read() or json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(exc.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:  # noqa: BLE001 - local dev server should surface all proxy failures
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    mimetypes.add_type("text/javascript", ".js")
    server = ThreadingHTTPServer(("127.0.0.1", port), DashboardHandler)
    print(f"Dashboard running at http://127.0.0.1:{port}/Political%20Dashboard.html", flush=True)
    print(f"Admin uploader at http://127.0.0.1:{port}/Admin.html", flush=True)
    print("CivicAPI proxy at /api/civic/*", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
