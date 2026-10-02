#!/usr/bin/env python3
"""Offline publication checks: links, images, release contract, and privacy boundaries."""
import hashlib
import json
import pathlib
import re
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = ROOT / "site"


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids, self.h1, self.images, self.inline = [], [], 0, [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "h1":
            self.h1 += 1
        if tag == "img":
            self.images.append(attrs)
        if tag in ("script", "style") or "style" in attrs:
            self.inline.append(tag)
        for key in ("href", "src", "srcset"):
            if key in attrs:
                self.links.append(attrs[key])


page = Page()
html = (SITE / "index.html").read_text()
page.feed(html)
assert page.h1 == 1, "Use one descriptive h1"
assert len(page.ids) == len(set(page.ids)), "Duplicate HTML id"
assert all(i.get("alt") and i.get("width") and i.get("height") for i in page.images), "Image metadata missing"
assert not page.inline, f"The CSP forbids scripts and inline styles: {page.inline}"
for url in page.links:
    parsed = urlsplit(url)
    assert parsed.scheme in ("", "https"), f"Unsafe link scheme: {url}"
    if parsed.scheme:
        continue
    if parsed.path and parsed.path != "/":
        assert (SITE / unquote(parsed.path.lstrip("/"))).is_file(), f"Missing site asset: {url}"
    if parsed.fragment:
        assert parsed.fragment in page.ids, f"Broken anchor: {url}"
for css_asset in re.findall(r"url\(['\"]?(/[^)'\"]+)", (SITE / "style.css").read_text()):
    assert (SITE / css_asset.lstrip("/")).is_file(), f"Missing CSS asset: {css_asset}"
og = re.search(r'property="og:image" content="https://zen\.quasa0\.com(/[^"]+)"', html)[1]
assert (SITE / og.lstrip("/")).is_file(), "Missing social image"

version = re.search(r'version:\s*"(\d+\.\d+\.\d+)"', (ROOT / "extension-manifests.js").read_text())[1]
manifest = json.loads((SITE / "release.json").read_text())
assert manifest["version"] == version, "Stale release.json. Run scripts/site/release.py."
assert f"<span>{version}</span>" in html, "Stale version on the page"
for asset in manifest["assets"]:
    local = SITE / "downloads" / asset["name"]
    data = local.read_bytes()
    assert len(data) == asset["bytes"] and hashlib.sha256(data).hexdigest() == asset["sha256"], f"Stale download: {asset['name']}"
    assert data == (ROOT / "bundle" / asset["name"].removeprefix("zen-mode-for-x-")).read_bytes(), f"Download differs from the package: {asset['name']}"

for path in SITE.rglob("*"):
    if not path.is_file() or ".vercel" in path.parts:
        continue
    assert path.suffix not in (".pem", ".key", ".p12", ".p8", ".log", ".har"), f"Private file type in site: {path.name}"
    if path.suffix in (".html", ".css", ".md", ".txt", ".json", ".xml", ".svg"):
        text = path.read_text()
        assert "/Users/" not in text, f"Personal path in {path.name}"
        assert not re.search(r"[\w.+-]+@(?:gmail|icloud|outlook)\.com", text), f"Personal email in {path.name}"
        assert "typefully" not in text.lower(), f"Removed brand in {path.name}"
        assert "—" not in text, f"Em dash in {path.name}"
assert (SITE / "fonts/OFL.txt").is_file(), "Font license missing"
print(f"PASS: local assets, anchors, image metadata, version {version}, checksums, and publication boundaries")
