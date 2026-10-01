import { removeElementById } from "./removeElement";

export default function addStyles(id, css) {
  const text = css.trim().split("\n").join("");
  const existing = document.getElementById("mt-style-" + id);
  if (existing?.textContent === text) return;
  removeElementById("mt-style-" + id);

  const head = document.querySelector("head");
  const style = document.createElement("style");
  style.id = "mt-style-" + id;
  style.textContent = text;
  head.appendChild(style);
}

export function removeStyles(id) {
  removeElementById("mt-style-" + id);
}

export function stylesExist(id) {
  return document.getElementById("mt-style-" + id);
}
