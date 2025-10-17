const OVERLAY_ID = "yt-time-cost-overlay";
let hourlyRate = null;
let lastVideoId = null;

// === helpers ===
const fmtUSD = (a) =>
  a.toLocaleString("en-US", { style: "currency", currency: "USD" });

function parseDurationToSeconds(txt) {
  if (!txt) return 0;
  txt = txt.trim().toUpperCase();
  if (txt.includes("LIVE") || txt.includes("ПРЯМО")) return 0;
  const p = txt.split(":").map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  const single = parseInt(txt, 10);
  return Number.isFinite(single) ? single : 0;
}

function computeCost(sec) {
  if (!hourlyRate || !sec) return null;
  return (hourlyRate * sec) / 3600;
}

function loadRate(cb) {
  chrome.storage.sync.get("hourlyRate", (data) => {
    hourlyRate = data?.hourlyRate ?? null;
    cb && cb();
  });
}

// === player overlay ===
function ensurePlayerOverlay() {
  let el = document.getElementById(OVERLAY_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = OVERLAY_ID;
    Object.assign(el.style, {
      position: "absolute",
      top: "12px",
      right: "12px",
      background: "rgba(0,0,0,0.7)",
      color: "#fff",
      fontSize: "14px",
      padding: "6px 10px",
      borderRadius: "6px",
      pointerEvents: "none",
      zIndex: "1000",
      whiteSpace: "nowrap",
    });
    const container =
      document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player") ||
      document.body;
    container.appendChild(el);
  }
  return el;
}

function updatePlayerOverlay() {
  const video =
    document.querySelector("#movie_player video") ||
    document.querySelector("video");
  if (!video || !hourlyRate || !isFinite(video.duration) || video.duration <= 0)
    return;
  const cost = computeCost(video.duration);
  const el = ensurePlayerOverlay();
  el.textContent = `💰 ${fmtUSD(cost)} total`;
}

// === watch for changes ===
function handleWatchPage() {
  const url = new URL(location.href);
  const vid = url.searchParams.get("v");
  if (location.pathname === "/watch" && vid && vid !== lastVideoId) {
    lastVideoId = vid;
    setTimeout(updatePlayerOverlay, 2000);
  }
}

function updateThumbnails() {
  if (!hourlyRate) return;

  const cards = document.querySelectorAll(
    "ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer"
  );

  for (const card of cards) {
    // если уже есть бейдж — пропускаем
    if (card.querySelector(".yt-time-cost-thumb")) continue;

    // пытаемся достать длительность
    const timeEl =
      card.querySelector("ytd-thumbnail-overlay-time-status-renderer") ||
      card.querySelector(".ytd-thumbnail-overlay-time-status-renderer") ||
      card.querySelector(
        "span#text.ytd-thumbnail-overlay-time-status-renderer"
      );
    if (!timeEl) continue;

    const text =
      timeEl.getAttribute("aria-label") || timeEl.textContent?.trim() || "";
    const seconds = parseDurationToSeconds(text);
    const cost = computeCost(seconds);
    if (!cost) continue;

    // ищем превью (thumbnail)
    const thumb =
      card.querySelector("ytd-thumbnail") || card.querySelector("a#thumbnail");
    if (!thumb) continue;
    thumb.style.position = "relative";

    // создаём бейдж
    const badge = document.createElement("div");
    badge.className = "yt-time-cost-thumb";
    Object.assign(badge.style, {
      position: "absolute",
      right: "4px",
      bottom: "4px",
      background: "rgba(0,0,0,0.7)",
      color: "#fff",
      fontSize: "12px",
      padding: "2px 4px",
      borderRadius: "3px",
      pointerEvents: "none",
      zIndex: "50",
      whiteSpace: "nowrap",
    });
    badge.textContent = `💰 ${fmtUSD(cost)}`;
    thumb.appendChild(badge);
  }
}

// === постоянный опрос, чтобы поймать ленивую подгрузку ===
setInterval(updateThumbnails, 2000);

// === listen for changes ===
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "RATE_UPDATED") {
    loadRate(() => {
      updateThumbnails();
      updatePlayerOverlay();
    });
  }
});
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "sync" && "hourlyRate" in ch) {
    hourlyRate = ch.hourlyRate.newValue ?? null;
    updateThumbnails();
    updatePlayerOverlay();
  }
});

// === init ===
(function init() {
  // 1. Загружаем ставку
  chrome.storage.sync.get("hourlyRate", (data) => {
    hourlyRate = data?.hourlyRate ?? null;

    // 2. Если ставки нет — просто ждём, пока пользователь её задаст
    if (!hourlyRate) {
      console.log("[YT Time Cost] Hourly rate not set yet, waiting...");
      // слушаем, когда ставка появится
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && "hourlyRate" in changes) {
          hourlyRate = changes.hourlyRate.newValue ?? null;
          if (hourlyRate) {
            console.log("[YT Time Cost] Hourly rate loaded later:", hourlyRate);
            updateThumbnails();
            updatePlayerOverlay();
          }
        }
      });
      return;
    }

    // 3. Если ставка есть — сразу всё запускаем
    console.log("[YT Time Cost] Loaded hourly rate:", hourlyRate);
    updateThumbnails();
    handleWatchPage();

    // 4. Следим за изменениями страницы
    const obs = new MutationObserver(() => {
      updateThumbnails();
      handleWatchPage();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    // 5. Фоновая проверка для ленивых карточек
    setInterval(updateThumbnails, 2000);
  });
})();
