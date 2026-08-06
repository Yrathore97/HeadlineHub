// Browser-only. Which homepage category rails a reader wants to see,
// persisted to localStorage. Never call during SSR - it uses
// localStorage/window.

export const RAIL_TOPICS = ['Sports', 'Business', 'Technology', 'Health'] as const;
export type RailTopic = (typeof RAIL_TOPICS)[number];

const TOPICS_KEY = 'nz_topics';

/** Defaults to every rail enabled - an empty/missing/corrupt preference
 *  should never hide content the reader never asked to hide. */
export function getEnabledTopics(): RailTopic[] {
  try {
    const raw = localStorage.getItem(TOPICS_KEY);
    if (!raw) return [...RAIL_TOPICS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...RAIL_TOPICS];
    return RAIL_TOPICS.filter((t) => parsed.includes(t));
  } catch {
    return [...RAIL_TOPICS];
  }
}

export function setEnabledTopics(topics: RailTopic[]): void {
  localStorage.setItem(TOPICS_KEY, JSON.stringify(topics));
  window.dispatchEvent(new CustomEvent('topics-changed', { detail: { topics } }));
}
