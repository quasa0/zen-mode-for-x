import selectors from "../../selectors";
import addStyles, { removeStyles } from "./addStyles";

export function updateLeftSidebarPositioning() {
  const pathname = window.location.pathname;
  if (pathname.startsWith("/search") || pathname.startsWith("/messages") || pathname.startsWith("/i/chat")) {
    removeStyles("navigation-position");
    return;
  }
  addStyles(
      "navigation-position",
      `@media only screen and (min-width: 1000px) {
        ${selectors.leftSidebar} {
          position: fixed;
          left: 0;
        }
      }
      /* Add padding equal to navigation size when between 1000px-1265px */
      @media only screen and (min-width: 1000px) and (max-width: 1265px) {
        body {
          padding-left: 88px;
        }
      }`
  );
}
