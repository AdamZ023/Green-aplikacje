const apiKey = document.querySelector("#apiKey");
const scannerId = document.querySelector("#scannerId");
const operatorName = document.querySelector("#operator");
const statusBox = document.querySelector("#status");
const loginView = document.querySelector("#loginView");
const operationView = document.querySelector("#operationView");
const receivePanel = document.querySelector("#receivePanel");
const movePanel = document.querySelector("#movePanel");
const loginButton = document.querySelector("#loginButton");
const chooseReceive = document.querySelector("#chooseReceive");
const chooseMove = document.querySelector("#chooseMove");
const changeOperator = document.querySelector("#changeOperator");
const receiveQtyButton = document.querySelector("#receiveQtyButton");
const receiveQtyValue = document.querySelector("#receiveQtyValue");
const moveQuantity = document.querySelector("#moveQuantity");
const scanCapture = document.querySelector("#scanCapture");
const newScannerIdButton = document.querySelector("#newScannerId");
const sessionScannerId = document.querySelector("#sessionScannerId");
const sessionOperator = document.querySelector("#sessionOperator");
const deviceUid = getOrCreateDeviceUid();

let mode = null;
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

const params = new URLSearchParams(window.location.search);
const urlApiKey = params.get("key") || params.get("api_key") || "";

apiKey.value = urlApiKey || localStorage.getItem("wmsApiKey") || "";
scannerId.value = localStorage.getItem("wmsScannerId") || "";
operatorName.value = localStorage.getItem("wmsOperator") || "";

for (const field of [apiKey, scannerId, operatorName]) {
  field.addEventListener("change", saveSettings);
}

operatorName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    login();
  }
});

loginButton.addEventListener("click", login);
chooseReceive.addEventListener("click", openReceive);
chooseMove.addEventListener("click", openMove);
changeOperator.addEventListener("click", showLogin);
newScannerIdButton.addEventListener("click", assignNewScannerId);

for (const button of document.querySelectorAll(".backToOperations")) {
  button.addEventListener("click", showOperationChoice);
}

for (const target of document.querySelectorAll(".scan-target")) {
  target.addEventListener("click", () => setActiveTarget(target.dataset.target));
}

scanCapture.addEventListener("input", () => {
  scanBuffer = scanCapture.value;
  clearTimeout(scanTimer);
  scanTimer = setTimeout(flushScan, 120);
});

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
  if (
    event.target instanceof HTMLInputElement
    && event.target !== scanCapture
    && event.target.matches(":focus")
  ) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    flushScan();
    return;
  }

  if (event.key.length !== 1) return;
  if (event.target === scanCapture) return;
  scanBuffer += event.key;
  clearTimeout(scanTimer);
  scanTimer = setTimeout(flushScan, 120);
});

document.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) {
    return;
  }
  focusScanCapture();
});

bootstrap();

async function bootstrap() {
  if (urlApiKey) {
    localStorage.setItem("wmsApiKey", urlApiKey);
  }

  if (!apiKey.value.trim()) {
    setStatus("Zeskanuj QR z panelu WMS.", true);
    showLogin();
    return;
  }

  await ensureScannerId();
  if (operatorName.value.trim() && scannerId.value.trim()) {
    showOperationChoice();
  } else {
    showLogin();
    operatorName.focus();
  }
}

function saveSettings() {
  localStorage.setItem("wmsApiKey", apiKey.value);
  localStorage.setItem("wmsScannerId", scannerId.value);
  localStorage.setItem("wmsOperator", operatorName.value);
}

async function login() {
  if (!apiKey.value.trim()) {
    setStatus("Zeskanuj QR z panelu WMS.", true);
    return;
  }
  if (!scannerId.value.trim()) {
    await ensureScannerId();
  }
  if (!scannerId.value.trim()) {
    setStatus("Nie mozna nadac ID skanera.", true);
    return;
  }
  if (!operatorName.value.trim()) {
    setStatus("Wpisz operatora.", true);
    operatorName.focus();
    return;
  }
  saveSettings();
  showOperationChoice();
}

function showLogin() {
  hideWorkflows();
  loginView.classList.remove("hidden");
  operatorName.focus();
  setStatus(scannerId.value ? `Skaner ${scannerId.value}. Wpisz operatora.` : "Nadawanie ID skanera...", false);
}

function showOperationChoice() {
  hideWorkflows();
  loginView.classList.add("hidden");
  operationView.classList.remove("hidden");
  sessionScannerId.textContent = scannerId.value;
  sessionOperator.textContent = operatorName.value;
  setStatus("Wybierz operacje.", false);
}

function openReceive() {
  if (!canWork()) return;
  resetReceive(false);
  hideWorkflows();
  mode = "receive";
  receivePanel.classList.remove("hidden");
  setActiveTarget("receiveSku");
  setStatus("Zeskanuj produkt.", false);
}

function openMove() {
  if (!canWork()) return;
  resetMove(false);
  hideWorkflows();
  mode = "move";
  movePanel.classList.remove("hidden");
  setActiveTarget("moveSku");
  setStatus("Zeskanuj produkt.", false);
}

function hideWorkflows() {
  operationView.classList.add("hidden");
  receivePanel.classList.add("hidden");
  movePanel.classList.add("hidden");
  mode = null;
}

function setActiveTarget(target) {
  activeTarget = target;
  for (const element of document.querySelectorAll(".scan-target")) {
    element.classList.toggle("active", element.dataset.target === activeTarget);
  }
  focusScanCapture();
}

function flushScan() {
  const value = scanBuffer.trim();
  scanBuffer = "";
  scanCapture.value = "";
  clearTimeout(scanTimer);
  if (!value || !mode) return;
  handleScan(value);
}

function focusScanCapture() {
  setTimeout(() => {
    const active = document.activeElement;
    if (active === apiKey || active === operatorName || active === moveQuantity) return;
    scanCapture.focus({ preventScroll: true });
  }, 0);
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
  await registerScannerId(false);
}

async function assignNewScannerId() {
  if (!apiKey.value.trim()) {
    setStatus("Zeskanuj QR z panelu WMS.", true);
    return;
  }
  scannerId.value = "";
  operatorName.value = "";
  localStorage.removeItem("wmsScannerId");
  localStorage.removeItem("wmsOperator");
  await registerScannerId(true);
  operatorName.focus();
}

async function registerScannerId(forceNew) {
  setStatus("Nadawanie ID skanera...", false);
  const response = await fetch("/api/scanners/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey.value
    },
    body: JSON.stringify({
      device_uid: deviceUid,
      force_new: forceNew
    })
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

function getOrCreateDeviceUid() {
  const existing = localStorage.getItem("wmsDeviceUid");
  if (existing) return existing;
  const generated = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem("wmsDeviceUid", generated);
  return generated;
}

function canWork() {
  if (!apiKey.value.trim()) {
    setStatus("Zeskanuj QR z panelu WMS.", true);
    showLogin();
    return false;
  }
  if (!scannerId.value.trim()) {
    setStatus("Brak ID skanera.", true);
    ensureScannerId();
    return false;
  }
  if (!operatorName.value.trim()) {
    setStatus("Wpisz operatora przed rozpoczeciem pracy.", true);
    showLogin();
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
