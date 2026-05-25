const apiKey = document.querySelector("#apiKey");
const scannerId = document.querySelector("#scannerId");
const operatorName = document.querySelector("#operator");
const statusBox = document.querySelector("#status");
const modeTabs = [...document.querySelectorAll(".mode-tab")];
const receivePanel = document.querySelector("#receivePanel");
const movePanel = document.querySelector("#movePanel");
const receiveQtyButton = document.querySelector("#receiveQtyButton");
const receiveQtyValue = document.querySelector("#receiveQtyValue");
const moveQuantity = document.querySelector("#moveQuantity");

let mode = "receive";
let activeTarget = "receiveSku";
let scanBuffer = "";
let scanTimer = null;
let receiveQuantity = 1;
const state = {
  receiveSku: "",
  receiveLocation: "",
  moveSku: "",
  moveFrom: "",
  moveTo: ""
};

apiKey.value = localStorage.getItem("wmsApiKey") || "";
scannerId.value = localStorage.getItem("wmsScannerId") || "";
operatorName.value = localStorage.getItem("wmsOperator") || "";

for (const field of [apiKey, scannerId, operatorName]) {
  field.addEventListener("change", saveSettings);
}

apiKey.addEventListener("change", ensureScannerId);
ensureScannerId();

for (const tab of modeTabs) {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
}

for (const target of document.querySelectorAll(".scan-target")) {
  target.addEventListener("click", () => setActiveTarget(target.dataset.target));
}

receiveQtyButton.addEventListener("click", () => {
  const value = prompt("Ilosc do przyjecia", String(receiveQuantity));
  if (value === null) return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    setStatus("Ilosc musi byc liczba wieksza od zera.", true);
    return;
  }
  receiveQuantity = parsed;
  receiveQtyValue.textContent = `${receiveQuantity} szt.`;
});

document.querySelector("#receiveReset").addEventListener("click", resetReceive);
document.querySelector("#moveReset").addEventListener("click", resetMove);
document.querySelector("#moveSubmit").addEventListener("click", submitMove);

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.target instanceof HTMLInputElement && event.target.matches(":focus")) return;

  if (event.key === "Enter") {
    event.preventDefault();
    flushScan();
    return;
  }

  if (event.key.length !== 1) return;
  scanBuffer += event.key;
  clearTimeout(scanTimer);
  scanTimer = setTimeout(flushScan, 120);
});

function saveSettings() {
  localStorage.setItem("wmsApiKey", apiKey.value);
  localStorage.setItem("wmsScannerId", scannerId.value);
  localStorage.setItem("wmsOperator", operatorName.value);
}

function setMode(nextMode) {
  mode = nextMode;
  receivePanel.classList.toggle("hidden", mode !== "receive");
  movePanel.classList.toggle("hidden", mode !== "move");
  for (const tab of modeTabs) {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  }
  setActiveTarget(mode === "receive" ? "receiveSku" : "moveSku");
  setStatus(mode === "receive" ? "Tryb przyjecia." : "Tryb przesuniecia.", false);
}

function setActiveTarget(target) {
  activeTarget = target;
  for (const element of document.querySelectorAll(".scan-target")) {
    element.classList.toggle("active", element.dataset.target === activeTarget);
  }
}

function flushScan() {
  const value = scanBuffer.trim();
  scanBuffer = "";
  clearTimeout(scanTimer);
  if (!value) return;
  handleScan(value);
}

async function handleScan(value) {
  state[activeTarget] = value;
  updateDisplays();

  if (mode === "receive") {
    if (activeTarget === "receiveSku") {
      setActiveTarget("receiveLocation");
      setStatus("Zeskanuj lokalizacje.", false);
      return;
    }
    if (activeTarget === "receiveLocation") {
      await submitReceive();
    }
    return;
  }

  if (activeTarget === "moveSku") {
    setActiveTarget("moveFrom");
    setStatus("Zeskanuj lokalizacje zrodlowa.", false);
  } else if (activeTarget === "moveFrom") {
    setActiveTarget("moveTo");
    setStatus("Zeskanuj lokalizacje docelowa.", false);
  } else if (activeTarget === "moveTo") {
    setStatus("Wprowadz ilosc i nacisnij Przesun.", false);
  }
}

