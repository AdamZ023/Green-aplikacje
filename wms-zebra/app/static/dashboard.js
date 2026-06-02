const apiKeyInput = document.querySelector("#apiKey");
const warehouseRows = document.querySelector("#warehouseRows");
const logisticsRows = document.querySelector("#logisticsRows");
const historyRows = document.querySelector("#historyRows");
const pickingBatchRows = document.querySelector("#pickingBatchRows");
const pickingRows = document.querySelector("#pickingRows");
const shippingRows = document.querySelector("#shippingRows");
const allocationWorkspaceRows = document.querySelector("#allocationWorkspaceRows");
const allocationPalletRows = document.querySelector("#allocationPalletRows");
const allocationContentRows = document.querySelector("#allocationContentRows");
const allocationPlanRows = document.querySelector("#allocationPlanRows");
const allocationMap = document.querySelector("#allocationMap");
const allocationMapStatus = document.querySelector("#allocationMapStatus");
const allocationAisleWidth = document.querySelector("#allocationAisleWidth");
const allocationFieldLength = document.querySelector("#allocationFieldLength");
const allocationFieldWidth = document.querySelector("#allocationFieldWidth");
const pickingFile = document.querySelector("#pickingFile");
const deliveryFile = document.querySelector("#deliveryFile");
const allocationPlanFile = document.querySelector("#allocationPlanFile");
const pickingDetails = document.querySelector("#pickingDetails");
const allocationDetails = document.querySelector("#allocationDetails");
const pickingDetailsTitle = document.querySelector("#pickingDetailsTitle");
const allocationDetailsTitle = document.querySelector("#allocationDetailsTitle");
const pickingImportStatus = document.querySelector("#pickingImportStatus");
const pickingCancelStatus = document.querySelector("#pickingCancelStatus");
const allocationStatus = document.querySelector("#allocationStatus");
const cancelPickingButton = document.querySelector("#cancelPickingButton");
const finishPickingButton = document.querySelector("#finishPickingButton");
const views = {
  warehouse: document.querySelector("#warehouseView"),
  logistics: document.querySelector("#logisticsView"),
  history: document.querySelector("#operationHistoryView"),
  picking: document.querySelector("#pickingView"),
  shipping: document.querySelector("#shippingView"),
  allocation: document.querySelector("#allocationView")
};
const buttons = {
  warehouse: document.querySelector("#warehouseViewButton"),
  logistics: document.querySelector("#logisticsViewButton"),
  history: document.querySelector("#historyViewButton"),
  picking: document.querySelector("#pickingViewButton"),
  shipping: document.querySelector("#shippingViewButton"),
  allocation: document.querySelector("#allocationViewButton")
};
const historyFilterButtons = {
  all: document.querySelector("#historyAllFilter"),
  receive: document.querySelector("#historyReceiveFilter"),
  move: document.querySelector("#historyMoveFilter")
};
const savedKey = localStorage.getItem("wmsApiKey") || "";
let activeView = localStorage.getItem("wmsDashboardView") || "warehouse";
let activeHistoryFilter = localStorage.getItem("wmsHistoryFilter") || "move";
let activePickingBatch = localStorage.getItem("wmsPickingBatch") || "";
let activeAllocationWorkspace = localStorage.getItem("wmsAllocationWorkspace") || "";
let activePickingStatus = "";
let allocationPalletCache = [];

allocationAisleWidth.value = localStorage.getItem("wmsAllocationAisleWidth") || "4";
allocationFieldLength.value = localStorage.getItem("wmsAllocationFieldLength") || "";
allocationFieldWidth.value = localStorage.getItem("wmsAllocationFieldWidth") || "";

apiKeyInput.value = savedKey;

apiKeyInput.addEventListener("change", () => {
  localStorage.setItem("wmsApiKey", apiKeyInput.value);
  loadAll();
});

buttons.warehouse.addEventListener("click", () => showView("warehouse"));
buttons.logistics.addEventListener("click", () => showView("logistics"));
buttons.history.addEventListener("click", () => showView("history"));
buttons.picking.addEventListener("click", () => showView("picking"));
buttons.shipping.addEventListener("click", () => showView("shipping"));
buttons.allocation.addEventListener("click", () => showView("allocation"));
historyFilterButtons.all.addEventListener("click", () => setHistoryFilter("all"));
historyFilterButtons.receive.addEventListener("click", () => setHistoryFilter("receive"));
historyFilterButtons.move.addEventListener("click", () => setHistoryFilter("move"));
document.querySelector("#refresh").addEventListener("click", loadAll);
document.querySelector("#pickingImportButton").addEventListener("click", importPicking);
document.querySelector("#allocationCreateButton").addEventListener("click", createAllocationWorkspace);
document.querySelector("#deliveryImportButton").addEventListener("click", importDelivery);
document.querySelector("#allocationPlanImportButton").addEventListener("click", importAllocationPlan);
cancelPickingButton.addEventListener("click", cancelPicking);
finishPickingButton.addEventListener("click", finishPicking);
allocationAisleWidth.addEventListener("input", updateAllocationMapSettings);
allocationFieldLength.addEventListener("input", updateAllocationMapSettings);
allocationFieldWidth.addEventListener("input", updateAllocationMapSettings);

