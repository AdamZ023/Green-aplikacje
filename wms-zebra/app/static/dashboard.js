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
const allocationDeliveryRows = document.querySelector("#allocationDeliveryRows");
const allocationEventRows = document.querySelector("#allocationEventRows");
const allocationMap = document.querySelector("#allocationMap");
const allocationMapStatus = document.querySelector("#allocationMapStatus");
const allocationContextMenu = document.querySelector("#allocationContextMenu");
const allocationSectionRemove = document.querySelector("#allocationSectionRemove");
const allocationSectionMove = document.querySelector("#allocationSectionMove");
const allocationCompactButton = document.querySelector("#allocationCompactButton");
const allocationPalletWindowButton = document.querySelector("#allocationPalletWindowButton");
const allocationContentWindowButton = document.querySelector("#allocationContentWindowButton");
const allocationPlanWindowButton = document.querySelector("#allocationPlanWindowButton");
const allocationEventWindowButton = document.querySelector("#allocationEventWindowButton");
const allocationAisleWidth = document.querySelector("#allocationAisleWidth");
const allocationPrepackMargin = document.querySelector("#allocationPrepackMargin");
const allocationLuzMargin = document.querySelector("#allocationLuzMargin");
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
let allocationContentCache = [];
let activeAllocationSection = null;
let draggedAllocationSection = null;
const allocationDataWindows = {};

