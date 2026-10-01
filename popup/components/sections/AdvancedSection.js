import { css } from "@codemirror/lang-css";
import CodeMirror from "@uiw/react-codemirror";
import debounce from "lodash.debounce";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyCustomCss } from "../../../storage-keys";
import { getStorage, setStorage } from "../../utilities/chromeStorage";
import SectionLabel from "../ui/SectionLabel";

const AdvancedSection = () => {
  const [showEditor, setShowEditor] = useState(false);
  const [cssText, setCssText] = useState("");
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

  return (
    <section className="flex flex-col gap-y-2">
      <SectionLabel htmlFor="user-control-advanced">
        <span>Advanced</span>
        {!showEditor ? (
          <>
            <span> · </span>
            <button onClick={() => setShowEditor(true)} className="text-x-premium">
              Show CSS Editor
            </button>
          </>
        ) : (
          <>
            <span> · </span>
            <button onClick={() => { syncCss.flush(); setShowEditor(false); }} className="text-x-premium">
              Hide CSS Editor
            </button>
          </>
        )}
      </SectionLabel>
      {showEditor && (
        <div className="flex flex-col items-center justify-between dark:bg-x-bgTwoDark bg-x-bgTwo rounded-2xl relative overflow-hidden" id="user-control-advanced">
          <CodeMirror className="w-full text-sm" theme="dark" value={cssText} placeholder="// Write custom CSS here..." height="300px" extensions={[css()]} onChange={onChange} />
        </div>
      )}
    </section>
  );
};

export default AdvancedSection;