function showView(name) {
  activeView = name;
  localStorage.setItem("wmsDashboardView", name);
  for (const [viewName, view] of Object.entries(views)) {
    view.classList.toggle("hidden", viewName !== name);
    buttons[viewName].classList.toggle("secondary", viewName !== name);
  }
}

function setHistoryFilter(name) {
  activeHistoryFilter = name;
  localStorage.setItem("wmsHistoryFilter", name);
  updateHistoryFilterButtons();
  loadOperationHistory();
}

function updateHistoryFilterButtons() {
  for (const [name, button] of Object.entries(historyFilterButtons)) {
    button.classList.toggle("secondary", name !== activeHistoryFilter);
  }
}

async function loadAll() {
  await Promise.all([
    loadWarehouseStock(),
    loadLogisticsStock(),
    loadOperationHistory(),
    loadPickingBatches(),
    loadShipping(),
    loadAllocationWorkspaces()
  ]);
}

async function loadWarehouseStock() {
  const hadRows = warehouseRows.children.length > 0;
  if (!hadRows) {
    warehouseRows.innerHTML = "<tr><td colspan=\"9\">Ladowanie...</td></tr>";
  }
  const response = await fetch("/api/warehouse-stock", {
    headers: { "X-API-Key": apiKeyInput.value }
  });

  if (!response.ok) {
    warehouseRows.innerHTML = "<tr><td colspan=\"9\">Brak dostepu albo blad API.</td></tr>";
    return;
  }

  const stock = await response.json();
  if (!stock.length) {
    warehouseRows.innerHTML = "<tr><td colspan=\"9\">Brak stanow.</td></tr>";
    return;
  }

  const total = stock.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const reservedTotal = stock.reduce((sum, item) => sum + Number(item.reserved_quantity || 0), 0);
  warehouseRows.innerHTML = stock.map((item) => `
    <tr>
      <td>${escapeHtml(item.barcode || "")}</td>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.warehouse)}</td>
      <td>${item.quantity}</td>
      <td>${item.reserved_quantity || 0}</td>
      <td>${escapeHtml(formatScanTime(item.scan_at))}</td>
      <td>${escapeHtml(item.operator || "")}</td>
      <td>${escapeHtml(item.scanner_id || "")}</td>
    </tr>
  `).join("") + totalRow(4, total, reservedTotal, 3);
}

async function loadLogisticsStock() {
  const hadRows = logisticsRows.children.length > 0;
  if (!hadRows) {
    logisticsRows.innerHTML = "<tr><td colspan=\"9\">Ladowanie...</td></tr>";
  }
  const response = await fetch("/api/stock", {
    headers: { "X-API-Key": apiKeyInput.value }
  });

  if (!response.ok) {
    logisticsRows.innerHTML = "<tr><td colspan=\"9\">Brak dostepu albo blad API.</td></tr>";
    return;
  }

  const stock = await response.json();
  if (!stock.length) {
    logisticsRows.innerHTML = "<tr><td colspan=\"9\">Brak stanow.</td></tr>";
    return;
  }

  const total = stock.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const reservedTotal = stock.reduce((sum, item) => sum + Number(item.reserved_quantity || 0), 0);
  logisticsRows.innerHTML = stock.map((item) => `
    <tr>
      <td>${escapeHtml(item.barcode || "")}</td>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.location)}</td>
      <td>${item.quantity}</td>
      <td>${item.reserved_quantity || 0}</td>
      <td>${escapeHtml(formatScanTime(item.scan_at))}</td>
      <td>${escapeHtml(item.operator || "")}</td>
      <td>${escapeHtml(item.scanner_id || "")}</td>
    </tr>
  `).join("") + totalRow(4, total, reservedTotal, 3);
}

async function loadOperationHistory() {
  if (!historyRows.children.length) {
    historyRows.innerHTML = "<tr><td colspan=\"10\">Ladowanie...</td></tr>";
  }

  const headers = { "X-API-Key": apiKeyInput.value };
  const operationQuery = activeHistoryFilter === "all" ? "" : `&operation_type=${activeHistoryFilter}`;
  const [operationsResponse, itemsResponse] = await Promise.all([
    fetch(`/api/operations?limit=200${operationQuery}`, { headers }),
    fetch("/api/items", { headers })
  ]);

  if (!operationsResponse.ok || !itemsResponse.ok) {
    historyRows.innerHTML = "<tr><td colspan=\"10\">Brak dostepu albo blad API.</td></tr>";
    return;
  }

  const operations = await operationsResponse.json();
  const items = await itemsResponse.json();
  const itemBySku = new Map(items.map((item) => [item.sku, item]));

  if (!operations.length) {
    historyRows.innerHTML = `<tr><td colspan="10">${emptyHistoryMessage()}</td></tr>`;
    return;
  }

  historyRows.innerHTML = operations.map((operation) => {
    const item = itemBySku.get(operation.sku) || {};
    return `
      <tr>
        <td>${escapeHtml(formatScanTime(operation.created_at))}</td>
        <td>${escapeHtml(formatOperation(operation.operation_type))}</td>
        <td>${escapeHtml(item.barcode || "")}</td>
        <td>${escapeHtml(operation.sku)}</td>
        <td>${escapeHtml(item.name || "")}</td>
        <td>${escapeHtml(operation.from_location || "")}</td>
        <td>${escapeHtml(operation.to_location || "")}</td>
        <td>${operation.quantity}</td>
        <td>${escapeHtml(operation.operator || "")}</td>
        <td>${escapeHtml(operation.scanner_id || "")}</td>
      </tr>
    `;
  }).join("");
}