allocationAisleWidth.value = localStorage.getItem("wmsAllocationAisleWidth") || "4";
allocationPrepackMargin.value = localStorage.getItem("wmsAllocationPrepackMargin") || "0";
allocationLuzMargin.value = localStorage.getItem("wmsAllocationLuzMargin") || "0";
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
allocationCompactButton.addEventListener("click", compactAllocationLayout);
allocationSectionRemove.addEventListener("click", removeActiveAllocationSection);
allocationSectionMove.addEventListener("click", moveActiveAllocationSection);
allocationPalletWindowButton.addEventListener("click", () => openAllocationDataWindow("pallets"));
allocationContentWindowButton.addEventListener("click", () => openAllocationDataWindow("contents"));
allocationPlanWindowButton.addEventListener("click", () => openAllocationDataWindow("plan"));
allocationEventWindowButton.addEventListener("click", () => openAllocationDataWindow("events"));
allocationAisleWidth.addEventListener("input", updateAllocationMapSettings);
allocationPrepackMargin.addEventListener("input", updateAllocationMapSettings);
allocationLuzMargin.addEventListener("input", updateAllocationMapSettings);
allocationFieldLength.addEventListener("input", updateAllocationMapSettings);
allocationFieldWidth.addEventListener("input", updateAllocationMapSettings);
allocationFieldLength.addEventListener("change", normalizeOptionalAllocationField);
allocationFieldWidth.addEventListener("change", normalizeOptionalAllocationField);
document.addEventListener("click", () => allocationContextMenu.classList.add("hidden"));

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
    allocationWorkspaceRows.innerHTML = "<tr><td colspan=\"9\">Ladowanie...</td></tr>";
  }
  const response = await fetch("/api/allocations/workspaces", {
    headers: { "X-API-Key": apiKeyInput.value }
  });
  if (!response.ok) {
    allocationWorkspaceRows.innerHTML = "<tr><td colspan=\"9\">Brak dostepu albo blad API.</td></tr>";
    allocationDetails.classList.add("hidden");
    return;
  }
  const workspaces = await response.json();
  if (!workspaces.length) {
    activeAllocationWorkspace = "";
    localStorage.removeItem("wmsAllocationWorkspace");
    allocationWorkspaceRows.innerHTML = "<tr><td colspan=\"9\">Brak alokacji roboczych.</td></tr>";
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
      <td><button type="button" class="danger-button small-button" data-delete-workspace="${escapeHtml(workspace.workspace_id)}">Usun</button></td>
    </tr>
  `).join("");
  allocationWorkspaceRows.querySelectorAll("[data-workspace-id]").forEach((row) => {
    row.addEventListener("click", () => {
      activeAllocationWorkspace = row.dataset.workspaceId;
      localStorage.setItem("wmsAllocationWorkspace", activeAllocationWorkspace);
      loadAllocationWorkspaces();
    });
  });
  allocationWorkspaceRows.querySelectorAll("[data-delete-workspace]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteAllocationWorkspace(button.dataset.deleteWorkspace);
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
  const [palletsResponse, contentsResponse, planResponse, deliveriesResponse, eventsResponse] = await Promise.all([
    fetch(`/api/allocations/pallets?workspace_id=${encodeURIComponent(workspaceId)}`, { headers }),
    fetch(`/api/allocations/contents?workspace_id=${encodeURIComponent(workspaceId)}`, { headers }),
    fetch(`/api/allocations/plan?workspace_id=${encodeURIComponent(workspaceId)}`, { headers }),
    fetch(`/api/allocations/deliveries?workspace_id=${encodeURIComponent(workspaceId)}`, { headers }),
    fetch(`/api/allocations/events?workspace_id=${encodeURIComponent(workspaceId)}`, { headers })
  ]);
  if (!palletsResponse.ok || !contentsResponse.ok || !planResponse.ok || !deliveriesResponse.ok || !eventsResponse.ok) {
    allocationPalletRows.innerHTML = "<tr><td colspan=\"9\">Brak dostepu albo blad API.</td></tr>";
    allocationContentRows.innerHTML = "<tr><td colspan=\"9\">Brak dostepu albo blad API.</td></tr>";
    allocationPlanRows.innerHTML = "<tr><td colspan=\"7\">Brak dostepu albo blad API.</td></tr>";
    allocationDeliveryRows.innerHTML = "<tr><td colspan=\"6\">Brak dostepu albo blad API.</td></tr>";
    allocationEventRows.innerHTML = "<tr><td colspan=\"9\">Brak dostepu albo blad API.</td></tr>";
    return;
  }
  const pallets = await palletsResponse.json();
  const contents = await contentsResponse.json();
  const plan = await planResponse.json();
  const deliveries = await deliveriesResponse.json();
  const events = await eventsResponse.json();
  allocationPalletCache = pallets;
  allocationContentCache = contents;
  renderAllocationMap(pallets, contents);

  allocationDeliveryRows.innerHTML = deliveries.length ? deliveries.map((delivery) => `
    <tr>
      <td>${escapeHtml(delivery.delivery_ref || "")}</td>
      <td>${escapeHtml(delivery.source_filename)}</td>
      <td>${delivery.pallet_count}</td>
      <td>${delivery.total_cartons}</td>
      <td>${escapeHtml(formatScanTime(delivery.created_at))}</td>
      <td><button type="button" class="danger-button small-button" data-delete-delivery="${escapeHtml(delivery.delivery_id)}">Usun</button></td>
    </tr>
  `).join("") : "<tr><td colspan=\"6\">Brak plikow rozladunkowych w tej alokacji.</td></tr>";
  allocationDeliveryRows.querySelectorAll("[data-delete-delivery]").forEach((button) => {
    button.addEventListener("click", () => deleteAllocationDelivery(button.dataset.deleteDelivery));
  });

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

  allocationEventRows.innerHTML = events.length ? events.map((event) => `
    <tr>
      <td>${escapeHtml(formatScanTime(event.created_at))}</td>
      <td>${escapeHtml(formatAllocationEvent(event.event_type))}</td>
      <td>${escapeHtml(event.description)}</td>
      <td>${escapeHtml(event.source_filename || "")}</td>
      <td>${escapeHtml(event.sku || "")}</td>
      <td>${escapeHtml(event.color || "")}</td>
      <td>${event.pallet_count ?? ""}</td>
      <td>${event.carton_count ?? ""}</td>
      <td>
        <button type="button" class="small-button" data-undo-allocation-event="${event.id}" ${event.can_undo ? "" : "disabled"}>Cofnij</button>
      </td>
    </tr>
  `).join("") : "<tr><td colspan=\"9\">Brak historii alokacji.</td></tr>";
  allocationEventRows.querySelectorAll("[data-undo-allocation-event]").forEach((button) => {
    button.addEventListener("click", () => undoAllocationEvent(button.dataset.undoAllocationEvent));
  });
  syncAllocationDataWindows();
}

function updateAllocationMapSettings() {
  [allocationFieldLength, allocationFieldWidth].forEach((field) => {
    if (field.value !== "" && Number(field.value) <= 0) {
      field.value = "";
    }
  });
  localStorage.setItem("wmsAllocationAisleWidth", allocationAisleWidth.value);
  localStorage.setItem("wmsAllocationPrepackMargin", allocationPrepackMargin.value);
  localStorage.setItem("wmsAllocationLuzMargin", allocationLuzMargin.value);
  localStorage.setItem("wmsAllocationFieldLength", allocationFieldLength.value);
  localStorage.setItem("wmsAllocationFieldWidth", allocationFieldWidth.value);
  renderAllocationMap(allocationPalletCache, allocationContentCache);
}

function renderAllocationMap(pallets, contents = []) {
  if (!pallets.length) {
    allocationMap.innerHTML = "<div class=\"empty-map\">Brak palet do narysowania.</div>";
    allocationMapStatus.textContent = "";
    allocationMapStatus.classList.remove("error");
    return;
  }

  const palletAlongRow = 0.8;
  const palletDepth = 1.2;
  const aisleWidth = clampNumber(Number(allocationAisleWidth.value || 4), 3, 5);
  const prepackMargin = Math.max(Number(allocationPrepackMargin.value || 0), 0);
  const luzMargin = Math.max(Number(allocationLuzMargin.value || 0), 0);
  const fieldLength = Number(allocationFieldLength.value || 0);
  const fieldWidth = Number(allocationFieldWidth.value || 0);
  const sortedSlots = getAllocationSlots(pallets);
  const allocationLength = sortedSlots.length * palletAlongRow;
  const allocationWidth = prepackMargin + palletDepth + aisleWidth + palletDepth + luzMargin;
  const drawingLength = Math.max(allocationLength, fieldLength || 0, 0.8);
  const drawingWidth = Math.max(allocationWidth, fieldWidth || 0, 2.4);
  const contentsByPallet = groupAllocationContentsByPallet(contents);
  const palletLabelsByCode = buildAllocationPalletLabels(pallets);
  const scale = 72;
  const marginLeft = 78;
  const marginTop = 46;
  const marginRight = 38;
  const marginBottom = 72;
  const svgWidth = marginLeft + drawingLength * scale + marginRight;
  const svgHeight = marginTop + drawingWidth * scale + marginBottom;
  const prepackY = marginTop + prepackMargin * scale;
  const aisleY = prepackY + palletDepth * scale;
  const luzY = aisleY + aisleWidth * scale;
  const rowY = {
    PREPAK: prepackY,
    LUZ: luzY,
    MIESZANE: aisleY + aisleWidth * scale / 2 - palletDepth * scale / 2,
    NIEOKRESLONE: aisleY + aisleWidth * scale / 2 - palletDepth * scale / 2
  };

  const slotByPosition = new Map(sortedSlots.map((slot, index) => [slot, index]));
  const aisleProductLabels = buildAllocationAisleProductLabels(sortedSlots, pallets, contentsByPallet);
  const paletaSvg = pallets
    .slice()
    .sort((left, right) => compareAllocationPallets(left, right))
    .map((pallet) => {
      const slot = normalizeMapPosition(pallet.layout_position);
      const index = slotByPosition.get(slot) ?? 0;
      const x = marginLeft + index * palletAlongRow * scale;
      const y = rowY[pallet.layout_row] ?? rowY.NIEOKRESLONE;
      const cssClass = {
        PREPAK: "prepak",
        LUZ: "luz",
        MIESZANE: "mixed",
        NIEOKRESLONE: "unknown"
      }[pallet.layout_row] || "unknown";
      const labels = palletLabelsByCode.get(pallet.pallet_code) || [];
      return `
        <g class="map-pallet ${cssClass}">
          <rect x="${x}" y="${y}" width="${palletAlongRow * scale}" height="${palletDepth * scale}" rx="4"></rect>
          ${labels.map((line, lineIndex) => `<text x="${x + 7}" y="${y + 18 + lineIndex * 18}">${escapeSvg(line)}</text>`).join("")}
        </g>
      `;
    })
    .join("");
  const aisleProductSvg = aisleProductLabels
    .map((label) => {
      const x = marginLeft + (label.startIndex + label.endIndex + 1) * palletAlongRow * scale / 2;
      const y = aisleY + aisleWidth * scale / 2;
      return `
        <g class="map-product-label" data-section-sku="${escapeSvg(label.fullModel)}" data-section-color="${escapeSvg(label.color)}" transform="translate(${x} ${y}) rotate(-90)">
          <text x="0" y="-8">${escapeSvg(label.model)}</text>
          <text x="0" y="12">${escapeSvg(label.color)}</text>
        </g>
      `;
    })
    .join("");
  const positionBoundarySvg = sortedSlots.slice(1)
    .filter((slot, index) => baseMapPosition(slot) !== baseMapPosition(sortedSlots[index]))
    .map((slot, index) => {
      const slotIndex = sortedSlots.indexOf(slot);
      const x = marginLeft + slotIndex * palletAlongRow * scale;
      return `<line class="map-position-boundary" x1="${x}" y1="${marginTop}" x2="${x}" y2="${marginTop + drawingWidth * scale}"></line>`;
    })
    .join("");

  const meterTicksX = buildMeterTicks(drawingLength, "x", marginLeft, marginTop, scale, drawingWidth);
  const meterTicksY = buildMeterTicks(drawingWidth, "y", marginLeft, marginTop, scale, drawingLength);
  const fieldRect = fieldLength > 0 && fieldWidth > 0
    ? `<rect class="field-limit" x="${marginLeft}" y="${marginTop}" width="${fieldLength * scale}" height="${fieldWidth * scale}"></rect>`
    : "";
  const aisleTextY = aisleY + 22;
  const prepackMarginLabel = prepackMargin > 0
    ? `<text class="map-margin-label" x="${marginLeft + 10}" y="${marginTop + prepackMargin * scale / 2 + 5}">Margines PREPAK ${formatMeters(prepackMargin)}</text>`
    : "";
  const luzMarginY = luzY + palletDepth * scale;
  const luzMarginLabel = luzMargin > 0
    ? `<text class="map-margin-label" x="${marginLeft + 10}" y="${luzMarginY + luzMargin * scale / 2 + 5}">Margines LUZ ${formatMeters(luzMargin)}</text>`
    : "";

  allocationMap.innerHTML = `
    <div class="allocation-map-scroll">
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" role="img" aria-label="Mapa alokacji">
        <rect class="map-floor" x="${marginLeft}" y="${marginTop}" width="${drawingLength * scale}" height="${drawingWidth * scale}"></rect>
        ${fieldRect}
        <rect class="map-aisle" x="${marginLeft}" y="${aisleY}" width="${drawingLength * scale}" height="${aisleWidth * scale}"></rect>
        ${prepackMarginLabel}
        ${luzMarginLabel}
        <text class="map-row-label" x="12" y="${prepackY + palletDepth * scale / 2 + 5}">PREPAK</text>
        <text class="map-row-label" x="12" y="${rowY.LUZ + palletDepth * scale / 2 + 5}">LUZ</text>
        <text class="map-aisle-label" x="${marginLeft + 10}" y="${aisleTextY}">Alejka ${formatMeters(aisleWidth)}</text>
        ${aisleProductSvg}
        ${meterTicksX}
        ${meterTicksY}
        ${paletaSvg}
        ${positionBoundarySvg}
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
  allocationMap.querySelectorAll(".map-product-label").forEach((label) => {
    label.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      activeAllocationSection = {
        sku: label.dataset.sectionSku,
        color: label.dataset.sectionColor
      };
      allocationContextMenu.style.left = `${event.pageX}px`;
      allocationContextMenu.style.top = `${event.pageY}px`;
      allocationContextMenu.classList.remove("hidden");
    });
    label.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      allocationContextMenu.classList.add("hidden");
      draggedAllocationSection = {
        sku: label.dataset.sectionSku,
        color: label.dataset.sectionColor,
        pointerId: event.pointerId,
        sourceLabel: label,
        originalTransform: label.getAttribute("transform"),
        svg: allocationMap.querySelector("svg"),
        marginLeft,
        palletAlongRow,
        scale,
        maxPosition: Math.max(sortedSlots.length, 1)
      };
      label.classList.add("dragging");
      label.setPointerCapture(event.pointerId);
      allocationStatus.textContent = "Przeciagnij sekcje MDK na nowa pozycje i pusc przycisk myszy.";
      allocationStatus.classList.remove("error");
    });
    label.addEventListener("pointermove", updateAllocationSectionDrag);
    label.addEventListener("pointerup", finishAllocationSectionDrag);
    label.addEventListener("pointercancel", cancelAllocationSectionDrag);
  });
}

