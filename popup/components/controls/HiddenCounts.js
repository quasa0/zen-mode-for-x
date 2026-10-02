import { useEffect, useState } from "react";
import { KeyFollowCount, KeyLikeCount, KeyReplyCount, KeyRetweetCount } from "../../../storage-keys";
import { getStorage, setStorage } from "../../utilities/chromeStorage";
import { SwitchRow } from "../ui/Switch";

const counts = [
  { id: "reply", key: KeyReplyCount, label: "Replies" },
  { id: "retweet", key: KeyRetweetCount, label: "Reposts" },
  { id: "like", key: KeyLikeCount, label: "Likes" },
  { id: "follow", key: KeyFollowCount, label: "Followers and following" },
];
const countKeys = counts.map((count) => count.key);
const hiddenFrom = (values) => Object.fromEntries(countKeys.map((key) => [key, values[key] === "hide"]));

const HiddenCounts = () => {
  const [hiddenCounts, setHiddenCounts] = useState(() => hiddenFrom({}));
  const [loaded, setLoaded] = useState(false);
  const hiddenValues = Object.values(hiddenCounts);
  const hideAll = hiddenValues.every(Boolean) ? true : hiddenValues.some(Boolean) ? "indeterminate" : false;

  useEffect(() => {
    let active = true;
    let initialReadComplete = false;
    const changesBeforeRead = {};
    const storageEvents = globalThis.chrome?.storage?.onChanged;
    const onStorageChanged = (changes, area) => {
      if (!active || area !== "local") return;
      const next = Object.fromEntries(countKeys.filter((key) => Object.hasOwn(changes, key)).map((key) => [key, changes[key].newValue]));
      if (!Object.keys(next).length) return;
      if (!initialReadComplete) Object.assign(changesBeforeRead, next);
      else setHiddenCounts((current) => ({ ...current, ...Object.fromEntries(Object.entries(next).map(([key, value]) => [key, value === "hide"])) }));
    };
    storageEvents?.addListener(onStorageChanged);
    getStorage(countKeys).then((values) => {
      if (!active) return;
      setHiddenCounts(hiddenFrom({ ...values, ...changesBeforeRead }));
      initialReadComplete = true;
      setLoaded(true);
    }).catch((error) => {
      if (!active) return;
      console.warn(error);
      initialReadComplete = true;
      setLoaded(true);
    });
    return () => {
      active = false;
      storageEvents?.removeListener(onStorageChanged);
    };
  }, []);

  const onCheckedChange = async (keys, hidden) => {
    if (!loaded) return;
    setHiddenCounts((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, hidden])) }));
    try {
      await setStorage(Object.fromEntries(keys.map((key) => [key, hidden ? "hide" : "show"])));
    } catch (error) {
      console.warn(error);
      setHiddenCounts(hiddenFrom(await getStorage(countKeys)));
    }
  };

  return (
    <>
      <SwitchRow
        id="all"
        label="Engagement counts"
        description="Hides the numbers only. Reply, repost, like and follow still work."
        checked={hideAll}
        onCheckedChange={(checked) => onCheckedChange(countKeys, checked)}
        ready={loaded}
      />
      <fieldset className="zm-sub" disabled={!loaded}>
        {counts.map((count) => (
          <SwitchRow key={count.id} id={count.id} label={count.label} checked={hiddenCounts[count.key]} onCheckedChange={(checked) => onCheckedChange([count.key], checked)} ready={loaded} />
        ))}
      </fieldset>
    </>
  );
};

export default HiddenCounts;