async function loadPickingBatches() {
  if (!pickingBatchRows.children.length) {
    pickingBatchRows.innerHTML = "<tr><td colspan=\"6\">Ladowanie...</td></tr>";
  }
  const response = await fetch("/api/picking/batches", {
    headers: { "X-API-Key": apiKeyInput.value }
  });
  if (!response.ok) {
    pickingBatchRows.innerHTML = "<tr><td colspan=\"6\">Brak dostepu albo blad API.</td></tr>";
    pickingDetails.classList.add("hidden");
    return;
  }
  const batches = await response.json();
  if (!batches.length) {
    activePickingBatch = "";
    localStorage.removeItem("wmsPickingBatch");
    pickingBatchRows.innerHTML = "<tr><td colspan=\"6\">Brak pickingow.</td></tr>";
    pickingDetails.classList.add("hidden");
    return;
  }

  if (!batches.some((batch) => batch.batch_id === activePickingBatch)) {
    activePickingBatch = batches[0].batch_id;
    localStorage.setItem("wmsPickingBatch", activePickingBatch);
  }
  activePickingStatus = batches.find((batch) => batch.batch_id === activePickingBatch)?.status || "";

  pickingBatchRows.innerHTML = batches.map((batch) => `
    <tr class="clickable-row ${batch.batch_id === activePickingBatch ? "selected-row" : ""}" data-batch-id="${escapeHtml(batch.batch_id)}">
      <td>${escapeHtml(batch.batch_id)}</td>
      <td>${escapeHtml(batch.source_filename || "")}</td>
      <td>${batch.total_tasks}</td>
      <td>${batch.assigned_tasks}</td>
      <td>${escapeHtml(batch.status)}</td>
      <td>${batch.progress_percent}%</td>
    </tr>
  `).join("");

  pickingBatchRows.querySelectorAll("[data-batch-id]").forEach((row) => {
    row.addEventListener("click", () => {
      activePickingBatch = row.dataset.batchId;
      localStorage.setItem("wmsPickingBatch", activePickingBatch);
      loadPickingBatches();
    });
  });

  await loadPickingTasks(activePickingBatch);
}

async function loadPickingTasks(batchId) {
  if (!batchId) {
    pickingDetails.classList.add("hidden");
    return;
  }
  pickingDetails.classList.remove("hidden");
  pickingDetailsTitle.textContent = `Zawartosc pickingu ${batchId}`;
  const closedStatus = activePickingStatus === "zebrany" || activePickingStatus === "anulowany" || activePickingStatus === "zebrany czesciowo";
  cancelPickingButton.disabled = closedStatus;
  finishPickingButton.disabled = closedStatus;
  pickingCancelStatus.textContent = "";
  pickingCancelStatus.classList.remove("error");
  if (!pickingRows.children.length) {
    pickingRows.innerHTML = "<tr><td colspan=\"10\">Ladowanie...</td></tr>";
  }
  const response = await fetch(`/api/picking/tasks?limit=500&batch_id=${encodeURIComponent(batchId)}`, {
    headers: { "X-API-Key": apiKeyInput.value }
  });
  if (!response.ok) {
    pickingRows.innerHTML = "<tr><td colspan=\"10\">Brak dostepu albo blad API.</td></tr>";
    return;
  }
  const tasks = await response.json();
  if (!tasks.length) {
    pickingRows.innerHTML = "<tr><td colspan=\"10\">Brak pozycji w tym pickingu.</td></tr>";
    return;
  }
  pickingRows.innerHTML = tasks.map((task) => `
    <tr>
      <td>${escapeHtml(formatScanTime(task.picked_at || task.assigned_at))}</td>
      <td>${escapeHtml(formatPickingStatus(task.status))}</td>
      <td>${escapeHtml(task.barcode || "")}</td>
      <td>${escapeHtml(task.sku)}</td>
      <td>${escapeHtml(task.name || "")}</td>
      <td>${escapeHtml(task.source_location || "BRAK STANU")}</td>
      <td>${escapeHtml(task.target_location)}</td>
      <td>${task.quantity}</td>
      <td>${escapeHtml(task.operator || "")}</td>
      <td>${escapeHtml(task.scanner_id || "")}</td>
    </tr>
  `).join("");
}