function updateAllocationSectionDrag(event) {
  if (!draggedAllocationSection || draggedAllocationSection.pointerId !== event.pointerId) return;
  const svgPoint = allocationSvgPointFromPointer(event, draggedAllocationSection.svg);
  if (!svgPoint) return;
  draggedAllocationSection.sourceLabel?.setAttribute("transform", `translate(${svgPoint.x} ${svgPoint.y}) rotate(-90)`);
}

async function finishAllocationSectionDrag(event) {
  if (!draggedAllocationSection || draggedAllocationSection.pointerId !== event.pointerId) return;
  const section = draggedAllocationSection;
  draggedAllocationSection = null;
  section.sourceLabel?.classList.remove("dragging");
  if (section.originalTransform) {
    section.sourceLabel?.setAttribute("transform", section.originalTransform);
  }
  try {
    section.sourceLabel?.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture can already be released by the browser.
  }

  const targetPosition = allocationPositionFromPointer(event, section);
  if (!targetPosition) {
    allocationStatus.textContent = "Nie rozpoznano pozycji docelowej na mapie.";
    allocationStatus.classList.add("error");
    return;
  }

  await postAllocationSectionAction("/api/allocations/sections/move", {
    sku: section.sku,
    color: section.color,
    target_position: targetPosition
  });
}

