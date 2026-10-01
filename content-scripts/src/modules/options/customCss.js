export const changeCustomCss = (cssText) => {
  if (typeof cssText !== "string") return;
  const existingStyleEl = document.getElementById("custom-css");
  if (!cssText.trim()) {
    existingStyleEl?.remove();
    return;
  }
  if (existingStyleEl) {
    existingStyleEl.textContent = cssText;
  } else {
    const head = document.querySelector("head");
    if (!head) return;
    const styleEl = document.createElement("style");
    styleEl.id = "custom-css";
    styleEl.textContent = cssText;
    head.appendChild(styleEl);
  }
};