async function cancelPicking() {
  if (!activePickingBatch) {
    pickingCancelStatus.textContent = "Wybierz picking do anulowania.";
    pickingCancelStatus.classList.add("error");
    return;
  }
  if (activePickingStatus === "zebrany") {
    pickingCancelStatus.textContent = "Nie mozna anulowac pickingu, ktory jest juz zebrany.";
    pickingCancelStatus.classList.add("error");
    return;
  }
  if (activePickingStatus === "zebrany czesciowo") {
    pickingCancelStatus.textContent = "Nie mozna anulowac pickingu, ktory jest juz zakonczony czesciowo.";
    pickingCancelStatus.classList.add("error");
    return;
  }
  if (activePickingStatus === "anulowany") {
    pickingCancelStatus.textContent = "Ten picking jest juz anulowany.";
    pickingCancelStatus.classList.add("error");
    return;
  }
  const confirmed = confirm(`Anulowac picking ${activePickingBatch}? Pozycje juz zrobione zostana w historii, a reszta zadan zostanie anulowana.`);
  if (!confirmed) return;

  pickingCancelStatus.textContent = "Anulowanie pickingu...";
  pickingCancelStatus.classList.remove("error");
  const response = await fetch("/api/picking/cancel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKeyInput.value
    },
    body: JSON.stringify({ batch_id: activePickingBatch })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    pickingCancelStatus.textContent = payload.detail || "Nie mozna anulowac pickingu.";
    pickingCancelStatus.classList.add("error");
    return;
  }
  activePickingStatus = payload.status || "anulowany";
  pickingCancelStatus.textContent = `Anulowano picking ${payload.batch_id}.`;
  pickingCancelStatus.classList.remove("error");
  await loadPickingBatches();
}

async function finishPicking() {
  if (!activePickingBatch) {
    pickingCancelStatus.textContent = "Wybierz picking do zakonczenia.";
    pickingCancelStatus.classList.add("error");
    return;
  }
  if (activePickingStatus === "zebrany" || activePickingStatus === "zebrany czesciowo") {
    pickingCancelStatus.textContent = "Ten picking jest juz zakonczony.";
    pickingCancelStatus.classList.add("error");
    return;
  }
  if (activePickingStatus === "anulowany") {
    pickingCancelStatus.textContent = "Nie mozna zakonczyc anulowanego pickingu.";
    pickingCancelStatus.classList.add("error");
    return;
  }
  const confirmed = confirm(`Zakonczyc picking ${activePickingBatch}? Zebrane pozycje trafia do Wysylki, a reszta zostanie zamknieta bez mozliwosci dalszego zbierania.`);
  if (!confirmed) return;

  pickingCancelStatus.textContent = "Zamykanie pickingu...";
  pickingCancelStatus.classList.remove("error");
  const response = await fetch("/api/picking/finish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKeyInput.value
    },
    body: JSON.stringify({ batch_id: activePickingBatch })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    pickingCancelStatus.textContent = payload.detail || "Nie mozna zakonczyc pickingu.";
    pickingCancelStatus.classList.add("error");
    return;
  }
  activePickingStatus = payload.status || "zebrany czesciowo";
  pickingCancelStatus.textContent = `Zakonczono picking ${payload.batch_id}: ${activePickingStatus}.`;
  pickingCancelStatus.classList.remove("error");
  await loadPickingBatches();
  await loadShipping();
}

async function loadShipping() {
  if (!shippingRows.children.length) {
    shippingRows.innerHTML = "<tr><td colspan=\"15\">Ladowanie...</td></tr>";
  }
  const response = await fetch("/api/shipping?limit=1000", {
    headers: { "X-API-Key": apiKeyInput.value }
  });
  if (!response.ok) {
    shippingRows.innerHTML = "<tr><td colspan=\"15\">Brak dostepu albo blad API.</td></tr>";
    return;
  }
  const rows = await response.json();
  if (!rows.length) {
    shippingRows.innerHTML = "<tr><td colspan=\"15\">Brak pozycji gotowych do wysylki.</td></tr>";
    return;
  }
  shippingRows.innerHTML = rows.map((item) => `
    <tr>
      <td>${escapeHtml(formatScanTime(item.scan_at))}</td>
      <td>${escapeHtml(item.batch_id)}</td>
      <td>${escapeHtml(item.source_filename || "")}</td>
      <td>${escapeHtml(item.picking_status)}</td>
      <td>${escapeHtml(item.shipping_status)}</td>
      <td>${escapeHtml(item.barcode || "")}</td>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.name || "")}</td>
      <td>${escapeHtml(item.source_location || "")}</td>
      <td>${escapeHtml(item.target_location || "")}</td>
      <td>${item.quantity}</td>
      <td>${escapeHtml(item.operator || "")}</td>
      <td>${escapeHtml(item.scanner_id || "")}</td>
      <td>${escapeHtml(formatScanTime(item.assigned_at))}</td>
      <td>${escapeHtml(formatScanTime(item.created_at))}</td>
    </tr>
  `).join("");
}