function cancelAllocationSectionDrag(event) {
  if (!draggedAllocationSection || draggedAllocationSection.pointerId !== event.pointerId) return;
  draggedAllocationSection.sourceLabel?.classList.remove("dragging");
  if (draggedAllocationSection.originalTransform) {
    draggedAllocationSection.sourceLabel?.setAttribute("transform", draggedAllocationSection.originalTransform);
  }
  draggedAllocationSection = null;
}

function allocationPositionFromPointer(event, section) {
  const svgPoint = allocationSvgPointFromPointer(event, section.svg);
  if (!svgPoint) return "";
  const rawPosition = Math.floor((svgPoint.x - section.marginLeft) / (section.palletAlongRow * section.scale)) + 1;
  return String(clampNumber(rawPosition, 1, section.maxPosition));
}

function allocationSvgPointFromPointer(event, svg) {
  if (!svg || !svg.getScreenCTM) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
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

function baseMapPosition(value) {
  return normalizeMapPosition(value).split(".")[0];
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

function groupAllocationContentsByPallet(contents) {
  const grouped = new Map();
  contents.forEach((item) => {
    const key = item.pallet_code || "";
    if (!key) return;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  });
  return grouped;
}

function dominantContentValue(contents, field) {
  const counts = new Map();
  contents.forEach((item) => {
    const value = String(item[field] || "").trim();
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + Number(item.quantity_cartons || 1));
  });
  if (!counts.size) return "";
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0];
}

