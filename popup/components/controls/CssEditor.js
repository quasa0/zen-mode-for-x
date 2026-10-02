import { css } from "@codemirror/lang-css";
import CodeMirror from "@uiw/react-codemirror";
import debounce from "lodash.debounce";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyCustomCss } from "../../../storage-keys";
import { getStorage, setStorage } from "../../utilities/chromeStorage";

const darkScheme = "(prefers-color-scheme: dark)";

const CssEditor = ({ active }) => {
  const [cssText, setCssText] = useState("");
  const [dark, setDark] = useState(() => globalThis.matchMedia?.(darkScheme).matches ?? false);
  const hasEdited = useRef(false);

  const syncCss = useMemo(() => debounce(async (value) => {
    try { await setStorage({ [KeyCustomCss]: value }); }
    catch (error) { console.warn(error); }
  }, 1000), []);

  const onChange = useCallback((value) => {
    const newCss = value || "";
    hasEdited.current = true;
    setCssText(newCss);
    syncCss(newCss);
  }, [syncCss]);

  useEffect(() => {
    const query = window.matchMedia(darkScheme);
    const onSchemeChange = (event) => setDark(event.matches);
    query.addEventListener("change", onSchemeChange);
    return () => query.removeEventListener("change", onSchemeChange);
  }, []);

  useEffect(() => {
    let active = true;
    const setInitialSavedCss = async () => {
      try {
        const customCss = await getStorage(KeyCustomCss);
        if (active && !hasEdited.current) setCssText(customCss || "");
      } catch (error) {
        console.warn(error);
      }
    };

    const flushCss = () => syncCss.flush();
    window.addEventListener("pagehide", flushCss);
    window.addEventListener("beforeunload", flushCss);
    setInitialSavedCss();
    return () => {
      active = false;
      syncCss.flush();
      syncCss.cancel();
      window.removeEventListener("pagehide", flushCss);
      window.removeEventListener("beforeunload", flushCss);
    };
  }, [syncCss]);

  // Leaving the tab hides the editor. Save pending edits at that moment.
  useEffect(() => {
    if (!active) syncCss.flush();
  }, [active, syncCss]);

  return (
    <div className="zm-editor" id="user-control-advanced">
      <CodeMirror theme={dark ? "dark" : "light"} value={cssText} placeholder="/* Rules here load on every X page */" height="220px" extensions={[css()]} onChange={onChange} />
    </div>
  );
};

export default CssEditor;
