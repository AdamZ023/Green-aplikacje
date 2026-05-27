const apiKeyInput = document.querySelector("#apiKey");
const warehouseRows = document.querySelector("#warehouseRows");
const logisticsRows = document.querySelector("#logisticsRows");
const historyRows = document.querySelector("#historyRows");
const views = {
  warehouse: document.querySelector("#warehouseView"),
  logistics: document.querySelector("#logisticsView"),
  history: document.querySelector("#operationHistoryView")
};
const buttons = {
  warehouse: document.querySelector("#warehouseViewButton"),
  logistics: document.querySelector("#logisticsViewButton"),
  history: document.querySelector("#historyViewButton")
};
const savedKey = localStorage.getItem("wmsApiKey") || "";
let activeView = localStorage.getItem("wmsDashboardView") || "warehouse";

apiKeyInput.value = savedKey;

apiKeyInput.addEventListener("change", () => {
  localStorage.setItem("wmsApiKey", apiKeyInput.value);
  loadAll();
});

buttons.warehouse.addEventListener("click", () => showView("warehouse"));
buttons.logistics.addEventListener("click", () => showView("logistics"));
buttons.history.addEventListener("click", () => showView("history"));
document.querySelector("#refresh").addEventListener("click", loadAll);

function showView(name) {
  activeView = name;
  localStorage.setItem("wmsDashboardView", name);
  for (const [viewName, view] of Object.entries(views)) {
    view.classList.toggle("hidden", viewName !== name);
    buttons[viewName].classList.toggle("secondary", viewName !== name);
  }
}

async function loadAll() {
  await Promise.all([
    loadWarehouseStock(),
    loadLogisticsStock(),
    loadOperationHistory()
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
  const [operationsResponse, itemsResponse] = await Promise.all([
    fetch("/api/operations?limit=200&operation_type=move", { headers }),
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
    historyRows.innerHTML = "<tr><td colspan=\"10\">Brak historii przesuniec.</td></tr>";
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
    move: "Przesuniecie"
  }[value] || value;
}

if (!views[activeView]) {
  activeView = "warehouse";
}
showView(activeView);
loadAll();
setInterval(loadAll, 3000);
