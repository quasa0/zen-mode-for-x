import { useEffect, useState } from "react";
import { KeyFollowCount, KeyLikeCount, KeyReplyCount, KeyRetweetCount } from "../../../storage-keys";
import { getStorage, setStorage } from "../../utilities/chromeStorage";
import ToggleChevron from "../ui/ToggleChevron";
import { CheckboxControl } from "../ui/checkboxes";

const countKeys = [KeyReplyCount, KeyRetweetCount, KeyLikeCount, KeyFollowCount];
const keyForType = { reply: KeyReplyCount, retweet: KeyRetweetCount, like: KeyLikeCount, follow: KeyFollowCount };
const hiddenFrom = (values) => Object.fromEntries(countKeys.map((key) => [key, values[key] === "hide"]));

const VanityCheckboxes = () => {
  const [showVanityCheckboxes, setShowVanityCheckboxes] = useState(false);
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

  const onCheckedChange = async (type, checked) => {
    if (!loaded) return;
    const hidden = checked === true;
    const keys = type === "all" ? countKeys : [keyForType[type]];
    const changedCounts = Object.fromEntries(keys.map((key) => [key, hidden]));
    setHiddenCounts((current) => ({ ...current, ...changedCounts }));
    try {
      await setStorage(Object.fromEntries(keys.map((key) => [key, hidden ? "hide" : "show"])));
    } catch (error) {
      console.warn(error);
      setHiddenCounts(hiddenFrom(await getStorage(countKeys)));
    }
  };

  return (
    <fieldset disabled={!loaded} className="w-full min-w-0 border-0 p-0 m-0">
      <CheckboxControl
        id="all"
        label="Engagements Under Posts"
        description="Hides the visible numbers that make posts feel like scoreboards: reply totals, repost totals, like totals, and follower/following counts. The underlying buttons and profiles still work."
        labelExtras={<ToggleChevron pressed={showVanityCheckboxes} onClick={setShowVanityCheckboxes} />}
        checked={hideAll}
        onCheckedChange={(checked) => onCheckedChange("all", checked)}
        crossedIcon
      />
      {showVanityCheckboxes && (
        <div className="pl-3 flex flex-col gap-4 mb-2">
          <CheckboxControl
            crossedIcon
            id="reply"
            label="Reply Count from Tweets"
            description="Hides only the numeric reply total shown under posts. You can still open the replies or use the reply action."
            onCheckedChange={(checked) => onCheckedChange("reply", checked)}
            checked={hiddenCounts[KeyReplyCount]}
          />
          <CheckboxControl
            crossedIcon
            id="retweet"
            label="Retweet Count from Tweets"
            description="Hides repost and quote-post totals under posts while keeping the repost menu and action available."
            onCheckedChange={(checked) => onCheckedChange("retweet", checked)}
            checked={hiddenCounts[KeyRetweetCount]}
          />
          <CheckboxControl
            crossedIcon
            id="like"
            label="Like Count from Tweets"
            description="Hides like totals in timelines and tweet detail pages while keeping the like button itself visible."
            onCheckedChange={(checked) => onCheckedChange("like", checked)}
            checked={hiddenCounts[KeyLikeCount]}
          />
          <CheckboxControl
            crossedIcon
            id="follow"
            label="Follower/Following Count"
            description="Hides follower and following totals on profiles so accounts are not visually framed around audience size."
            onCheckedChange={(checked) => onCheckedChange("follow", checked)}
            checked={hiddenCounts[KeyFollowCount]}
          />
        </div>
      )}
    </fieldset>
  );
};

export default VanityCheckboxes;
