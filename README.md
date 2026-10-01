# Zen Mode for X

A browser extension for Chrome, Firefox, and Safari that makes X/Twitter quieter, cleaner, and easier to use with fewer visual distractions.

## Features

- Default to the Following timeline
- Hide the sticky timeline header
- Remove timeline tabs
- Hide view counts and vanity counts under posts
- Remove promoted posts
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

## Newer Additions

- AI Slop reply action: adds a guarded reply-level action that can report a reply as spam, block the author, and collapse the reported post after confirmation.
- Zen Writer Mode shortcut: adds a left-nav shortcut for quickly entering or leaving Writer Mode on X.
- Settings portability: exports and imports all extension settings from the popup.
- Stronger feed cleanup: hides more recommendation modules, including in-feed "Who to follow" suggestions.
- Clearer popup controls: adds more descriptive settings text and a cleaner control layout.
- Dev reload helper: reloads the Chrome extension during development with `yarn reload:chrome <extension-id>`.
- Reload robustness: handles extension reloads and invalidated storage contexts more gracefully.
- Title/favicon cleanup: strips repeated title counts and avoids old Twitter favicon fallbacks.

## Development

Requires classic Yarn.

- `yarn build` or `yarn bundle` builds and bundles the extension.
- `cd content-scripts && yarn watch` watches content-script changes.
- `cd content-scripts && yarn build` builds content scripts only.
- `cd popup && yarn build` builds the popup UI.
- `cd popup && yarn lint` runs ESLint.
- `cd popup && yarn check:prettier` checks formatting.
- `cd popup && yarn write:prettier` formats popup code.

## Automated Development and Testing

Use Node.js 22 or newer, classic Yarn, the existing project dependencies, and an installed Helium or Chrome. The runner checks whether the browser supports the required extension APIs. Helium is the default. Add `--browser chrome` to use Chrome.

1. `yarn test:extension` builds the extension and runs a disposable browser profile. It tests the real popup, content script, storage updates, extension reload, and uninstall/reinstall against an X-shaped fixture. These checks do not verify the latest live X markup.
2. `yarn dev:extension` watches source files, rebuilds, reloads the extension, and refreshes the host page. It opens a browser window by default. Use `yarn dev:extension --headless --fixture` for an unattended fixture session. Stop the watcher with **Ctrl+C**.
3. `yarn login:extension` opens a normal browser window for a one-time X sign-in. This command disables extensions and uses no automation connection or viewport override. Profiles are stored in `.cache/extension-dev/profiles/{browser}`. Quit this dedicated browser or press **Ctrl+C** when finished. Later `dev:extension` and `inspect:extension` sessions reuse its login; fixture tests use disposable profiles.
4. `yarn inspect:extension --url https://x.com/home` captures fresh pages with the extension disabled and enabled at the same viewport. Open the generated `comparison.html` to review both screenshots, matched posts, and layout checks. Screenshots, HTML, metrics, and browser errors stay in the ignored `.cache/extension-dev/artifacts/` directory. Add `--eval-file /absolute/file.js` to run a DOM inspection expression.

Add `--settings /absolute/settings.json` to load registered settings through the real extension storage API. One session runs at a time; a shared session lock serializes these commands.

Run `yarn test:extension:profile` to check that a newly saved cookie survives normal browser quit and an automated restart. Add `--browser chrome` for Chrome. This test opens a temporary normal window and uses a disposable profile and a local HTTP server. Run it when no one is entering credentials in another browser window.

The login browser quits through Chromium's normal macOS quit path (`SIGINT`). A forced shutdown reports an error because it can discard recent profile changes. See the [Chromium signal handlers](https://github.com/chromium/chromium/blob/154.0.8037.92/chrome/browser/chrome_browser_main_posix.cc).

Home inspection holds the first feed response constant for comparison. It records the baseline response in memory, then replaces one successful response after a real request in the enabled page. Both bodies must contain timeline data without GraphQL errors. Authentication and data failures pass through unchanged. Later pagination stays live. A changed Home/Following endpoint or two nonempty captures without shared post IDs fail the comparison. This uses the browser's native [Fetch response interception](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/). It does not save request headers, cookie values, or the recorded response body to the report.

Live inspection requires account navigation and a visible feed with a successful current Home request. A cached account name alone does not establish sign-in. Captures verify that the document and measured layout remain stable across the screenshot. The report flags horizontal overflow and an unfocused search form covering the timeline or navigation. These checks do not establish complete ad coverage; use live evidence and targeted fixture cases for each repair.

The automation uses Node.js built-ins and the browser's native CDP pipe. It installs no packages or browser binaries. It keeps the browser sandbox enabled and opens no debugging TCP port. The transport and extension lifecycle follow the audited official sources: [Puppeteer pipe transport](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/node/PipeTransport.ts), [Puppeteer extension APIs](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/Browser.ts), and [Chrome DevTools MCP reload implementation](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/src/tools/extensions.ts).

## Manual Installation

Build the extension, then load the browser-specific bundle:

- Chrome/Edge: load `bundle/chrome` from `chrome://extensions` with Developer mode enabled.
- Firefox: load `bundle/firefox/manifest.json` from `about:debugging#/runtime/this-firefox`.
- Safari: open the generated Xcode project under `bundle/safari` and run it from Xcode.

## License

MIT. See [LICENSE](./LICENSE).