function firstSkuFromList(value) {
  return String(value || "").split(",")[0].trim();
}

function simplifyAllocationSku(value) {
  return String(value || "").replace(/^GPKS\d*/i, "");
}

function buildAllocationPalletLabels(pallets) {
  const labels = new Map();
  pallets.forEach((pallet) => {
    const positionLabel = `Poz. ${pallet.layout_position || "-"}`;
    labels.set(pallet.pallet_code, [
      String(pallet.pallet_code || ""),
      positionLabel
    ]);
  });
  return labels;
}

function buildAllocationAisleProductLabels(sortedSlots, pallets, contentsByPallet) {
  const productBySlot = sortedSlots.map((slot) => {
    const slotPallets = pallets.filter((pallet) => normalizeMapPosition(pallet.layout_position) === slot);
    const slotContents = slotPallets.flatMap((pallet) => contentsByPallet.get(pallet.pallet_code) || []);
    const fullModel = dominantContentValue(slotContents, "sku") || firstSkuFromList(slotPallets[0]?.sku_list);
    const model = simplifyAllocationSku(fullModel);
    const color = dominantContentValue(slotContents, "color");
    return { fullModel, model, color };
  });
  const labels = [];
  productBySlot.forEach((product, index) => {
    if (!product.model && !product.color) return;
    const key = `${product.fullModel}|${product.color}`;
    const previous = labels[labels.length - 1];
    if (previous && previous.key === key && previous.endIndex === index - 1) {
      previous.endIndex = index;
      return;
    }
    labels.push({
      key,
      startIndex: index,
      endIndex: index,
      fullModel: product.fullModel,
      model: product.model || "-",
      color: product.color || "-"
    });
  });
  return labels;
}

