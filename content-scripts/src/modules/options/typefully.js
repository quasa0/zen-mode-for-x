import addStyles, { removeStyles } from "../utilities/addStyles";
import { setTypefullyEnhancementsEnabled } from "../typefullyPlugs";

// Function to change Typefully Composer Buttons
export const changeTypefullyEnhancementsButtons = (typefullyEnhancementsButtons) => {
  switch (typefullyEnhancementsButtons) {
    case "off":
      setTypefullyEnhancementsEnabled(false);
      addStyles(
        "typefullyEnhancementsButtons",
        `
        #typefully-link, 
        #typefully-link-inline,
        #typefully-reply-link, 
        #typefully-writermode-link, 
        #typefully-callout-box,
        #typefully-schedule-button,
        #typefully-image-download-button,
        #typefully-gif-download-button,
        #typefully-video-download-button {
          display: none;
        }
        `
      );
      break;

    case "on":
      setTypefullyEnhancementsEnabled(true);
      removeStyles("typefullyEnhancementsButtons");
      break;
  }
};
