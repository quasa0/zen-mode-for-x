import selectors from "../../selectors";

const templates = new WeakMap();

const localPath = (href) => {
  if (!href) return;
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin === window.location.origin) return url.pathname;
  } catch {}
};

export const addSidebarButton = ({ name, href, userHref, onClick, svgAsset, nativeSelector }) => {
  const profileNode = document.querySelector(`${selectors.leftSidebarLinks} > a[role="link"][data-testid="AppTabBar_Profile_Link"]`);
  const navigation = profileNode?.parentElement;
  if (!navigation) return;

  let destination = href;
  if (userHref) {
    const profilePath = localPath(profileNode.getAttribute("href"));
    if (!profilePath || !/^\/[^/]+\/?$/.test(profilePath)) return;
    destination = `${profilePath.replace(/\/$/, "")}${userHref}`;
  }

  const matches = [...navigation.children].filter((element) => {
    if (nativeSelector && element.matches(nativeSelector)) return true;
    if (element.getAttribute("aria-label")?.toLowerCase() === name.toLowerCase()) return true;
    if (!destination || !element.matches("a[href]")) return false;
    const path = localPath(element.getAttribute("href"));
    return path === destination || (userHref && path?.endsWith(userHref));
  });
  const owned = matches.filter((element) => element.classList.contains("mt-sidebar-button"));
  const native = matches.find((element) => !element.classList.contains("mt-sidebar-button"));

  // X owns its native navigation nodes and handlers. Remove only our duplicates.
  if (native) {
    owned.forEach((element) => element.remove());
    return native;
  }

  const existing = owned[0];
  owned.slice(1).forEach((element) => element.remove());
  const template = `${destination || ""}\n${profileNode.className}\n${profileNode.innerHTML}`;
  if (existing && templates.get(existing) === template) return existing;

  const newNode = createNewElement({ name, destination, onClick, svgAsset, profileNode });
  if (!newNode) return;
  templates.set(newNode, template);
  if (existing) existing.replaceWith(newNode);
  else navigation.insertBefore(newNode, profileNode);
  return newNode;
};

const createNewElement = ({ profileNode, name, destination, onClick, svgAsset }) => {
  if (!destination && !onClick) return;
  const newNode = destination ? profileNode.cloneNode(true) : document.createElement("button");
  if (destination) {
    newNode.setAttribute("href", destination);
  } else {
    newNode.className = profileNode.className;
    newNode.innerHTML = profileNode.innerHTML;
    newNode.type = "button";
    newNode.style.cssText = "border:0;background:none;padding:0;text-align:inherit;font:inherit;color:inherit;cursor:pointer";
    newNode.onclick = () => onClick(newNode);
  }

  newNode.setAttribute("aria-label", name);
  newNode.removeAttribute("aria-labelledby");
  newNode.removeAttribute("aria-describedby");
  newNode.removeAttribute("aria-current");
  newNode.removeAttribute("aria-selected");
  for (const element of [newNode, ...newNode.querySelectorAll("[id], [data-testid]")]) {
    element.removeAttribute("id");
    element.removeAttribute("data-testid");
  }
  newNode.classList.add("mt-sidebar-button");
  const icon = newNode.querySelector("svg");
  if (!icon) return;
  icon.innerHTML = svgAsset;
  const label = newNode.querySelector("span");
  if (label) label.textContent = name;
  return newNode;
};
