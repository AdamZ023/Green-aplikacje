const apiKey = document.querySelector("#apiKey");
const scannerId = document.querySelector("#scannerId");
const operatorName = document.querySelector("#operator");
const statusBox = document.querySelector("#status");
const loginView = document.querySelector("#loginView");
const operationView = document.querySelector("#operationView");
const receivePanel = document.querySelector("#receivePanel");
const movePanel = document.querySelector("#movePanel");
const pickingPanel = document.querySelector("#pickingPanel");
const loginButton = document.querySelector("#loginButton");
const chooseReceive = document.querySelector("#chooseReceive");
const chooseMove = document.querySelector("#chooseMove");
const choosePicking = document.querySelector("#choosePicking");
const choosePlacement = document.querySelector("#choosePlacement");
const changeOperator = document.querySelector("#changeOperator");
const receiveQtyButton = document.querySelector("#receiveQtyButton");
const receiveQtyValue = document.querySelector("#receiveQtyValue");
const moveQuantity = document.querySelector("#moveQuantity");
const scanCapture = document.querySelector("#scanCapture");
const newScannerIdButton = document.querySelector("#newScannerId");
const sessionScannerId = document.querySelector("#sessionScannerId");
const sessionOperator = document.querySelector("#sessionOperator");
const receiveResult = document.querySelector("#receiveResult");
const moveResult = document.querySelector("#moveResult");
const pickingResult = document.querySelector("#pickingResult");
const pickingBatchChoice = document.querySelector("#pickingBatchChoice");
const pickingBatchList = document.querySelector("#pickingBatchList");
const pickingWork = document.querySelector("#pickingWork");
const pickingProduct = document.querySelector("#pickingProduct");
const pickingDetails = document.querySelector("#pickingDetails");
const pickingDestination = document.querySelector("#pickingDestination");
const pickingDestinationValue = document.querySelector("#pickingDestinationValue");
const placementPanel = document.querySelector("#placementPanel");
const placementResult = document.querySelector("#placementResult");
const placementWorkspaceChoice = document.querySelector("#placementWorkspaceChoice");
const placementWorkspaceList = document.querySelector("#placementWorkspaceList");
const placementWork = document.querySelector("#placementWork");
const placementWorkspaceTitle = document.querySelector("#placementWorkspaceTitle");
const placementInstruction = document.querySelector("#placementInstruction");
const placementCurrent = document.querySelector("#placementCurrent");
const placementPositionValue = document.querySelector("#placementPositionValue");
const placementMap = document.querySelector("#placementMap");
const deviceUid = getOrCreateDeviceUid();
const PLACEMENT_CONFIRM_CODE = "ODSTAW";

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
  moveTo: "",
  pickingSku: "",
  pickingFrom: ""
};
let activePickingTask = null;
let selectedPickingBatch = null;
let selectedPlacementWorkspace = null;
let placementPallets = [];
let activePlacementPallet = null;

const params = new URLSearchParams(window.location.search);
const urlApiKey = params.get("key") || params.get("api_key") || "";
const loginSessionId = params.get("session") || "";

apiKey.value = urlApiKey || localStorage.getItem("wmsApiKey") || "";
scannerId.value = loginSessionId ? "" : localStorage.getItem("wmsScannerId") || "";
operatorName.value = loginSessionId ? "" : localStorage.getItem("wmsOperator") || "";

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
choosePicking.addEventListener("click", openPicking);
choosePlacement.addEventListener("click", openPlacement);
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
document.querySelector("#loadPickingTask").addEventListener("click", () => loadPickingTask());
document.querySelector("#completePickingTask").addEventListener("click", submitPicking);
document.querySelector("#finishPickingBatch").addEventListener("click", finishSelectedPicking);
document.querySelector("#pickingReset").addEventListener("click", resetPickingScans);
document.querySelector("#placementRefresh").addEventListener("click", loadPlacementPallets);
document.querySelector("#placementReset").addEventListener("click", resetPlacementScan);

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
  if (loginSessionId) {
    localStorage.setItem("wmsLoginSession", loginSessionId);
    localStorage.removeItem("wmsScannerId");
    localStorage.removeItem("wmsOperator");
    scannerId.value = "";
    operatorName.value = "";
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
  clearResult(receiveResult);
  hideWorkflows();
  mode = "receive";
  receivePanel.classList.remove("hidden");
  setActiveTarget("receiveSku");
  setStatus("Zeskanuj produkt.", false);
}