async function loadAllocationWorkspaces() {
  if (!allocationWorkspaceRows.children.length) {
    allocationWorkspaceRows.innerHTML = "<tr><td colspan=\"8\">Ladowanie...</td></tr>";
  }
  const response = await fetch("/api/allocations/workspaces", {
    headers: { "X-API-Key": apiKeyInput.value }
  });
  if (!response.ok) {
    allocationWorkspaceRows.innerHTML = "<tr><td colspan=\"8\">Brak dostepu albo blad API.</td></tr>";
    allocationDetails.classList.add("hidden");
    return;
  }
  const workspaces = await response.json();
  if (!workspaces.length) {
    activeAllocationWorkspace = "";
    localStorage.removeItem("wmsAllocationWorkspace");
    allocationWorkspaceRows.innerHTML = "<tr><td colspan=\"8\">Brak alokacji roboczych.</td></tr>";
    allocationDetails.classList.add("hidden");
    return;
  }
  if (!workspaces.some((workspace) => workspace.workspace_id === activeAllocationWorkspace)) {
    activeAllocationWorkspace = workspaces[0].workspace_id;
    localStorage.setItem("wmsAllocationWorkspace", activeAllocationWorkspace);
  }
  allocationWorkspaceRows.innerHTML = workspaces.map((workspace) => `
    <tr class="clickable-row ${workspace.workspace_id === activeAllocationWorkspace ? "selected-row" : ""}" data-workspace-id="${escapeHtml(workspace.workspace_id)}">
      <td>${escapeHtml(workspace.workspace_id)}</td>
      <td>${escapeHtml(workspace.name)}</td>
      <td>${escapeHtml(workspace.status)}</td>
      <td>${workspace.total_pallets}</td>
      <td>${workspace.total_cartons}</td>
      <td>${workspace.confirmed_cartons}</td>
      <td>${workspace.unconfirmed_cartons}</td>
      <td>${workspace.plan_items}</td>
    </tr>
  `).join("");
  allocationWorkspaceRows.querySelectorAll("[data-workspace-id]").forEach((row) => {
    row.addEventListener("click", () => {
      activeAllocationWorkspace = row.dataset.workspaceId;
      localStorage.setItem("wmsAllocationWorkspace", activeAllocationWorkspace);
      loadAllocationWorkspaces();
    });
  });
  await loadAllocationDetails(activeAllocationWorkspace);
}

async function loadAllocationDetails(workspaceId) {
  if (!workspaceId) {
    allocationDetails.classList.add("hidden");
    return;
  }
  allocationDetails.classList.remove("hidden");
  allocationDetailsTitle.textContent = `Zawartosc alokacji ${workspaceId}`;
  const headers = { "X-API-Key": apiKeyInput.value };
  const [palletsResponse, contentsResponse, planResponse] = await Promise.all([
    fetch(`/api/allocations/pallets?workspace_id=${encodeURIComponent(workspaceId)}`, { headers }),
    fetch(`/api/allocations/contents?workspace_id=${encodeURIComponent(workspaceId)}`, { headers }),
    fetch(`/api/allocations/plan?workspace_id=${encodeURIComponent(workspaceId)}`, { headers })
  ]);
  if (!palletsResponse.ok || !contentsResponse.ok || !planResponse.ok) {
    allocationPalletRows.innerHTML = "<tr><td colspan=\"9\">Brak dostepu albo blad API.</td></tr>";
    allocationContentRows.innerHTML = "<tr><td colspan=\"9\">Brak dostepu albo blad API.</td></tr>";
    allocationPlanRows.innerHTML = "<tr><td colspan=\"7\">Brak dostepu albo blad API.</td></tr>";
    return;
  }
  const pallets = await palletsResponse.json();
  const contents = await contentsResponse.json();
  const plan = await planResponse.json();
  allocationPalletCache = pallets;
  renderAllocationMap(pallets);

  allocationPalletRows.innerHTML = pallets.length ? pallets.map((pallet) => `
    <tr>
      <td>${escapeHtml(pallet.pallet_code)}</td>
      <td>${escapeHtml(pallet.status)}</td>
      <td>${escapeHtml(pallet.layout_row || "")}</td>
      <td>${escapeHtml(pallet.layout_position || "")}</td>
      <td>${pallet.total_cartons}</td>
      <td>${escapeHtml(pallet.sku_list || "")}</td>
      <td>${escapeHtml(pallet.ean_list || "")}</td>
      <td>${escapeHtml(pallet.delivery_ref || "")}</td>
      <td>${escapeHtml(pallet.source_filename || "")}</td>
    </tr>
  `).join("") : "<tr><td colspan=\"9\">Brak palet w tej alokacji.</td></tr>";

  allocationContentRows.innerHTML = contents.length ? contents.map((item) => `
    <tr>
      <td>${escapeHtml(item.delivery_ref || "")}</td>
      <td>${escapeHtml(item.pallet_code)}</td>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.color || "")}</td>
      <td>${escapeHtml(item.kind || "")}</td>
      <td>${escapeHtml(item.size || "")}</td>
      <td>${escapeHtml(item.ean || "")}</td>
      <td>${item.quantity_cartons}</td>
      <td>${escapeHtml(item.status)}</td>
    </tr>
  `).join("") : "<tr><td colspan=\"9\">Brak zawartosci palet.</td></tr>";

  allocationPlanRows.innerHTML = plan.length ? plan.map((item) => `
    <tr>
      <td>${escapeHtml(item.mdk)}</td>
      <td>${escapeHtml(item.color || "")}</td>
      <td>${escapeHtml(item.supplier || "")}</td>
      <td>${escapeHtml(item.delivery_plan || "")}</td>
      <td>${escapeHtml(item.ean_prepack || "")}</td>
      <td>${escapeHtml(item.source_filename || "")}</td>
      <td>${escapeHtml(item.status)}</td>
    </tr>
  `).join("") : "<tr><td colspan=\"7\">Brak planu alokacji.</td></tr>";
}

