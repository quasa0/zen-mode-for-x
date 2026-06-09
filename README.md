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

## Manual Installation

Build the extension, then load the browser-specific bundle:

- Chrome/Edge: load `bundle/chrome` from `chrome://extensions` with Developer mode enabled.
- Firefox: load `bundle/firefox/manifest.json` from `about:debugging#/runtime/this-firefox`.
- Safari: open the generated Xcode project under `bundle/safari` and run it from Xcode.

## License

MIT. See [LICENSE](./LICENSE).