function openMove() {
  if (!canWork()) return;
  resetMove(false);
  clearResult(moveResult);
  hideWorkflows();
  mode = "move";
  movePanel.classList.remove("hidden");
  setActiveTarget("moveSku");
  setStatus("Zeskanuj produkt.", false);
}

async function openPicking() {
  if (!canWork()) return;
  resetPickingScans(false);
  clearResult(pickingResult);
  hidePickingDestination();
  hideWorkflows();
  mode = "picking";
  pickingPanel.classList.remove("hidden");
  selectedPickingBatch = null;
  activePickingTask = null;
  pickingWork.classList.add("hidden");
  pickingBatchChoice.classList.remove("hidden");
  await loadPickingBatches();
}

async function openPlacement() {
  if (!canWork()) return;
  hideWorkflows();
  mode = "placement";
  placementPanel.classList.remove("hidden");
  selectedPlacementWorkspace = null;
  activePlacementPallet = null;
  placementPallets = [];
  placementWork.classList.add("hidden");
  placementWorkspaceChoice.classList.remove("hidden");
  clearResult(placementResult);
  await loadPlacementWorkspaces();
}

function hideWorkflows() {
  operationView.classList.add("hidden");
  receivePanel.classList.add("hidden");
  movePanel.classList.add("hidden");
  pickingPanel.classList.add("hidden");
  placementPanel.classList.add("hidden");
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
  if (navigator.maxTouchPoints > 0) return;
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
      clearResult(receiveResult);
      setActiveTarget("receiveLocation");
      setStatus("Zeskanuj lokalizacje.", false);
      return;
    }
    if (activeTarget === "receiveLocation") {
      await submitReceive();
    }
    return;
  }

  if (mode === "picking") {
    clearResult(pickingResult);
    if (activeTarget === "pickingFrom") {
      hidePickingDestination();
      setActiveTarget("pickingSku");
      setStatus("Zeskanuj produkt.", false);
    } else if (activeTarget === "pickingSku") {
      await submitPicking();
    }
    return;
  }

  if (mode === "placement") {
    await handlePlacementScan(value);
    return;
  }

  if (activeTarget === "moveSku") {
    clearResult(moveResult);
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
    setResult(receiveResult, "Nie wykonano przyjecia: zeskanuj produkt i lokalizacje.", true);
    return;
  }

  const result = await send("/api/stock/receive", {
    sku: state.receiveSku,
    location: state.receiveLocation,
    quantity: receiveQuantity,
    scanner_id: scannerId.value.trim(),
    operator: operatorName.value.trim() || null
  }, receiveResult);

  if (result.ok) {
    const productName = result.payload.name || result.payload.sku || state.receiveSku;
    setResult(receiveResult, `OK: przyjeto ${receiveQuantity} szt. produktu ${productName} do ${state.receiveLocation}.`, false);
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
    setResult(moveResult, "Nie wykonano przesuniecia: uzupelnij produkt, obie lokalizacje i ilosc.", true);
    return;
  }

  const result = await send("/api/stock/move", {
    sku: state.moveSku,
    from_location: state.moveFrom,
    to_location: state.moveTo,
    quantity: qty,
    scanner_id: scannerId.value.trim(),
    operator: operatorName.value.trim() || null
  }, moveResult);

  if (result.ok) {
    const movedRow = Array.isArray(result.payload) ? result.payload[1] || result.payload[0] : null;
    const productName = movedRow?.name || movedRow?.sku || state.moveSku;
    const successMessage = `OK: przesunieto ${qty} szt. produktu ${productName} z ${state.moveFrom} do ${state.moveTo}.`;
    setStatus(`Przesunieto ${qty} szt.`, false);
    resetMove(false);
    setResult(moveResult, successMessage, false);
  }
}

async function send(url, body, resultBox = null) {
  saveSettings();
  setStatus("Wysylanie...", false);
  if (resultBox) setResult(resultBox, "Wysylanie operacji...", false);
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
    const message = payload.detail || "Blad operacji.";
    setStatus(message, true);
    if (resultBox) setResult(resultBox, `Nie wykonano operacji: ${message}`, true);
    return { ok: false, payload };
  }

  return { ok: true, payload };
}