function updateAllocationMapSettings() {
  localStorage.setItem("wmsAllocationAisleWidth", allocationAisleWidth.value);
  localStorage.setItem("wmsAllocationFieldLength", allocationFieldLength.value);
  localStorage.setItem("wmsAllocationFieldWidth", allocationFieldWidth.value);
  renderAllocationMap(allocationPalletCache);
}

function renderAllocationMap(pallets) {
  if (!pallets.length) {
    allocationMap.innerHTML = "<div class=\"empty-map\">Brak palet do narysowania.</div>";
    allocationMapStatus.textContent = "";
    allocationMapStatus.classList.remove("error");
    return;
  }

  const palletLength = 1.2;
  const palletWidth = 0.8;
  const aisleWidth = clampNumber(Number(allocationAisleWidth.value || 4), 3, 5);
  const fieldLength = Number(allocationFieldLength.value || 0);
  const fieldWidth = Number(allocationFieldWidth.value || 0);
  const sortedSlots = getAllocationSlots(pallets);
  const allocationLength = sortedSlots.length * palletLength;
  const allocationWidth = palletWidth + aisleWidth + palletWidth;
  const drawingLength = Math.max(allocationLength, fieldLength || 0, 1.2);
  const drawingWidth = Math.max(allocationWidth, fieldWidth || 0, 2.4);
  const scale = 72;
  const marginLeft = 78;
  const marginTop = 46;
  const marginRight = 38;
  const marginBottom = 72;
  const svgWidth = marginLeft + drawingLength * scale + marginRight;
  const svgHeight = marginTop + drawingWidth * scale + marginBottom;
  const rowY = {
    PREPAK: marginTop,
    LUZ: marginTop + (palletWidth + aisleWidth) * scale,
    MIESZANE: marginTop + (palletWidth + aisleWidth / 2) * scale - palletWidth * scale / 2,
    NIEOKRESLONE: marginTop + (palletWidth + aisleWidth / 2) * scale - palletWidth * scale / 2
  };

  const slotByPosition = new Map(sortedSlots.map((slot, index) => [slot, index]));
  const paletaSvg = pallets
    .slice()
    .sort((left, right) => compareAllocationPallets(left, right))
    .map((pallet) => {
      const slot = normalizeMapPosition(pallet.layout_position);
      const index = slotByPosition.get(slot) ?? 0;
      const x = marginLeft + index * palletLength * scale;
      const y = rowY[pallet.layout_row] ?? rowY.NIEOKRESLONE;
      const cssClass = {
        PREPAK: "prepak",
        LUZ: "luz",
        MIESZANE: "mixed",
        NIEOKRESLONE: "unknown"
      }[pallet.layout_row] || "unknown";
      const label = `${pallet.layout_row || ""} ${pallet.layout_position || ""}`.trim();
      return `
        <g class="map-pallet ${cssClass}">
          <rect x="${x}" y="${y}" width="${palletLength * scale}" height="${palletWidth * scale}" rx="4"></rect>
          <text x="${x + 7}" y="${y + 18}">${escapeSvg(pallet.pallet_code)}</text>
          <text x="${x + 7}" y="${y + 35}">${escapeSvg(label)}</text>
          <text x="${x + 7}" y="${y + 52}">${escapeSvg(shortSkuList(pallet.sku_list))}</text>
        </g>
      `;
    })
    .join("");

  const meterTicksX = buildMeterTicks(drawingLength, "x", marginLeft, marginTop, scale, drawingWidth);
  const meterTicksY = buildMeterTicks(drawingWidth, "y", marginLeft, marginTop, scale, drawingLength);
  const fieldRect = fieldLength > 0 && fieldWidth > 0
    ? `<rect class="field-limit" x="${marginLeft}" y="${marginTop}" width="${fieldLength * scale}" height="${fieldWidth * scale}"></rect>`
    : "";
  const aisleY = marginTop + palletWidth * scale;
  const aisleTextY = aisleY + aisleWidth * scale / 2 + 5;

  allocationMap.innerHTML = `
    <div class="allocation-map-scroll">
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" role="img" aria-label="Mapa alokacji">
        <rect class="map-floor" x="${marginLeft}" y="${marginTop}" width="${drawingLength * scale}" height="${drawingWidth * scale}"></rect>
        ${fieldRect}
        <rect class="map-aisle" x="${marginLeft}" y="${aisleY}" width="${drawingLength * scale}" height="${aisleWidth * scale}"></rect>
        <text class="map-row-label" x="12" y="${marginTop + palletWidth * scale / 2 + 5}">PREPAK</text>
        <text class="map-row-label" x="12" y="${rowY.LUZ + palletWidth * scale / 2 + 5}">LUZ</text>
        <text class="map-aisle-label" x="${marginLeft + 10}" y="${aisleTextY}">Alejka ${formatMeters(aisleWidth)}</text>
        ${meterTicksX}
        ${meterTicksY}
        ${paletaSvg}
        <text class="map-axis-label" x="${marginLeft}" y="${svgHeight - 18}">Dlugosc: ${formatMeters(allocationLength)} / pole: ${fieldLength ? formatMeters(fieldLength) : "nie ustawiono"}</text>
        <text class="map-axis-label" x="${marginLeft + 270}" y="${svgHeight - 18}">Szerokosc: ${formatMeters(allocationWidth)} / pole: ${fieldWidth ? formatMeters(fieldWidth) : "nie ustawiono"}</text>
      </svg>
    </div>
  `;

  const warnings = [];
  if (fieldLength > 0 && allocationLength > fieldLength) {
    warnings.push(`alokacja przekracza dlugosc pola o ${formatMeters(allocationLength - fieldLength)}`);
  }
  if (fieldWidth > 0 && allocationWidth > fieldWidth) {
    warnings.push(`alokacja przekracza szerokosc pola o ${formatMeters(allocationWidth - fieldWidth)}`);
  }
  allocationMapStatus.textContent = warnings.length
    ? warnings.join(", ")
    : `Wymagane pole: ${formatMeters(allocationLength)} x ${formatMeters(allocationWidth)}`;
  allocationMapStatus.classList.toggle("error", warnings.length > 0);
}

