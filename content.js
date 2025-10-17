const OVERLAY_ID = "yt-time-cost-overlay";
let currentRate = null;
let lastVideoId = null;

function formatUSD(amount) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function findPlayerContainer() {
  // Prefer the player container to position overlay relative to the video
  return (
    document.querySelector("#player-container") ||
    document.querySelector("#full-bleed-container") ||
    document.querySelector(".html5-video-player") ||
    document.body
  );
}

function ensureOverlay() {
  let el = document.getElementById(OVERLAY_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = OVERLAY_ID;
    const container = findPlayerContainer();
    container.appendChild(el);
  }
  return el;
}

function getVideoEl() {
  // The main <video> element inside the player
  const player =
    document.querySelector("#movie_player video") ||
    document.querySelector("video");
  return player || null;
}

function computeAndRender() {
  if (!currentRate) return; // no rate set yet
  const video = getVideoEl();
  if (!video || !isFinite(video.duration) || video.duration <= 0) return;

  const cost = (currentRate * video.duration) / 3600;
  const overlay = ensureOverlay();
  overlay.textContent = `Time cost (full video): ${formatUSD(cost)}`;
}

function readRateAndRender() {
  chrome.storage.sync.get("hourlyRate", (data) => {
    currentRate = data?.hourlyRate || null;
    computeAndRender();
  });
}

function onVideoAvailableOnce(cb) {
  const start = Date.now();
  const timeoutMs = 10000;

  (function tick() {
    const v = getVideoEl();
    if (v && isFinite(v.duration) && v.duration > 0) {
      cb(v);
      return;
    }
    if (Date.now() - start > timeoutMs) return; // give up silently
    requestAnimationFrame(tick);
  })();
}

function getVideoIdFromUrl() {
  const url = new URL(location.href);
  return url.searchParams.get("v");
}

function handleNavigationIfChanged() {
  const vid = getVideoIdFromUrl();
  if (location.pathname !== "/watch") return; // only on watch pages
  if (vid && vid !== lastVideoId) {
    lastVideoId = vid;
    onVideoAvailableOnce(() => readRateAndRender());
  }
}

// React to popup changes immediately
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "RATE_UPDATED") {
    readRateAndRender();
  }
});

// Also react if storage changes elsewhere
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.hourlyRate) {
    currentRate = changes.hourlyRate.newValue;
    computeAndRender();
  }
});

// Respond to YouTube SPA navigations
window.addEventListener("yt-navigate-finish", handleNavigationIfChanged);
window.addEventListener("yt-navigate-start", () => {
  // Clear overlay when leaving a video
  const el = document.getElementById(OVERLAY_ID);
  if (el) el.textContent = "";
});

// Fallback: observe DOM mutations for older/newer layouts
const mo = new MutationObserver(() => handleNavigationIfChanged());
mo.observe(document.documentElement, { childList: true, subtree: true });

// Initial kick
handleNavigationIfChanged();
