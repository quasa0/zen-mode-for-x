import selectors from "../../selectors";
import addStyles, { removeStyles, stylesExist } from "../utilities/addStyles";

const HIDDEN_CLASS = "mt-hidden-view-count";

export default function changeHideViewCounts(setting) {
  if (setting === "off") {
    removeStyles("hideViewCount");
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((element) => element.classList.remove(HIDDEN_CLASS));
    return;
  }
  if (setting !== "on") return;
  if (!stylesExist("hideViewCount")) addStyles("hideViewCount", `a.${HIDDEN_CLASS}[href*='/analytics'], .${HIDDEN_CLASS}:has(a[href*='/analytics']) { display: none !important; }`);
  const hiddenActions = new Set();
  document.querySelectorAll(selectors.viewCount).forEach((link) => {
    const group = link.closest('[role="group"]');
    let action = link;
    while (action.parentElement && action.parentElement !== group) action = action.parentElement;
    // Hide only the analytics action. Never hide the group or other action buttons.
    const otherControls = Array.from(action.querySelectorAll('a, button, [role="button"]')).some((control) => control !== link && !link.contains(control));
    if (group && !otherControls) {
      hiddenActions.add(action);
    }
  });
  document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach(element => {
    if (!hiddenActions.has(element)) element.classList.remove(HIDDEN_CLASS);
  });
  hiddenActions.forEach(element => element.classList.add(HIDDEN_CLASS));
}