function getAllocationSlots(pallets) {
  const slots = new Set(
    pallets
      .map((pallet) => normalizeMapPosition(pallet.layout_position))
      .filter(Boolean)
  );
  if (!slots.size) {
    return ["1"];
  }
  return Array.from(slots).sort(comparePositionValues);
}

function compareAllocationPallets(left, right) {
  const positionCompare = comparePositionValues(
    normalizeMapPosition(left.layout_position),
    normalizeMapPosition(right.layout_position)
  );
  if (positionCompare) return positionCompare;
  return rowSortValue(left.layout_row) - rowSortValue(right.layout_row)
    || String(left.pallet_code || "").localeCompare(String(right.pallet_code || ""));
}

function comparePositionValues(left, right) {
  const leftParts = String(left || "9999").split(".").map((part) => Number(part) || 0);
  const rightParts = String(right || "9999").split(".").map((part) => Number(part) || 0);
  const max = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < max; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff) return diff;
  }
  return 0;
}

function normalizeMapPosition(value) {
  return String(value || "").trim() || "1";
}

function rowSortValue(row) {
  return { PREPAK: 1, LUZ: 2, MIESZANE: 3, NIEOKRESLONE: 4 }[row] || 5;
}

function buildMeterTicks(lengthMeters, axis, marginLeft, marginTop, scale, crossMeters) {
  const ticks = [];
  const wholeMeters = Math.ceil(lengthMeters);
  for (let meter = 0; meter <= wholeMeters; meter += 1) {
    const value = Math.min(meter, lengthMeters);
    if (axis === "x") {
      const x = marginLeft + value * scale;
      ticks.push(`<line class="map-ruler" x1="${x}" y1="${marginTop + crossMeters * scale + 8}" x2="${x}" y2="${marginTop + crossMeters * scale + 20}"></line>`);
      ticks.push(`<text class="map-ruler-text" x="${x - 6}" y="${marginTop + crossMeters * scale + 36}">${meter}m</text>`);
    } else {
      const y = marginTop + value * scale;
      ticks.push(`<line class="map-ruler" x1="${marginLeft - 20}" y1="${y}" x2="${marginLeft - 8}" y2="${y}"></line>`);
      ticks.push(`<text class="map-ruler-text" x="${marginLeft - 64}" y="${y + 4}">${meter}m</text>`);
    }
  }
  return ticks.join("");
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function formatMeters(value) {
  return `${Number(value).toFixed(1).replace(".0", "")} m`;
}

function shortSkuList(value) {
  const text = String(value || "");
  return text.length > 26 ? `${text.slice(0, 24)}...` : text;
}

function escapeSvg(value) {
  return escapeHtml(value);
}

async function createAllocationWorkspace() {
  const nameInput = document.querySelector("#allocationName");
  const name = nameInput.value.trim();
  if (!name) {
    allocationStatus.textContent = "Wpisz nazwe alokacji roboczej.";
    allocationStatus.classList.add("error");
    return;
  }
  allocationStatus.textContent = "Tworzenie alokacji...";
  allocationStatus.classList.remove("error");
  const response = await fetch("/api/allocations/workspaces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKeyInput.value
    },
    body: JSON.stringify({ name })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    allocationStatus.textContent = payload.detail || "Nie mozna utworzyc alokacji.";
    allocationStatus.classList.add("error");
    return;
  }
  activeAllocationWorkspace = payload.workspace_id;
  localStorage.setItem("wmsAllocationWorkspace", activeAllocationWorkspace);
  nameInput.value = "";
  allocationStatus.textContent = `Utworzono alokacje ${payload.workspace_id}.`;
  await loadAllocationWorkspaces();
}

