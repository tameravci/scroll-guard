(function attachScheduler(root, factory) {
  const api = factory();
  root.ScrollGuard = Object.assign(root.ScrollGuard || {}, { scheduler: api });
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createScheduler() {
  "use strict";

  // Requests the page keeps open at once. The worker has its own cap for many tabs.
  const MAX_IN_FLIGHT = 4;
  // How far ahead of the screen, in screen heights, to prefetch in the scroll direction.
  const AHEAD_SCREENS = 1;
  // How far behind the screen a post still gets checked.
  const BEHIND_SCREENS = 0.5;
  // Faster than this, in screens per second, the user is flinging, not reading.
  const FLING_SPEED = 3;
  const RETRY_BASE_MS = 4000;
  const RETRY_MAX_MS = 60000;

  // Tier 0: on screen. Tier 1: ahead in the scroll direction. Tier 2: just behind.
  // Posts outside these bands are not worth a paid request yet.
  function tierOf(rect, viewport, direction) {
    if (rect.bottom > 0 && rect.top < viewport) return 0;
    const below = rect.top >= viewport;
    const gap = below ? rect.top - viewport : -rect.bottom;
    const ahead = direction >= 0 ? below : !below;
    if (ahead && gap < viewport * AHEAD_SCREENS) return 1;
    if (!ahead && gap < viewport * BEHIND_SCREENS) return 2;
    return null;
  }

  // Order candidates as a reader meets them: on-screen posts top to bottom, then the
  // nearest posts ahead, then the nearest posts behind.
  function order(candidates, viewport, direction) {
    return candidates
      .map((candidate) => {
        const tier = tierOf(candidate.rect, viewport, direction);
        const below = candidate.rect.top >= viewport;
        const distance = tier === 0
          ? candidate.rect.top
          : below ? candidate.rect.top - viewport : -candidate.rect.bottom;
        return { ...candidate, tier, distance };
      })
      .filter((candidate) => candidate.tier !== null)
      .sort((left, right) => left.tier - right.tier || left.distance - right.distance);
  }

  function isFling(speed) {
    return speed > FLING_SPEED;
  }

  function retryDelay(attempts) {
    return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
  }

  // Tracks scroll direction and speed from scroll events.
  function createScrollTracker(now = () => Date.now()) {
    const state = { y: null, at: 0, direction: 1, speed: 0 };
    return {
      update(y, viewport) {
        const time = now();
        if (state.y !== null) {
          const elapsed = Math.max(1, time - state.at);
          const moved = y - state.y;
          if (moved !== 0) state.direction = Math.sign(moved);
          state.speed = (Math.abs(moved) / Math.max(1, viewport)) / (elapsed / 1000);
        }
        state.y = y;
        state.at = time;
      },
      // Speed decays to zero once scroll events stop.
      speed() {
        return now() - state.at > 150 ? 0 : state.speed;
      },
      direction() {
        return state.direction;
      }
    };
  }

  return {
    MAX_IN_FLIGHT,
    createScrollTracker,
    isFling,
    order,
    retryDelay,
    tierOf
  };
});
