# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Project Overview

Zen mode for X: an open-source browser extension for Chrome, Firefox, and Safari that makes the X.com interface calmer and customizable. It began as a fork of Minimal Twitter (MIT); keep the LICENSE notice. The product has no Typefully features, links, or branding. Do not reintroduce any.

Repository: https://github.com/quasa0/zen-mode-for-x
Website: https://zen.quasa0.com (static source in `site/`)

## Git Workflow

- Work directly on `main`; do not create feature branches for routine agent work in this repository.
- Push completed work to `origin/main` unless the user explicitly asks for a different branch.

## Build and Development Commands

### Building the Extension

Requires [classic yarn](https://classic.yarnpkg.com/lang/en/docs/install/).

- `yarn build` or `yarn bundle` - Builds and bundles the extension for all browsers (prompts for browser choice)
- `yarn package:extension` - Noninteractive Chrome/Firefox packaging with installed dependencies. No installs. Validates manifest resources and ZIP integrity before publishing local artifacts.
- `yarn test:extension:package` - Smoke-tests the actual Chrome package in disposable Helium. Add `--browser chrome` for Chrome. Run after packaging.
- `yarn test:extension` - Builds and tests the real extension in a disposable headless Helium profile. Add `--browser chrome` for Chrome.
  - `--suite influence` verifies Jev warnings with mocked API responses and a fake key. Never use real credentials in fixture tests.
- `yarn test:extension:profile` - Checks cookie persistence across normal quit and automated restart in a disposable profile. Opens a temporary normal window; do not run while the user is entering credentials.
- `yarn dev:extension --headless --fixture` - Watches sources and verifies automated build, extension reload, and host-page refresh against the fixture.
- `yarn inspect:extension --url https://x.com/home` - Captures fresh disabled/enabled pages and writes `comparison.html`. Holds the first Home feed response constant after a successful real request; later pagination stays live. Requires one-time sign-in with `yarn login:extension`.
- `yarn audit:extension --headless` - Scrolls authenticated Home and public profiles, compares stable native nodes with filters off/on, checks responsive layout, and restores preferences. No follow, post, like or report actions. Use `--steps 12..120` for the Home scroll count.
  - Targeted live audits: `--suite focus`, `--suite media`, or `--suite labels --url https://x.com/HANDLE/status/ID`.
- `yarn login:extension` - Opens the dedicated profile in a normal headed browser with extensions disabled and no CDP connection. Quit this browser or press Ctrl+C before starting a development or inspection session. Fixture tests use disposable profiles.
- Builds both popup (Next.js) and content-scripts (Rollup) automatically
- Creates bundled packages in `/bundle/` directory for Chrome, Firefox, and Safari

### Content Scripts (content-scripts/)

- `cd content-scripts && yarn watch` - Watch mode for content script development
- `cd content-scripts && yarn build` - Build content scripts only

### Popup UI (popup/)

- `cd popup && yarn dev` - Development server for popup UI (Next.js)
- `cd popup && yarn build` - Build popup for production
- `cd popup && yarn lint` - Run ESLint
- `cd popup && yarn check:prettier` - Check code formatting
- `cd popup && yarn write:prettier` - Format code with Prettier

### Development Workflow

1. Run `yarn build` at root once to build everything initially
2. For content-script changes: `cd content-scripts && yarn watch` (auto-rebuilds on save)
3. For popup changes: `cd popup && yarn build` (no watch mode, must rebuild manually)

**Important:** `yarn watch` builds to `content-scripts/dist/`, but the extension loads from `bundle/chrome/dist/`. To sync changes during development, either:

- Run `yarn build` at root after changes (slow, rebuilds everything)
- Or create a symlink once: `rm -rf bundle/chrome/dist && ln -s ../../content-scripts/dist bundle/chrome/dist`

Then load the extension in your browser (see below).

### Loading Extension for Testing

- Chrome/Edge: Load `bundle/chrome` folder at `chrome://extensions` (enable Developer mode)
- Firefox: Load `bundle/firefox/manifest.json` at `about:debugging#/runtime/this-firefox`

After making changes, refresh the extension in `chrome://extensions` to reload.

Always refresh the loaded extension and its X page after extension changes. The automated development runner performs both operations and verifies the current build receipt. Its dedicated profile does not change the extension installed in the user's normal browser profile. Stop agent-started watchers before finishing.

## Architecture

### Core Structure

**Three main parts:**

1. **content-scripts/**: Content scripts that run on x.com and apply customizations
2. **popup/**: Next.js app for the extension settings popup UI
3. **Root files**: Build scripts, manifests, shared utilities

### Settings and Storage

- **storage-keys.js** (root): Central registry of all feature keys and default preferences
  - All settings keys must be added to both `allSettingsKeys` array and `defaultPreferences` object
- Keys use format `Key[FeatureName]` (e.g., `KeySidebarLogo`)
- Jev API keys belong only in extension-origin IndexedDB through `zen-influence:configure`. Never add credentials to preference keys, source, cache entries, exports, DOM, or logs. Background requests use the fixed TypeSafe origin. Chrome uses background ES modules; Firefox MV2 packaging bundles them to a classic IIFE with installed Rollup.

### Content Script Flow

**Initialization** (content-scripts/src/modules/initialize.js):

1. Loads bundled stylesheets
2. Applies static features once
3. Runs dynamic features
4. Sets up MutationObserver for DOM changes
5. Extracts Twitter theme colors

**Features are categorized as static or dynamic:**

- **Static features** (content-scripts/src/modules/features/static.js):

  - Applied once on load or when settings change
  - Examples: timeline width, font changes, hide navigation buttons
  - Organized by category: timeline, navigation, interface, sidebar, advanced

- **Dynamic features** (content-scripts/src/modules/features/dynamic.js):
  - Reapplied on DOM mutations via MutationObserver
  - Examples: writer mode, view counts, influence warnings
  - Throttled to run max every 50ms

**Feature implementation files** (content-scripts/src/modules/options/):

- Each category has its own file (timeline.js, navigation.js, interface.js, etc.)
- Functions typically add/remove CSS classes or inject styles to enable/disable features

**Selectors** (content-scripts/src/selectors.js): **Critical file** containing all CSS selectors for Twitter UI elements. When Twitter changes their DOM structure, selectors break and need updating here. Selectors primarily use `data-testid` attributes (most stable), ARIA attributes, and structural CSS selectors. When fixing broken features, check this file first.

### Popup UI Structure

**Next.js app** (popup/):

- `components/Popup.js`: shell with the header, the master switch, and five tabs. Every panel stays mounted; inactive panels are `hidden`.
- `components/panels/`: one file per tab (TimelinePanel, FocusPanel, NavigationPanel, InterfacePanel, AdvancedPanel)
- `components/controls/`: compound controls (width slider, hidden counts, scroll limits, influence warnings, CSS editor, backup)
- `components/ui/`: primitives (`Switch`, `Segmented`, `Group`)
- `styles/globals.css`: the whole design system as plain CSS with `zm-` classes and tokens. Geist is bundled from `/fonts`. No Tailwind, no Stitches.
- Each switch uses its storage key as the element `id` and exposes `aria-checked`; the browser tests depend on both.
- Design rules: monochrome, sentence case, no cards around groups, no em dashes, color only for state. Animate only `transform`, `opacity`, `scale`, and color at 150 ms or less; press scale is `0.96`.
- Settings are saved to chrome.storage and synced to content scripts

## Adding a New Feature

To add a new feature toggle:

1. **Define the key** in `storage-keys.js`:

   - Add `export const KeyFeatureName = "featureName"`
   - Add to `allSettingsKeys` array
   - Add default value to `defaultPreferences` object

2. **Implement the feature logic** in appropriate file in `content-scripts/src/modules/options/`:

   - Create a function that applies the feature (usually adds/removes CSS classes)
   - Import and use utilities from `content-scripts/src/modules/utilities/`

3. **Register the feature**:

   - If static: Add to `staticFeatures` in `content-scripts/src/modules/features/static.js`
   - If dynamic: Add to `dynamicFeatures` in `content-scripts/src/modules/features/dynamic.js`
   - Import the key from storage-keys.js

4. **Add UI control** in the appropriate panel in `popup/components/panels/`:

   - Import the key from storage-keys.js
   - Add `<StorageSwitch storageKey={Key} label="Sentence case" description="One short sentence." />`

5. **SVG assets**: If new icons are needed, add to `content-scripts/src/modules/svgAssets.js`

## CSS and Styling

- Main in-page styles: `/css/main.css`
- Development and release builds load only bundled CSS. Do not fetch upstream runtime styles that can override the tested fork.
- Content scripts inject styles dynamically via `addStyleSheet()` and `addStyles()` utilities

## Browser Compatibility

- Chrome: Manifest V3 with service worker background
- Firefox: Manifest V2 with background scripts
- Safari: Converted from Firefox build using xcrun safari-web-extension-converter
- Manifests defined in `extension-manifests.js` and shared by release and development builds

## Releasing Updates

### Version Bump

1. Run `yarn bump-version` (prompts for patch/minor/major). This automatically updates:
   - `extension-manifests.js` - main version number
   - Xcode project (`project.pbxproj`) - MARKETING_VERSION and CURRENT_PROJECT_VERSION (build number incremented by 1)

2. Run `yarn build` to create bundles for all browsers

3. Commit and tag:
   ```bash
   git add . && git commit -m "Bump version to X.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```

4. Submit bundles to browser stores (Chrome Web Store, Firefox Add-ons, App Store via Xcode)

### Install and update behavior

`background.js` opens no page on install or update. Do not add a welcome or update tab.
