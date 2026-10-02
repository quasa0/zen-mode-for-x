const OWNED_UI = '[id^="mt-"], .mt-tooltip, .mt-videoResolutionOverlay, .mt-sidebar-button, .mt-writer-mode-composer-button';
const COUNTS = '[data-testid="like"], [data-testid="unlike"], [data-testid="retweet"], [data-testid="unretweet"], [data-testid="reply"]';

const asElement = (node) => node?.nodeType === 1 ? node : node?.parentElement;
const hasVideo = (node) => node?.nodeType === 1 && (node.matches("video") || !!node.querySelector("video"));

function canSkipRecord(mutation) {
  const target = asElement(mutation.target);
  const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
  if (target?.closest("head") || target?.closest(OWNED_UI)) return true;
  // Media can mount under a videoPlayer that already exists. It needs metadata listeners.
  if (nodes.some(hasVideo)) return false;
  if (target?.closest(COUNTS)) return true;
  // Edited or recycled post text must invalidate cached influence warnings.
  if (target?.closest('[data-testid="tweetText"]')) return false;
  if (target?.closest('[data-testid^="tweetTextarea_"][role="textbox"]')) return true;
  if (!nodes.length) return false;
  return nodes.every((node) => {
    const element = asElement(node);
    if (element?.closest(OWNED_UI)) return true;
    // Profile photos can load after their tweetPhoto container was inserted.
    if (element?.matches("img") && (element.closest('[data-testid="tweetPhoto"]') || target?.closest('[data-testid="tweetPhoto"]'))) return false;
    if (node.nodeType !== 1) {
      // Draft text does not change the composer controls. Other text can identify ads or suggestions.
      return !!target?.closest('[data-testid^="tweetTextarea_"][role="textbox"]');
    }
    return ["IMG", "SCRIPT", "STYLE", "path"].includes(node.nodeName);
  });
}

export default function isMutationSkippable(mutations) {
  // Every record and every changed node must be irrelevant before skipping a batch.
  return mutations.length > 0 && Array.from(mutations).every(canSkipRecord);
}