async function submitReceive() {
  if (!canWork()) return;
  if (!state.receiveSku || !state.receiveLocation) {
    setStatus("Zeskanuj produkt i lokalizacje.", true);
    return;
  }

  const ok = await send("/api/stock/receive", {
    sku: state.receiveSku,
    location: state.receiveLocation,
    quantity: receiveQuantity,
    scanner_id: scannerId.value.trim(),
    operator: operatorName.value.trim() || null
  });

  if (ok) {
    setStatus(`Przyjeto ${receiveQuantity} szt.`, false);
    state.receiveSku = "";
    receiveQuantity = 1;
    receiveQtyValue.textContent = "1 szt.";
    setActiveTarget("receiveSku");
    updateDisplays();
  }
}

async function submitMove() {
  if (!canWork()) return;
  const qty = Number(moveQuantity.value);
  if (!state.moveSku || !state.moveFrom || !state.moveTo || !Number.isInteger(qty) || qty < 1) {
    setStatus("Uzupelnij produkt, obie lokalizacje i ilosc.", true);
    return;
  }

  const ok = await send("/api/stock/move", {
    sku: state.moveSku,
    from_location: state.moveFrom,
    to_location: state.moveTo,
    quantity: qty,
    scanner_id: scannerId.value.trim(),
    operator: operatorName.value.trim() || null
  });

  if (ok) {
    setStatus(`Przesunieto ${qty} szt.`, false);
    resetMove(false);
  }
}

async function send(url, body) {
  saveSettings();
  setStatus("Wysylanie...", false);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey.value
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setStatus(payload.detail || "Blad operacji.", true);
    return false;
  }

  return true;
}

async function ensureScannerId() {
  if (scannerId.value.trim() || !apiKey.value.trim()) return;
  setStatus("Nadawanie ID skanera...", false);
  const response = await fetch("/api/scanners/register", {
    method: "POST",
    headers: { "X-API-Key": apiKey.value }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setStatus(payload.detail || "Nie mozna nadac ID skanera.", true);
    return;
  }
  scannerId.value = payload.scanner_id;
  saveSettings();
  setStatus(`Nadano ID ${scannerId.value}. Wpisz operatora.`, false);
}

function canWork() {
  if (!apiKey.value.trim()) {
    setStatus("Wpisz klucz API.", true);
    return false;
  }
  if (!scannerId.value.trim()) {
    setStatus("Brak ID skanera. Sprawdz klucz API.", true);
    ensureScannerId();
    return false;
  }
  if (!operatorName.value.trim()) {
    setStatus("Wpisz operatora przed rozpoczeciem pracy.", true);
    operatorName.focus();
    return false;
  }
  return true;
}

function resetReceive(showMessage = true) {
  state.receiveSku = "";
  state.receiveLocation = "";
  receiveQuantity = 1;
  receiveQtyValue.textContent = "1 szt.";
  setActiveTarget("receiveSku");
  updateDisplays();
  if (showMessage) setStatus("Wyczyszczono przyjecie.", false);
}

function resetMove(showMessage = true) {
  state.moveSku = "";
  state.moveFrom = "";
  state.moveTo = "";
  moveQuantity.value = "1";
  setActiveTarget("moveSku");
  updateDisplays();
  if (showMessage) setStatus("Wyczyszczono przesuniecie.", false);
}

function updateDisplays() {
  setText("#receiveSkuValue", state.receiveSku || "Zeskanuj produkt");
  setText("#receiveLocationValue", state.receiveLocation || "Zeskanuj lokalizacje");
  setText("#moveSkuValue", state.moveSku || "Zeskanuj produkt");
  setText("#moveFromValue", state.moveFrom || "Zeskanuj lokalizacje zrodlowa");
  setText("#moveToValue", state.moveTo || "Zeskanuj lokalizacje docelowa");
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function setStatus(message, isError) {
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
}

updateDisplays();
