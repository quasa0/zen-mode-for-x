#!/usr/bin/env python3
"""Check the deployed page, every asset it references, and the real download bytes."""
import hashlib
import json
import pathlib
import sys
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

SITE = pathlib.Path(__file__).resolve().parents[2] / "site"
base = sys.argv[1].rstrip("/") + "/" if len(sys.argv) > 1 else "https://zen.quasa0.com/"


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ("src", "srcset"):
            if tag in ("img", "source") and attrs.get(key, "").startswith("/"):
                self.paths.add(attrs[key])
        if tag == "link" and attrs.get("rel") in ("stylesheet", "icon", "preload"):
            self.paths.add(attrs["href"])
        if tag == "meta" and attrs.get("property") == "og:image":
            self.paths.add(urlsplit(attrs["content"]).path)


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "zen-mode-site-smoke/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        assert response.status == 200, f"{url}: HTTP {response.status}"
        data = response.read()
        assert data, f"{url}: empty body"
        return data, response.headers


html, headers = fetch(base)
assert b"The same X." in html and b'id="install"' in html, "Wrong or incomplete entry page"
page = Assets()
page.feed(html.decode())
manifest = json.loads((SITE / "release.json").read_text())
downloads = {"/downloads/" + asset["name"] for asset in manifest["assets"]}
for path in sorted(page.paths | downloads | {"/llms.txt", "/release.json", "/fonts/OFL.txt", "/robots.txt", "/sitemap.xml"}):
    data, asset_headers = fetch(urljoin(base, path))
    content_type = asset_headers.get("Content-Type", "")
    if path.endswith(".css"):
        assert "text/css" in content_type, "Wrong stylesheet MIME"
    if path.endswith(".png"):
        assert data.startswith(b"\x89PNG"), f"Wrong image bytes: {path}"
    if path.endswith(".zip"):
        assert data.startswith(b"PK"), f"Wrong archive bytes: {path}"
    assert data == (SITE / path.lstrip("/")).read_bytes(), f"Deployed asset differs from repository: {path}"
print(f"PASS: entry page and {len(page.paths)} referenced assets match the repository", flush=True)
for asset in manifest["assets"]:
    data, _ = fetch(urljoin(base, "/downloads/" + asset["name"]))
    assert len(data) == asset["bytes"] and hashlib.sha256(data).hexdigest() == asset["sha256"], f"Checksum mismatch: {asset['name']}"
    print(f"PASS: published {asset['name']} checksum ({len(data)} bytes)", flush=True)
if urlsplit(base).hostname not in ("127.0.0.1", "localhost"):
    assert "default-src 'none'" in headers.get("Content-Security-Policy", ""), "Missing CSP"
    assert headers.get("X-Content-Type-Options") == "nosniff"
    print("PASS: security headers", flush=True)
print("PASS: deployed site. It is static: no authenticated API and no realtime service exist to test.")
