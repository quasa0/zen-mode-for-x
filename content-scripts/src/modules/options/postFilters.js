import { KeyRemoveAiPosts, KeyRemovePaidPartnershipPosts, KeyRemovePromotedPosts } from "../../../../storage-keys";
import addStyles, { removeStyles } from "../utilities/addStyles";

const classes = { ad: "mt-filter-ad", paid: "mt-filter-paid", ai: "mt-filter-ai" };
const options = { ad: true, paid: false, ai: false };
let marked = new Set();
const normalize = (value) => value?.replace(/\s+/g, " ").trim().toLowerCase() || "";

// X documents these as separate content disclosures, independent of native ads:
// https://help.x.com/en/rules-and-policies/paid-partnerships-policy.html
// https://help.x.com/en/business-and-advertising/brand-safety/industry-leadership-and-partnerships
const excludedContent = '[data-testid="tweetText"], [data-testid="User-Name"], [data-testid="quoteTweet"], [data-testid="card.wrapper"], div[role="link"], [data-testid^="UserAvatar-"]';

const ownedBy = (element, post) => {
  const excluded = element.closest(excludedContent);
  return element.closest('[data-testid="tweet"]') === post && (!excluded || !post.contains(excluded));
};

export const getPostLabels = (post) => {
  const labels = { ad: !!post.closest('[data-testid="placementTracking"]'), paid: false, ai: false };
  for (const disclosure of post.querySelectorAll('[data-testid="contentDisclosureButton"]')) {
    if (!ownedBy(disclosure, post)) continue;
    const texts = [disclosure, ...disclosure.querySelectorAll("span")].map((element) => normalize(element.textContent));
    labels.paid ||= texts.some((text) => /^(paid partnership|paid promotion)(?: with .+)?$/.test(text));
    labels.ai ||= texts.some((text) => /^(made with ai|ai-generated)$/.test(text));
  }
  // Current X also renders noninteractive disclosure rows with an icon and label.
  for (const badge of post.querySelectorAll("span")) {
    if (!ownedBy(badge, post) || badge.children.length || !badge.parentElement.querySelector(":scope > svg")) continue;
    const text = normalize(badge.textContent);
    labels.paid ||= /^(paid partnership|paid promotion)(?: with .+)?$/.test(text);
    labels.ai ||= /^(made with ai|ai-generated)$/.test(text);
  }
  // Native Ad/Promoted badges live outside post text, author names and quoted cards.
  // Exact badge text avoids treating posts discussing advertising as advertisements.
  if (!labels.ad) {
    labels.ad = [...post.querySelectorAll("span")].some((element) =>
      ownedBy(element, post) && !element.closest('[data-testid="contentDisclosureButton"]') &&
      !element.children.length && /^(ad|promoted|boosted)$/.test(normalize(element.textContent)));
  }
  return labels;
};

export const refreshPostFilters = () => {
  for (const element of marked) {
    element.classList.remove(...Object.values(classes));
    element.removeAttribute("data-mt-filter-reason");
  }
  marked = new Set();
  if (!Object.values(options).some(Boolean)) return;
  for (const post of document.querySelectorAll('[data-testid="tweet"]')) {
    if (post.parentElement?.closest('[data-testid="tweet"], [data-testid="quoteTweet"]')) continue;
    const labels = getPostLabels(post);
    const reasons = Object.keys(classes).filter((kind) => options[kind] && labels[kind]);
    if (!reasons.length) continue;
    const cell = post.closest('[data-testid="cellInnerDiv"]');
    const target = cell && cell.querySelectorAll('[data-testid="tweet"]').length === 1 ? cell : post;
    target.classList.add(...reasons.map((kind) => classes[kind]));
    target.setAttribute("data-mt-filter-reason", reasons.join(" "));
    marked.add(target);
  }
  if (options.ad) {
    for (const element of document.querySelectorAll('[data-testid="whoToFollowSspAd"]')) {
      element.classList.add(classes.ad);
      element.setAttribute("data-mt-filter-reason", "ad");
      marked.add(element);
    }
  }
};

export const changePostFilters = (data) => {
  for (const [key, kind] of [[KeyRemovePromotedPosts, "ad"], [KeyRemovePaidPartnershipPosts, "paid"], [KeyRemoveAiPosts, "ai"]]) {
    if (data[key] !== undefined) options[kind] = data[key] === "on";
  }
  if (Object.values(options).some(Boolean)) {
    addStyles("postFilters", `${Object.values(classes).map((name) => `.${name}`).join(",")} { display: none !important; }`);
  } else removeStyles("postFilters");
  if (options.ad) addStyles("quickPromote", 'a[href*="quick_promote_web"] { display: none !important; }');
  else removeStyles("quickPromote");
  refreshPostFilters();
};