async function loadPickingTask(preserveDestination = false) {
  if (!canWork()) return;
  if (!selectedPickingBatch) {
    setStatus("Wybierz picking.", true);
    return;
  }
  setStatus("Pobieranie zadania picking...", false);
  const response = await fetch("/api/picking/next", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey.value
    },
    body: JSON.stringify({
      batch_id: selectedPickingBatch.batch_id,
      scanner_id: scannerId.value.trim(),
      operator: operatorName.value.trim() || null
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.detail || "Nie mozna pobrac zadania picking.";
    setStatus(message, true);
    setResult(pickingResult, message, true);
    return;
  }
  activePickingTask = payload;
  resetPickingScans(false, !preserveDestination);
  updatePickingTaskDisplay();
  if (!activePickingTask) {
    setStatus("Brak zadan picking do wykonania.", false);
    setResult(pickingResult, "Brak zadan picking do wykonania.", false);
    selectedPickingBatch = null;
    pickingWork.classList.add("hidden");
    pickingBatchChoice.classList.remove("hidden");
    await loadPickingBatches();
    return;
  }
  setStatus("Zeskanuj lokalizacje zrodlowa.", false);
  setActiveTarget("pickingFrom");
}

async function loadPickingBatches() {
  setStatus("Pobieranie listy pickingow...", false);
  pickingBatchList.innerHTML = "";
  const response = await fetch("/api/picking/batches", {
    headers: { "X-API-Key": apiKey.value }
  });
  const batches = await response.json().catch(() => []);
  if (!response.ok) {
    const message = batches?.detail || "Nie mozna pobrac listy pickingow.";
    setStatus(message, true);
    setResult(pickingResult, message, true);
    return;
  }

  const activeBatches = batches.filter(
    (batch) => batch.status !== "zebrany" && batch.status !== "anulowany" && batch.status !== "zebrany czesciowo"
  );
  if (!activeBatches.length) {
    pickingBatchList.innerHTML = "<div class=\"empty-batch\">Brak pickingow do realizacji.</div>";
    setStatus("Brak pickingow do realizacji.", false);
    return;
  }

  for (const batch of activeBatches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "picking-batch-button";
    button.innerHTML = `
      <strong>${batch.batch_id}</strong>
      <span>${batch.status} | ${batch.progress_percent}% | ${batch.assigned_tasks}/${batch.total_tasks} pozycji</span>
    `;
    button.addEventListener("click", () => selectPickingBatch(batch));
    pickingBatchList.appendChild(button);
  }
  setStatus("Wybierz picking.", false);
}

async function selectPickingBatch(batch) {
  selectedPickingBatch = batch;
  pickingBatchChoice.classList.add("hidden");
  pickingWork.classList.remove("hidden");
  clearResult(pickingResult);
  hidePickingDestination();
  setStatus(`Wybrano picking ${batch.batch_id}.`, false);
  await loadPickingTask();
}

async function submitPicking() {
  if (!canWork()) return;
  if (!activePickingTask) {
    setStatus("Pobierz zadanie picking.", true);
    setResult(pickingResult, "Nie wykonano pickingu: brak aktywnego zadania.", true);
    return;
  }
  if (!state.pickingSku || !state.pickingFrom) {
    setStatus("Zeskanuj lokalizacje zrodlowa i produkt.", true);
    setResult(pickingResult, "Nie wykonano pickingu: brakuje skanow.", true);
    return;
  }
  const result = await send("/api/picking/complete", {
    task_id: activePickingTask.id,
    sku: state.pickingSku,
    source_location: state.pickingFrom,
    target_location: activePickingTask.target_location,
    scanner_id: scannerId.value.trim(),
    operator: operatorName.value.trim() || null
  }, pickingResult);

  if (result.ok) {
    const productName = activePickingTask.name || activePickingTask.sku;
    setResult(
      pickingResult,
      `OK: picking ${activePickingTask.quantity} szt. produktu ${productName} z ${activePickingTask.source_location} do ${activePickingTask.target_location}.`,
      false
    );
    setStatus("Picking zakonczony.", false);
    showPickingDestination(activePickingTask.target_location);
    activePickingTask = null;
    resetPickingScans(false, false);
    updatePickingTaskDisplay();
    await loadPickingTask(true);
  }
}

async function finishSelectedPicking() {
  if (!canWork()) return;
  if (!selectedPickingBatch) {
    setStatus("Wybierz picking.", true);
    setResult(pickingResult, "Nie mozna zakonczyc pickingu: wybierz picking.", true);
    return;
  }
  const confirmed = confirm(`Zakonczyc picking ${selectedPickingBatch.batch_id}? Zebrane pozycje trafia do Wysylki, a reszta zadan zostanie zamknieta.`);
  if (!confirmed) return;

  const result = await send("/api/picking/finish", {
    batch_id: selectedPickingBatch.batch_id
  }, pickingResult);

  if (result.ok) {
    setStatus("Picking zakonczony czesciowo.", false);
    setResult(pickingResult, `OK: zakonczono picking ${selectedPickingBatch.batch_id}.`, false);
    selectedPickingBatch = null;
    activePickingTask = null;
    resetPickingScans(false);
    hidePickingDestination();
    pickingWork.classList.add("hidden");
    pickingBatchChoice.classList.remove("hidden");
    await loadPickingBatches();
  }
}

async function loadPlacementWorkspaces() {
  setStatus("Pobieranie zlecen rozstawiania...", false);
  placementWorkspaceList.innerHTML = "";
  const response = await fetch("/api/allocations/placement/workspaces", {
    headers: { "X-API-Key": apiKey.value }
  });
  const workspaces = await response.json().catch(() => []);
  if (!response.ok) {
    const message = workspaces?.detail || "Nie mozna pobrac zlecen rozstawiania.";
    setStatus(message, true);
    setResult(placementResult, message, true);
    return;
  }
  const activeWorkspaces = workspaces.filter((workspace) => workspace.status !== "rozstawiona");
  if (!activeWorkspaces.length) {
    placementWorkspaceList.innerHTML = "<div class=\"empty-batch\">Brak zlecen rozstawiania.</div>";
    setStatus("Brak zlecen rozstawiania.", false);
    return;
  }
  for (const workspace of activeWorkspaces) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "picking-batch-button";
    button.innerHTML = `
      <strong>${escapeHtml(workspace.workspace_id)}</strong>
      <span>${escapeHtml(workspace.name)} | ${workspace.progress_percent}% | ${workspace.placed_pallets}/${workspace.total_pallets} palet</span>
    `;
    button.addEventListener("click", () => selectPlacementWorkspace(workspace));
    placementWorkspaceList.appendChild(button);
  }
  setStatus("Wybierz alokacje do rozstawienia.", false);
}

