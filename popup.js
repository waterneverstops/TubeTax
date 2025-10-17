function sendUpdateToActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "RATE_UPDATED" });
  });
}

function save(rate) {
  const r = parseFloat(rate);
  if (!r || r <= 0) {
    document.getElementById("status").textContent =
      "Please enter a valid rate.";
    return;
  }
  chrome.storage.sync.set({ hourlyRate: r }, () => {
    document.getElementById("status").textContent = "Saved!";
    sendUpdateToActiveTab();
    setTimeout(
      () => (document.getElementById("status").textContent = ""),
      1200
    );
  });
}

chrome.storage.sync.get("hourlyRate", (data) => {
  if (data && data.hourlyRate) {
    document.getElementById("rate").value = data.hourlyRate;
  }
});

const rateInput = document.getElementById("rate");
document
  .getElementById("save")
  .addEventListener("click", () => save(rateInput.value));

document.getElementById("fill").addEventListener("click", () => {
  rateInput.value = 5;
  save(20);
});

document.getElementById("fill2").addEventListener("click", () => {
  rateInput.value = 20;
  save(50);
});
