<img src=".github/assets/icon.png" width="64" height="64" alt="">

# Zen mode for X

A browser extension for Chrome, Firefox, and Safari that makes X quieter, cleaner, and easier to use with fewer visual distractions.

Website: [zen.quasa0.com](https://zen.quasa0.com)

## Features

- Default to the Following timeline
- Hide the sticky timeline header
- Remove timeline tabs
- Hide view counts and vanity counts under posts
- Remove promoted posts
- Independently hide Paid Partnership and Made with AI labels
- Hide trends, topics, "Who to follow," and other recommendation modules
- Hide Grok UI elements
- Customize the timeline width
- Remove timeline and post borders
- Customize the left navigation
- Hide navigation labels, badges, buttons, and shortcuts
- Add a Zen Writer Mode navigation shortcut
- Toggle the Zen Writer Mode shortcut from settings
- Hide the search bar or make it transparent
- Hide the main post button
- Suppress notification counts in the page title and favicon
- Export and import settings as JSON
- Add custom CSS
- Write in focus mode with the native composer and responsive layout
- Set an optional active-scrolling limit with subtle visual reminders
- Flag possible sales pitches, FOMO pressure, and vague bait with Jev
- Show photos from loaded profile posts in a separate panel

## Newer Additions

- AI Slop reply action: adds a guarded reply-level action that can report a reply as spam, block the author, and collapse the reported post after confirmation.
- Zen Writer Mode shortcut: adds a left-nav shortcut for quickly entering or leaving Writer Mode on X.
- Settings portability: exports and imports all extension settings from the popup.
- Stronger feed cleanup: hides more recommendation modules, including in-feed "Who to follow" suggestions.
- Redesigned settings: five tabs (Timeline, Focus, Navigation, Interface, Advanced) with real switches, short descriptions, and light and dark themes.
- Dev reload helper: reloads the Chrome extension during development with `yarn reload:chrome <extension-id>`.
- Reload robustness: handles extension reloads and invalidated storage contexts more gracefully.
- Title/favicon cleanup: strips repeated title counts and avoids old Twitter favicon fallbacks.

## Development

Requires classic Yarn.

- `yarn package:extension` builds Chrome and Firefox folders and ZIPs with installed dependencies. It runs no package installation. Add `--browser chrome` or `--browser firefox` for one target.
- The original interactive `yarn build` / `yarn bundle` flow also supports Safari conversion and runs Yarn dependency installation. Review dependencies before using it.
- `cd content-scripts && yarn watch` watches content-script changes.
- `cd content-scripts && yarn build` builds content scripts only.
- `cd popup && yarn build` builds the popup UI.
- `cd popup && yarn lint` runs ESLint.
- `cd popup && yarn check:prettier` checks formatting.
- `cd popup && yarn write:prettier` formats popup code.

## Automated Development and Testing

Use Node.js 22 or newer, classic Yarn, the existing project dependencies, and an installed Helium or Chrome. The runner checks whether the browser supports the required extension APIs. Helium is the default. Add `--browser chrome` to use Chrome.

1. `yarn test:extension` builds the extension in a disposable browser profile. It tests the real popup, content script, storage, reload, uninstall/reinstall, filters, navigation, timeline, writing mode, interface and scrolling reminders. Use `--suite smoke` for lifecycle checks or `--suite filters,navigation` for selected feature suites. Fixtures do not establish current live X coverage.
2. `yarn dev:extension` watches source files, rebuilds, reloads the extension, and refreshes the host page. It opens a browser window by default. Use `yarn dev:extension --headless --fixture` for an unattended fixture session. Stop the watcher with **Ctrl+C**.
3. `yarn login:extension` opens a normal browser window for a one-time X sign-in. This command disables extensions and uses no automation connection or viewport override. Profiles are stored in `.cache/extension-dev/profiles/{browser}`. Quit this dedicated browser or press **Ctrl+C** when finished. Later `dev:extension` and `inspect:extension` sessions reuse its login; fixture tests use disposable profiles.
4. `yarn inspect:extension --url https://x.com/home` captures fresh pages with the extension disabled and enabled at the same viewport. Open the generated `comparison.html` to review both screenshots, matched posts, and layout checks. Screenshots, HTML, metrics, and browser errors stay in the ignored `.cache/extension-dev/artifacts/` directory. Add `--eval-file /absolute/file.js` to run a DOM inspection expression.
5. `yarn audit:extension --headless` scrolls the authenticated Home feed and four public profiles. It compares filters off/on in the same document, checks native-node preservation, tests viewport bounds, focus mode and profile photos, and writes `live-audit.json`. Use `--steps 12..120` to set the Home scroll count. Use `--suite focus`, `--suite media`, or `--suite labels --url https://x.com/HANDLE/status/ID` for a targeted audit. It restores extension preferences and closes its browser. It does not follow accounts or publish posts.

Add `--settings /absolute/settings.json` to load registered settings through the real extension storage API. One session runs at a time; a shared session lock serializes these commands.

**Influence Warnings** is off by default. Save your own TypeSafe key in the Focus tab and enable the control. A small amber icon marks possible sales pitches, FOMO pressure, or vague bait. Click it to see separate estimated probabilities. It does not hide posts or claim to know an author's motives. Strict (90%) is the default; lower thresholds show more warnings.

The extension calls [Jev's HTTP API](https://docs.typesafe.ai/api) directly from its private background process. No application backend is involved. The key stays in extension-origin IndexedDB and never enters content scripts, settings exports, post markup, or result caches. Only visible public post text, quoted text, and link paths are sent. Link destinations, private messages, drafts, images, videos, cookies, and profile histories are not sent. Link query strings are removed. Jev is [text-only and strongest in English](https://docs.typesafe.ai/models).

Positive and negative results are cached locally for 30 days, up to 1,000 post URLs. A content hash and model/question revision invalidate edited or expanded posts. Threshold changes reuse stored probabilities. At most two requests run together. The default limit is 200 new scans per UTC day across all tabs; cached results remain available after the limit. Service failures leave posts visible and produce no warning. The Focus tab shows usage and lets you remove the key or clear the cache.

For a live test, `inspect:extension` and `audit:extension` accept `--jev-key-file /absolute/private-file`. The file must have mode 0600. The runner saves the key through the extension's own configuration message without printing it. Use `--suite influence` with `test:extension` for deterministic API, cache, badge, and lifecycle checks in a disposable profile; those checks use a fake key and mocked Jev responses.

`yarn test:influence` checks background security, concurrency, caching, budgets and failures without a browser. `yarn test:jev --key-file /absolute/private-file` evaluates 24 synthetic posts through the real provider and records probabilities, disagreement and latency. It makes 24 paid requests without automatic retries. Synthetic agreement is a regression signal, not a measure of real-feed accuracy.

After `yarn package:extension`, run `yarn test:extension:package` and `yarn test:extension:package --browser chrome`. These smoke tests install the actual Chrome package in disposable profiles, verify served content/CSS and popup assets, exercise filtering and storage, and clean up. Firefox manifests and archives are validated during packaging; Firefox and Safari runtime behavior require their own browser checks. Local packaging does not upload to a browser store.

Run `yarn test:extension:profile` to check that a newly saved cookie survives normal browser quit and an automated restart. Add `--browser chrome` for Chrome. This test opens a temporary normal window and uses a disposable profile and a local HTTP server. Run it when no one is entering credentials in another browser window.

The login browser quits through Chromium's normal macOS quit path (`SIGINT`). A forced shutdown reports an error because it can discard recent profile changes. See the [Chromium signal handlers](https://github.com/chromium/chromium/blob/154.0.8037.92/chrome/browser/chrome_browser_main_posix.cc).

Home inspection holds the first feed response constant for comparison. It records the baseline response in memory, then replaces one successful response after a real request in the enabled page. Both bodies must contain timeline data without GraphQL errors. Authentication and data failures pass through unchanged. Later pagination stays live. A changed Home/Following endpoint or two nonempty captures without shared post IDs fail the comparison. This uses the browser's native [Fetch response interception](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/). It does not save request headers, cookie values, or the recorded response body to the report.

Live inspection requires account navigation and a visible feed with a successful current Home request. A cached account name alone does not establish sign-in. Captures verify that the document and measured layout remain stable across the screenshot. The report flags horizontal overflow and an unfocused search form covering the timeline or navigation. These checks do not establish complete ad coverage; use live evidence and targeted fixture cases for each repair.

The live audit temporarily pauses Helium's bundled uBlock Origin for **x.com only** in the dedicated test profile. It verifies the installed blocker's source/API and disabled filtering state, then restores the previous trusted-site list in cleanup. This avoids crediting another blocker for this extension's ad removal. Its bridge follows [uBlock Origin's trusted-site messaging implementation](https://github.com/gorhill/uBlock/blob/master/src/js/messaging.js). Normal browser profiles are unchanged.

The automation uses Node.js built-ins and the browser's native CDP pipe. It installs no packages or browser binaries. It keeps the browser sandbox enabled and opens no debugging TCP port. It enables ordinary Developer Mode only in its dedicated or disposable profile. It verifies executing content and background receipts after each build. If CDP installation retains a stale registered worker, it performs a runtime reload and verifies the new receipt. This preserves extension preferences and its private IndexedDB key. Developer Mode is required for this normal reload path; Chromium otherwise [disables unpacked extensions](https://github.com/chromium/chromium/blob/154.0.8037.92/extensions/browser/disable_reason.h). The transport and extension lifecycle follow the audited official sources: [Puppeteer pipe transport](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/node/PipeTransport.ts), [Puppeteer extension APIs](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/Browser.ts), and [Chrome DevTools MCP reload implementation](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/src/tools/extensions.ts).

Native ad removal is independent of the opt-in **Paid partnerships** and **Made with AI** controls. Filters use platform labels, exclude user text and quotes, and hide native cells without deleting X nodes. X documents [paid partnerships](https://help.x.com/en/rules-and-policies/paid-partnerships-policy.html) separately from ads and [AI disclosures](https://help.x.com/en/business-and-advertising/brand-safety/industry-leadership-and-partnerships). Reports distinguish observed live labels from fixture-only coverage. Unknown or changed markup still requires new evidence and a repair.

**Mindful Scrolling** is off by default. Choose a limit from 1 to 120 minutes and a Gentle or Clear cue. Trusted feed scrolling starts the tab-local clock. Writing, hidden tabs, fullscreen media, chat and settings pause it. A two-minute break resets it. Amber begins at 80% of the limit; red begins at the limit. The cue supports a break or five-minute snooze, stays clear of native controls, and respects reduced motion. It keeps no browsing history and sends no data. Its passive edge cues take inspiration from the local Onward app. Runtime CSS comes from the extension bundle, so tests and releases use the same styles.

## Manual Installation

Build the extension, then load the browser-specific bundle:

- Chrome/Edge: load `bundle/chrome` from `chrome://extensions` with Developer mode enabled.
- Firefox: load `bundle/firefox/manifest.json` from `about:debugging#/runtime/this-firefox`.
- Safari: open `bundle/safari/Zen mode for X/Zen mode for X.xcodeproj`, select your own development team, and run it from Xcode.

## Brand assets

`assets/icon.svg` is the source mark. `python3 scripts/brand/render-icons.py` renders every extension, macOS, and Safari icon from the same geometry. The settings UI and website use [Geist](https://vercel.com/font) under the SIL Open Font License; see `fonts/Geist-LICENSE.txt`.

## Website

`site/` is a static page with no build step, published at [zen.quasa0.com](https://zen.quasa0.com). `scripts/site/check.py` validates it offline. `scripts/site/deploy.sh` deploys it to Vercel and then runs `scripts/site/smoke.py` against the public domain. Deploy only with the owner's authorization.

## License

MIT. See [LICENSE](./LICENSE). This project started as a fork of Minimal Twitter (MIT, Copyright (c) 2022 Mailbrew Inc.); the license notice is preserved.
