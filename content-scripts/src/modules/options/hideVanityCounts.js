import addStyles, { removeStyles } from "../utilities/addStyles";
import selectors from "../../selectors";

function changeCount(id, setting, selector) {
  if (setting === "hide") addStyles(id, `${selector} { visibility: hidden; }`);
  else removeStyles(id);
}

export const changeReplyCount = (setting) => changeCount("replyCount", setting, '[data-testid="reply"] span');

export const changeRetweetCount = (setting) => changeCount("retweetCount", setting, `
  [href$="/retweets"], [href$="/retweets/with_comments"],
  [data-testid="retweet"] span, [data-testid="unretweet"] span
`);

export const changeLikeCount = (setting) => changeCount("likeCount", setting, `
  [href$="/likes"][href*="/status/"],
  [data-testid="like"] span, [data-testid="unlike"] span
`);

export const changeFollowingAndFollowersCounts = (setting) => changeCount("followCount", setting, `
  ${selectors.mainColumn} a[role="link"][href$="/following"]:has(> span + span) > span:first-child,
  ${selectors.mainColumn} a[role="link"][href$="/followers"]:has(> span + span) > span:first-child,
  ${selectors.mainColumn} a[role="link"][href$="/verified_followers"]:has(> span + span) > span:first-child
`);