function escapeSvg(value) {
  return escapeHtml(value);
}

function normalizeOptionalAllocationField(event) {
  if (Number(event.target.value || 0) <= 0) {
    event.target.value = "";
    updateAllocationMapSettings();
  }
}

async function undoAllocationEvent(eventId) {
  if (!eventId) return;
  if (!confirm("Cofnac te operacje alokacji?")) return;
  allocationStatus.textContent = "Cofanie operacji alokacji...";
  allocationStatus.classList.remove("error");
  const response = await fetch("/api/allocations/events/undo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKeyInput.value
    },
    body: JSON.stringify({ event_id: Number(eventId) })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    allocationStatus.textContent = payload.detail || "Nie mozna cofnac operacji.";
    allocationStatus.classList.add("error");
    return;
  }
  allocationStatus.textContent = payload.message || "Cofnieto operacje.";
  await loadAllocationWorkspaces();
}

function openAllocationDataWindow(kind) {
  const config = allocationWindowConfig(kind);
  if (!config) return;
  const existingWindow = allocationDataWindows[kind];
  if (existingWindow && !existingWindow.closed) {
    existingWindow.focus();
    renderAllocationDataWindow(kind);
    return;
  }
  const popup = window.open("", `wms-allocation-${kind}`, "width=1280,height=720,scrollbars=yes,resizable=yes");
  if (!popup) {
    allocationStatus.textContent = "Przegladarka zablokowala nowe okno.";
    allocationStatus.classList.add("error");
    return;
  }
  allocationDataWindows[kind] = popup;
  renderAllocationDataWindow(kind);
}

function syncAllocationDataWindows() {
  Object.keys(allocationDataWindows).forEach((kind) => {
    const popup = allocationDataWindows[kind];
    if (!popup || popup.closed) {
      delete allocationDataWindows[kind];
      return;
    }
    renderAllocationDataWindow(kind);
  });
}

function renderAllocationDataWindow(kind) {
  const config = allocationWindowConfig(kind);
  const popup = allocationDataWindows[kind];
  if (!config || !popup || popup.closed) return;
  const tableBody = document.querySelector(config.tableSelector);
  const table = tableBody?.closest("table");
  const tableHtml = table ? table.outerHTML : "<p>Brak danych.</p>";
  popup.document.open();
  popup.document.write(`
    <!doctype html>
    <html lang="pl">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(config.title)}</title>
      <style>
        body { margin: 16px; color: #18202b; font-family: Arial, Helvetica, sans-serif; }
        h1 { margin: 0 0 12px; font-size: 22px; }
        p { color: #5f6b7a; margin: 0 0 12px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { padding: 8px 7px; border-bottom: 1px solid #d7dde5; text-align: left; overflow-wrap: anywhere; vertical-align: top; }
        th { background: #eef2f5; font-weight: 700; }
        button { min-height: 32px; border: 0; border-radius: 6px; padding: 0 10px; background: #146c5f; color: #fff; cursor: pointer; }
        button:disabled { opacity: 0.55; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(config.title)}</h1>
      <p>Alokacja: ${escapeHtml(activeAllocationWorkspace || "-")}</p>
      ${tableHtml}
    </body>
    </html>
  `);
  popup.document.close();
  popup.document.querySelectorAll("[data-undo-allocation-event]").forEach((button) => {
    button.addEventListener("click", () => undoAllocationEvent(button.dataset.undoAllocationEvent));
  });
}

function allocationWindowConfig(kind) {
  return {
    pallets: { title: "Palety pod alokacje", tableSelector: "#allocationPalletRows" },
    contents: { title: "Zawartosc palet", tableSelector: "#allocationContentRows" },
    plan: { title: "Plan Alokacji", tableSelector: "#allocationPlanRows" },
    events: { title: "Historia alokacji", tableSelector: "#allocationEventRows" }
  }[kind];
}

