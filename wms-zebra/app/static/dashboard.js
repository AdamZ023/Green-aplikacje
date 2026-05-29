const apiKeyInput = document.querySelector("#apiKey");
const warehouseRows = document.querySelector("#warehouseRows");
const logisticsRows = document.querySelector("#logisticsRows");
const historyRows = document.querySelector("#historyRows");
const pickingBatchRows = document.querySelector("#pickingBatchRows");
const pickingRows = document.querySelector("#pickingRows");
const pickingFile = document.querySelector("#pickingFile");
const pickingDetails = document.querySelector("#pickingDetails");
const pickingDetailsTitle = document.querySelector("#pickingDetailsTitle");
const pickingImportStatus = document.querySelector("#pickingImportStatus");
const views = {
  warehouse: document.querySelector("#warehouseView"),
  logistics: document.querySelector("#logisticsView"),
  history: document.querySelector("#operationHistoryView"),
  picking: document.querySelector("#pickingView")
};
const buttons = {
  warehouse: document.querySelector("#warehouseViewButton"),
  logistics: document.querySelector("#logisticsViewButton"),
  history: document.querySelector("#historyViewButton"),
  picking: document.querySelector("#pickingViewButton")
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

apiKeyInput.value = savedKey;

apiKeyInput.addEventListener("change", () => {
  localStorage.setItem("wmsApiKey", apiKeyInput.value);
  loadAll();
});

buttons.warehouse.addEventListener("click", () => showView("warehouse"));
buttons.logistics.addEventListener("click", () => showView("logistics"));
buttons.history.addEventListener("click", () => showView("history"));
buttons.picking.addEventListener("click", () => showView("picking"));
historyFilterButtons.all.addEventListener("click", () => setHistoryFilter("all"));
historyFilterButtons.receive.addEventListener("click", () => setHistoryFilter("receive"));
historyFilterButtons.move.addEventListener("click", () => setHistoryFilter("move"));
document.querySelector("#refresh").addEventListener("click", loadAll);
document.querySelector("#pickingImportButton").addEventListener("click", importPicking);

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
    loadPickingBatches()
  ]);
}

async function loadWarehouseStock() {
  const hadRows = warehouseRows.children.length > 0;
  if (!hadRows) {
    warehouseRows.innerHTML = "<tr><td colspan=\"8\">Ladowanie...</td></tr>";
  }
  const response = await fetch("/api/warehouse-stock", {
    headers: { "X-API-Key": apiKeyInput.value }
  });

  if (!response.ok) {
    warehouseRows.innerHTML = "<tr><td colspan=\"8\">Brak dostepu albo blad API.</td></tr>";
    return;
  }

  const stock = await response.json();
  if (!stock.length) {
    warehouseRows.innerHTML = "<tr><td colspan=\"8\">Brak stanow.</td></tr>";
    return;
  }

  const total = stock.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  warehouseRows.innerHTML = stock.map((item) => `
    <tr>
      <td>${escapeHtml(item.barcode || "")}</td>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.warehouse)}</td>
      <td>${item.quantity}</td>
      <td>${escapeHtml(formatScanTime(item.scan_at))}</td>
      <td>${escapeHtml(item.operator || "")}</td>
      <td>${escapeHtml(item.scanner_id || "")}</td>
    </tr>
  `).join("") + totalRow(4, total, 3);
}

async function loadLogisticsStock() {
  const hadRows = logisticsRows.children.length > 0;
  if (!hadRows) {
    logisticsRows.innerHTML = "<tr><td colspan=\"8\">Ladowanie...</td></tr>";
  }
  const response = await fetch("/api/stock", {
    headers: { "X-API-Key": apiKeyInput.value }
  });

  if (!response.ok) {
    logisticsRows.innerHTML = "<tr><td colspan=\"8\">Brak dostepu albo blad API.</td></tr>";
    return;
  }

  const stock = await response.json();
  if (!stock.length) {
    logisticsRows.innerHTML = "<tr><td colspan=\"8\">Brak stanow.</td></tr>";
    return;
  }

  const total = stock.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  logisticsRows.innerHTML = stock.map((item) => `
    <tr>
      <td>${escapeHtml(item.barcode || "")}</td>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.location)}</td>
      <td>${item.quantity}</td>
      <td>${escapeHtml(formatScanTime(item.scan_at))}</td>
      <td>${escapeHtml(item.operator || "")}</td>
      <td>${escapeHtml(item.scanner_id || "")}</td>
    </tr>
  `).join("") + totalRow(4, total, 3);
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
  if (!pickingRows.children.length) {
    pickingRows.innerHTML = "<tr><td colspan=\"9\">Ladowanie...</td></tr>";
  }
  const response = await fetch(`/api/picking/tasks?limit=500&batch_id=${encodeURIComponent(batchId)}`, {
    headers: { "X-API-Key": apiKeyInput.value }
  });
  if (!response.ok) {
    pickingRows.innerHTML = "<tr><td colspan=\"9\">Brak dostepu albo blad API.</td></tr>";
    return;
  }
  const tasks = await response.json();
  if (!tasks.length) {
    pickingRows.innerHTML = "<tr><td colspan=\"9\">Brak pozycji w tym pickingu.</td></tr>";
    return;
  }
  pickingRows.innerHTML = tasks.map((task) => `
    <tr>
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

function totalRow(labelColspan, total, trailingColspan) {
  return `
    <tr class="total-row">
      <td colspan="${labelColspan}">Total</td>
      <td>${total}</td>
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
    pad(date.getMilliseconds(), 3)
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
    done: "Zrobione",
    blocked: "Brak stanu"
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
