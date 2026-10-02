#!/usr/bin/env python3
"""Copy the packaged extension ZIPs into site/downloads and write site/release.json.

Run `yarn package:extension` first. The ZIPs are not committed; release.json is.
"""
import hashlib
import json
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
version = re.search(r'version:\s*"(\d+\.\d+\.\d+)"', (ROOT / "extension-manifests.js").read_text())[1]
assets = []
(SITE / "downloads").mkdir(exist_ok=True)
for browser in ("chrome", "firefox"):
    source = ROOT / "bundle" / f"{browser}.zip"
    packaged = json.loads((ROOT / "bundle" / browser / "manifest.json").read_text())
    assert packaged["version"] == version and packaged["name"] == "Zen mode for X", f"Stale {browser} package. Run yarn package:extension."
    name = f"zen-mode-for-x-{browser}.zip"
    shutil.copyfile(source, SITE / "downloads" / name)
    data = source.read_bytes()
    assets.append({"name": name, "url": f"https://zen.quasa0.com/downloads/{name}", "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
(SITE / "release.json").write_text(json.dumps({"name": "Zen mode for X", "version": version, "license": "MIT", "assets": assets}, indent=2) + "\n")
print(f"Wrote site/release.json for {version}")
