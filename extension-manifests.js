const manifest = {
  name: "Minimal Theme for Twitter / X",
  short_name: "Minimal Twitter",
  description: "Refine and declutter the 𝕏/Twitter web experience.",
  version: "6.4.1",
  icons: {
    16: "images/MinimalTwitterIcon16.png",
    32: "images/MinimalTwitterIcon32.png",
    48: "images/MinimalTwitterIcon48.png",
    128: "images/MinimalTwitterIcon128.png",
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
        "css/typefully.css",
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
      16: "images/MinimalTwitterIcon16.png",
      32: "images/MinimalTwitterIcon32.png",
      48: "images/MinimalTwitterIcon48.png",
    },
    default_title: "Minimal Twitter",
    default_popup: "index.html",
  },
};

export const MANIFEST_FIREFOX = {
  ...manifest,
  manifest_version: 2,
  permissions: [...manifest.permissions, "https://api.typesafe.ai/*"],
  browser_specific_settings: {
    gecko: {
      id: "{e7476172-097c-4b77-b56e-f56a894adca9}",
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
    "css/typefully.css",
    "fonts/inter-subset.woff2",
  ],
  browser_action: {
    default_icon: {
      16: "images/MinimalTwitterIcon16.png",
      32: "images/MinimalTwitterIcon32.png",
      48: "images/MinimalTwitterIcon48.png",
    },
    default_title: "Minimal Twitter",
    default_popup: "index.html",
  },
};