async function importDelivery() {
  await importAllocationFile(deliveryFile, "/api/allocations/delivery-import", "Wybierz plik rozladunek_*.xlsx.");
}

async function importAllocationPlan() {
  await importAllocationFile(allocationPlanFile, "/api/allocations/plan-import", "Wybierz plik alokacja*.xlsx.");
}

async function importAllocationFile(input, endpoint, missingMessage) {
  if (!activeAllocationWorkspace) {
    allocationStatus.textContent = "Najpierw wybierz albo utworz alokacje robocza.";
    allocationStatus.classList.add("error");
    return;
  }
  const file = input.files[0];
  if (!file) {
    allocationStatus.textContent = missingMessage;
    allocationStatus.classList.add("error");
    return;
  }
  allocationStatus.textContent = "Import...";
  allocationStatus.classList.remove("error");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-API-Key": apiKeyInput.value,
      "X-Workspace-Id": activeAllocationWorkspace,
      "X-Filename": file.name,
      "Content-Type": "application/octet-stream"
    },
    body: await file.arrayBuffer()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    allocationStatus.textContent = payload.detail || "Blad importu.";
    allocationStatus.classList.add("error");
    return;
  }
  allocationStatus.textContent = payload.message || `Zaimportowano ${payload.imported} pozycji.`;
  input.value = "";
  await loadAllocationWorkspaces();
}

async function importPicking() {
  const file = pickingFile.files[0];
  if (!file) {
    pickingImportStatus.textContent = "Wybierz plik CSV albo XLSX.";
    pickingImportStatus.classList.add("error");
    return;
  }
  pickingImportStatus.textContent = "Import pickingu...";
  pickingImportStatus.classList.remove("error");
  const response = await fetch("/api/picking/import", {
    method: "POST",
    headers: {
      "X-API-Key": apiKeyInput.value,
      "X-Filename": file.name,
      "Content-Type": "application/octet-stream"
    },
    body: await file.arrayBuffer()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    pickingImportStatus.textContent = payload.detail || "Blad importu pickingu.";
    pickingImportStatus.classList.add("error");
    return;
  }
  pickingImportStatus.textContent = `Utworzono picking ${payload.batch_id}: ${payload.created} pozycji, blokady: ${payload.blocked}.`;
  pickingImportStatus.classList.remove("error");
  pickingFile.value = "";
  activePickingBatch = payload.batch_id;
  localStorage.setItem("wmsPickingBatch", activePickingBatch);
  await loadPickingBatches();
}

function emptyHistoryMessage() {
  return {
    all: "Brak historii operacji.",
    receive: "Brak historii przyjec.",
    move: "Brak historii przesuniec."
  }[activeHistoryFilter] || "Brak historii operacji.";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function totalRow(labelColspan, total, reservedTotal, trailingColspan) {
  return `
    <tr class="total-row">
      <td colspan="${labelColspan}">Total</td>
      <td>${total}</td>
      <td>${reservedTotal}</td>
      <td colspan="${trailingColspan}"></td>
    </tr>
  `;
}

function formatScanTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number, length = 2) => String(number).padStart(length, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
    ".",
    pad(Math.floor(date.getMilliseconds() / 10), 2)
  ].join("");
}

function formatOperation(value) {
  return {
    receive: "Przyjecie",
    issue: "Wydanie",
    move: "Przesuniecie",
    picking: "Picking"
  }[value] || value;
}

function formatPickingStatus(value) {
  return {
    pending: "Do pobrania",
    assigned: "W trakcie",
    done: "Zrobione",
    blocked: "Brak stanu",
    canceled: "Anulowane",
    closed: "Zamkniete"
  }[value] || value;
}

if (!views[activeView]) {
  activeView = "warehouse";
}
if (!historyFilterButtons[activeHistoryFilter]) {
  activeHistoryFilter = "move";
}
updateHistoryFilterButtons();
showView(activeView);
loadAll();
setInterval(loadAll, 3000);