async function selectPlacementWorkspace(workspace) {
  selectedPlacementWorkspace = workspace;
  activePlacementPallet = null;
  placementWorkspaceChoice.classList.add("hidden");
  placementWork.classList.remove("hidden");
  placementWorkspaceTitle.textContent = `${workspace.workspace_id} | ${workspace.name}`;
  placementInstruction.textContent = `Skanuj kod palety. Kod odstawienia: ${PLACEMENT_CONFIRM_CODE}.`;
  clearResult(placementResult);
  await loadPlacementPallets();
}

async function loadPlacementPallets() {
  if (!selectedPlacementWorkspace) return;
  const response = await fetch(`/api/allocations/placement/pallets?workspace_id=${encodeURIComponent(selectedPlacementWorkspace.workspace_id)}`, {
    headers: { "X-API-Key": apiKey.value }
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    const message = rows?.detail || "Nie mozna pobrac mapy rozstawiania.";
    setStatus(message, true);
    setResult(placementResult, message, true);
    return;
  }
  placementPallets = rows;
  renderPlacementMap();
  setStatus("Zeskanuj kod palety.", false);
}

async function handlePlacementScan(value) {
  if (!selectedPlacementWorkspace) {
    setStatus("Wybierz alokacje do rozstawienia.", true);
    return;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === PLACEMENT_CONFIRM_CODE) {
    await completePlacementPallet();
    return;
  }
  await scanPlacementPallet(value.trim());
}

async function scanPlacementPallet(palletCode) {
  if (!palletCode) return;
  const result = await send("/api/allocations/placement/scan", {
    workspace_id: selectedPlacementWorkspace.workspace_id,
    pallet_code: palletCode,
    scanner_id: scannerId.value.trim(),
    operator: operatorName.value.trim() || null
  }, placementResult);
  if (!result.ok) return;
  activePlacementPallet = result.payload;
  upsertPlacementPallet(result.payload);
  renderPlacementMap();
  const position = result.payload.layout_position || "-";
  placementCurrent.classList.remove("hidden");
  placementPositionValue.textContent = position;
  setResult(placementResult, `Paleta ${result.payload.pallet_code}: ustaw na Poz. ${position}.`, false);
  setStatus(`Paleta ${result.payload.pallet_code}: Poz. ${position}. Po odstawieniu zeskanuj ${PLACEMENT_CONFIRM_CODE}.`, false);
}

async function completePlacementPallet() {
  if (!activePlacementPallet) {
    setStatus("Najpierw zeskanuj palete.", true);
    setResult(placementResult, "Nie mozna odstawic: najpierw zeskanuj palete.", true);
    return;
  }
  const result = await send("/api/allocations/placement/complete", {
    workspace_id: selectedPlacementWorkspace.workspace_id,
    pallet_code: activePlacementPallet.pallet_code,
    scanner_id: scannerId.value.trim(),
    operator: operatorName.value.trim() || null
  }, placementResult);
  if (!result.ok) return;
  activePlacementPallet = result.payload;
  upsertPlacementPallet(result.payload);
  renderPlacementMap();
  setResult(placementResult, `OK: odstawiono palete ${result.payload.pallet_code} na Poz. ${result.payload.layout_position || "-"}.`, false);
  setStatus("Paleta odstawiona. Zeskanuj kolejna palete.", false);
  activePlacementPallet = null;
  placementCurrent.classList.add("hidden");
}

function upsertPlacementPallet(pallet) {
  const index = placementPallets.findIndex((row) => row.pallet_code === pallet.pallet_code);
  if (index >= 0) {
    placementPallets[index] = pallet;
  } else {
    placementPallets.push(pallet);
  }
}

function renderPlacementMap() {
  const activeCode = activePlacementPallet?.pallet_code || "";
  const sorted = placementPallets.slice().sort((left, right) => comparePositionValues(left.layout_position, right.layout_position)
    || String(left.pallet_code || "").localeCompare(String(right.pallet_code || "")));
  if (!sorted.length) {
    placementMap.innerHTML = "<div class=\"empty-batch\">Brak palet w zleceniu.</div>";
    return;
  }
  const groups = new Map();
  for (const pallet of sorted) {
    const position = pallet.layout_position || "-";
    if (!groups.has(position)) {
      groups.set(position, []);
    }
    groups.get(position).push(pallet);
  }
  placementMap.innerHTML = Array.from(groups.entries()).map(([position, pallets]) => {
    const prepak = pallets.filter((pallet) => pallet.layout_row === "PREPAK");
    const luz = pallets.filter((pallet) => pallet.layout_row === "LUZ");
    const other = pallets.filter((pallet) => !["PREPAK", "LUZ"].includes(pallet.layout_row));
    const labelSource = pallets[0] || {};
    const productLabel = [
      simplifyAllocationSku(labelSource.sku_list || ""),
      labelSource.color_list || ""
    ].filter(Boolean).join(" / ");
    return `
      <section class="placement-position-block">
        <div class="placement-position-title">Poz. ${escapeHtml(position)}</div>
        <div class="placement-row-label">PREPAK</div>
        <div class="placement-row placement-row--prepak">
          ${prepak.length ? prepak.map((pallet) => renderPlacementPalletCard(pallet, activeCode)).join("") : "<div class=\"placement-empty-slot\">brak</div>"}
        </div>
        <div class="placement-aisle-label">${escapeHtml(productLabel || "Alejka")}</div>
        <div class="placement-row-label">LUZ</div>
        <div class="placement-row placement-row--luz">
          ${luz.length ? luz.map((pallet) => renderPlacementPalletCard(pallet, activeCode)).join("") : "<div class=\"placement-empty-slot\">brak</div>"}
        </div>
        ${other.length ? `<div class="placement-row placement-row--other">${other.map((pallet) => renderPlacementPalletCard(pallet, activeCode)).join("")}</div>` : ""}
      </section>
    `;
  }).join("");
}

function renderPlacementPalletCard(pallet, activeCode) {
    const isActive = pallet.pallet_code === activeCode;
    const isPlaced = pallet.placement_status === "odstawiona";
    return `
      <div class="placement-card ${isActive ? "active" : ""} ${isPlaced ? "placed" : ""}">
        <div class="placement-card__body">
          <strong>${escapeHtml(pallet.pallet_code)}</strong>
          <span>${isPlaced ? `Odstawiona: ${escapeHtml(pallet.placed_by || "")}` : "Do ustawienia"}</span>
        </div>
      </div>
    `;
}

function resetPlacementScan() {
  activePlacementPallet = null;
  placementCurrent.classList.add("hidden");
  renderPlacementMap();
  setStatus("Zeskanuj kod palety.", false);
  clearResult(placementResult);
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
      session_id: loginSessionId || localStorage.getItem("wmsLoginSession") || null,
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
  clearResult(receiveResult);
  setActiveTarget("receiveSku");
  updateDisplays();
  if (showMessage) setStatus("Wyczyszczono przyjecie.", false);
}

function resetMove(showMessage = true) {
  state.moveSku = "";
  state.moveFrom = "";
  state.moveTo = "";
  moveQuantity.value = "1";
  clearResult(moveResult);
  setActiveTarget("moveSku");
  updateDisplays();
  if (showMessage) setStatus("Wyczyszczono przesuniecie.", false);
}

function resetPickingScans(showMessage = true, clearMessage = true) {
  state.pickingSku = "";
  state.pickingFrom = "";
  if (clearMessage) clearResult(pickingResult);
  if (clearMessage) hidePickingDestination();
  setActiveTarget("pickingFrom");
  updateDisplays();
  if (showMessage) setStatus("Wyczyszczono skany picking.", false);
}

function updateDisplays() {
  setText("#receiveSkuValue", state.receiveSku || "Zeskanuj produkt");
  setText("#receiveLocationValue", state.receiveLocation || "Zeskanuj lokalizacje");
  setText("#moveSkuValue", state.moveSku || "Zeskanuj produkt");
  setText("#moveFromValue", state.moveFrom || "Zeskanuj lokalizacje zrodlowa");
  setText("#moveToValue", state.moveTo || "Zeskanuj lokalizacje docelowa");
  setText("#pickingSkuValue", state.pickingSku || "Zeskanuj produkt");
  setText("#pickingFromValue", state.pickingFrom || "Zeskanuj lokalizacje zrodlowa");
}

function updatePickingTaskDisplay() {
  if (!activePickingTask) {
    pickingProduct.textContent = "Brak aktywnego zadania";
    pickingDetails.textContent = selectedPickingBatch ? `Picking ${selectedPickingBatch.batch_id}` : "Wybierz picking.";
    return;
  }
  pickingProduct.textContent = activePickingTask.name || activePickingTask.sku;
  pickingDetails.textContent = `Picking ${activePickingTask.batch_id} | ${activePickingTask.quantity} szt. | z ${activePickingTask.source_location} do ${activePickingTask.target_location}`;
}

function showPickingDestination(value) {
  pickingDestinationValue.textContent = value || "";
  pickingDestination.classList.toggle("hidden", !value);
  if (value) {
    speak(value);
  }
}

function hidePickingDestination() {
  showPickingDestination("");
}

function speak(message) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  const voiceSettings = getScannerVoiceSettings();
  utterance.lang = "pl-PL";
  utterance.rate = voiceSettings.rate;
  utterance.pitch = voiceSettings.pitch;
  window.speechSynthesis.speak(utterance);
}

function getScannerVoiceSettings() {
  const match = scannerId.value.trim().match(/(\d+)$/);
  const number = match ? Number(match[1]) : 1;
  const variants = [
    { rate: 0.82, pitch: 0.9 },
    { rate: 1.02, pitch: 1.15 },
    { rate: 0.92, pitch: 1.0 },
    { rate: 1.12, pitch: 0.95 }
  ];
  return variants[(number - 1) % variants.length];
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function setStatus(message, isError) {
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
}

function setResult(element, message, isError) {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("hidden");
  element.classList.toggle("error", isError);
}

function clearResult(element) {
  if (!element) return;
  element.textContent = "";
  element.classList.add("hidden");
  element.classList.remove("error");
}

function comparePositionValues(left, right) {
  const leftParts = String(left || "9999").split(".").map((part) => Number(part) || 0);
  const rightParts = String(right || "9999").split(".").map((part) => Number(part) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff) return diff;
  }
  return 0;
}

function simplifyAllocationSku(value) {
  return String(value || "").replace(/^GPKS\d*/i, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

updateDisplays();
