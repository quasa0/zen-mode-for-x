const manifest = {
  name: "Zen mode for X",
  short_name: "Zen mode",
  description: "A calmer X. Hide ads, counts and clutter, set a scrolling limit, and write without the feed.",
  version: "6.4.1",
  icons: {
    16: "images/icon-16.png",
    32: "images/icon-32.png",
    48: "images/icon-48.png",
    128: "images/icon-128.png",
  },
  permissions: ["storage"],
  options_ui: {
    page: "index.html",
    open_in_tab: true,
  },
};

export const MANIFEST_CHROME = {
  ...manifest,
  manifest_version: 3,
  host_permissions: ["https://api.typesafe.ai/*"],
  background: {
    service_worker: "background.js",
    type: "module",
  },
  content_scripts: [
    {
      run_at: "document_end",
      matches: [
        "https://twitter.com/*",
        "https://mobile.twitter.com/*",
        "https://x.com/*",
      ],
      js: ["dist/main.js"],
    },
  ],
  web_accessible_resources: [
    {
      resources: [
        "css/main.css",
        "fonts/inter-subset.woff2",
      ],
      matches: [
        "https://twitter.com/*",
        "https://mobile.twitter.com/*",
        "https://x.com/*",
      ],
    },
  ],
  action: {
    default_icon: {
      16: "images/icon-16.png",
      32: "images/icon-32.png",
      48: "images/icon-48.png",
    },
    default_title: "Zen mode for X",
    default_popup: "index.html",
  },
};

export const MANIFEST_FIREFOX = {
  ...manifest,
  manifest_version: 2,
  permissions: [...manifest.permissions, "https://api.typesafe.ai/*"],
  browser_specific_settings: {
    gecko: {
      id: "zen-mode-for-x@quasa0.com",
    },
  },
  background: {
    scripts: ["background.js"],
    persistent: false,
  },
  content_scripts: [
    {
      run_at: "document_idle",
      matches: [
        "https://twitter.com/*",
        "https://mobile.twitter.com/*",
        "https://x.com/*",
      ],
      js: ["dist/main.js"],
    },
  ],
  web_accessible_resources: [
    "css/main.css",
    "fonts/inter-subset.woff2",
  ],
  browser_action: {
    default_icon: {
      16: "images/icon-16.png",
      32: "images/icon-32.png",
      48: "images/icon-48.png",
    },
    default_title: "Zen mode for X",
    default_popup: "index.html",
  },
};
