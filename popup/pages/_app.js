import { useEffect } from "react";
import "../styles/globals.css";

// A system theme change recolors every element at once. Skip transitions for that frame so it snaps.
const useInstantThemeChange = () => {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const style = document.createElement("style");
      style.append(document.createTextNode("*,*::before,*::after{transition:none !important}"));
      document.head.append(style);
      void document.body.offsetHeight;
      requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
};

const MyApp = ({ Component, pageProps }) => {
  useInstantThemeChange();
  return <Component {...pageProps} />;
};

export default MyApp;
