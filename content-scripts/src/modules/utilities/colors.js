const extractColor = (selector, varName) => {
  const element = document.querySelector(selector);
  if (element) {
    let color;
    if (varName.includes("bg")) {
      color = window.getComputedStyle(element).backgroundColor;
    } else if (varName.includes("border")) {
      color = window.getComputedStyle(element).borderColor;
    } else {
      color = window.getComputedStyle(element).color;
    }
    const root = document.documentElement;

    if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") return;

    const colorVarAlreadySet = root.style.getPropertyValue(`--${varName}-color`);

    if (colorVarAlreadySet === color) return;

    const colorRgb = color.match(/rgba?\(([^)]+)\)/)?.[1].split(",").slice(0, 3).join(",");
    root.style.setProperty(`--${varName}-color`, color);
    if (colorRgb) root.style.setProperty(`--${varName}-color-rgb`, colorRgb);
  }
};

export const extractColorsAsRootVars = () => {
  extractColor("body", "body-bg");
  extractColor('[data-testid="primaryColumn"]', "border");
  const mainText = document.querySelector('[data-testid="tweetText"], [data-testid="UserName"], [data-testid="primaryColumn"] h2, [data-testid^="tweetTextarea_"][role="textbox"]');
  if (mainText) {
    const color = getComputedStyle(mainText).color;
    if (document.documentElement.style.getPropertyValue("--main-text-color") !== color) {
      document.documentElement.style.setProperty("--main-text-color", color);
      const rgb = color.match(/rgba?\(([^)]+)\)/)?.[1].split(",").slice(0, 3).join(",");
      if (rgb) document.documentElement.style.setProperty("--main-text-color-rgb", rgb);
    }
  }
  extractColor("a > time", "secondary-text");
  extractColor("[data-testid='primaryColumn'] div[aria-haspopup='menu'] > div > div > svg", "secondary-text");
  extractColor("a", "accent");
  extractColor("div > svg", "glyphs");
};

export const observeThemeColors = () => {
  const observer = new MutationObserver(extractColorsAsRootVars);
  const options = { attributes: true, attributeFilter: ["style", "class", "data-theme"] };
  observer.observe(document.documentElement, options);
  if (document.body) observer.observe(document.body, options);
  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
};