async function deleteAllocationWorkspace(workspaceId) {
  if (!workspaceId) return;
  if (!confirm(`Usunac cala alokacje robocza ${workspaceId}? Znikna jej rozladunki, plan i ustawienie palet.`)) return;
  allocationStatus.textContent = "Usuwanie alokacji roboczej...";
  allocationStatus.classList.remove("error");
  const response = await fetch("/api/allocations/workspaces", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKeyInput.value
    },
    body: JSON.stringify({ workspace_id: workspaceId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    allocationStatus.textContent = payload.detail || "Nie mozna usunac alokacji roboczej.";
    allocationStatus.classList.add("error");
    return;
  }
  if (activeAllocationWorkspace === workspaceId) {
    activeAllocationWorkspace = "";
    localStorage.removeItem("wmsAllocationWorkspace");
  }
  allocationStatus.textContent = payload.message || "Usunieto alokacje robocza.";
  await loadAllocationWorkspaces();
}

async function deleteAllocationDelivery(deliveryId) {
  if (!deliveryId) return;
  if (!confirm("Wycofac cala dostawe z tej alokacji roboczej?")) return;
  allocationStatus.textContent = "Wycofywanie dostawy...";
  allocationStatus.classList.remove("error");
  const response = await fetch(`/api/allocations/deliveries/${encodeURIComponent(deliveryId)}`, {
    method: "DELETE",
    headers: { "X-API-Key": apiKeyInput.value }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    allocationStatus.textContent = payload.detail || "Nie mozna wycofac dostawy.";
    allocationStatus.classList.add("error");
    return;
  }
  allocationStatus.textContent = payload.message || "Wycofano dostawe.";
  await loadAllocationWorkspaces();
}

async function removeActiveAllocationSection() {
  allocationContextMenu.classList.add("hidden");
  if (!activeAllocationSection || !activeAllocationWorkspace) return;
  if (!confirm(`Usunac z rozstawienia sekcje ${activeAllocationSection.sku}?`)) return;
  await postAllocationSectionAction("/api/allocations/sections/remove", activeAllocationSection);
}

async function moveActiveAllocationSection() {
  allocationContextMenu.classList.add("hidden");
  if (!activeAllocationSection || !activeAllocationWorkspace) return;
  allocationStatus.textContent = "Zlap etykiete MDK na alejce lewym przyciskiem myszy i przeciagnij ja na nowa pozycje.";
  allocationStatus.classList.remove("error");
}

async function compactAllocationLayout() {
  if (!activeAllocationWorkspace) {
    allocationStatus.textContent = "Wybierz alokacje robocza.";
    allocationStatus.classList.add("error");
    return;
  }
  allocationStatus.textContent = "Zsuwanie palet...";
  allocationStatus.classList.remove("error");
  const response = await fetch("/api/allocations/compact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKeyInput.value
    },
    body: JSON.stringify({ workspace_id: activeAllocationWorkspace })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    allocationStatus.textContent = payload.detail || "Nie mozna zsunac palet.";
    allocationStatus.classList.add("error");
    return;
  }
  allocationStatus.textContent = payload.message || "Zsunieto palety.";
  await loadAllocationWorkspaces();
}

async function postAllocationSectionAction(endpoint, sectionPayload) {
  allocationStatus.textContent = "Aktualizacja mapy alokacji...";
  allocationStatus.classList.remove("error");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKeyInput.value
    },
    body: JSON.stringify({
      workspace_id: activeAllocationWorkspace,
      sku: sectionPayload.sku,
      color: sectionPayload.color || null,
      target_position: sectionPayload.target_position
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    allocationStatus.textContent = payload.detail || "Nie mozna zaktualizowac sekcji.";
    allocationStatus.classList.add("error");
    return;
  }
  allocationStatus.textContent = payload.message || "Zaktualizowano sekcje.";
  await loadAllocationWorkspaces();
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

function formatAllocationEvent(value) {
  return {
    utworzenie_alokacji: "Utworzenie alokacji",
    usuniecie_alokacji: "Usuniecie alokacji",
    import_rozladunku: "Import rozladunku",
    usuniecie_rozladunku: "Usuniecie rozladunku",
    import_planu_alokacji: "Import planu alokacji",
    usuniecie_mdk: "Usuniecie MDK",
    przeniesienie_mdk: "Przeniesienie MDK",
    zsuniecie_palet: "Zsuniecie palet",
    cofniecie_operacji: "Cofniecie operacji"
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
