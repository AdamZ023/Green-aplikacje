const apiKeyInput = document.querySelector("#apiKey");
const rows = document.querySelector("#stockRows");
const savedKey = localStorage.getItem("wmsApiKey") || "";
apiKeyInput.value = savedKey;

apiKeyInput.addEventListener("change", () => {
  localStorage.setItem("wmsApiKey", apiKeyInput.value);
});

async function loadStock() {
  const hadRows = rows.children.length > 0;
  if (!hadRows) {
    rows.innerHTML = "<tr><td colspan=\"8\">Ladowanie...</td></tr>";
  }
  const response = await fetch("/api/stock", {
    headers: { "X-API-Key": apiKeyInput.value }
  });

  if (!response.ok) {
    rows.innerHTML = "<tr><td colspan=\"8\">Brak dostepu albo blad API.</td></tr>";
    return;
  }

  const stock = await response.json();
  if (!stock.length) {
    rows.innerHTML = "<tr><td colspan=\"8\">Brak stanow.</td></tr>";
    return;
  }

  rows.innerHTML = stock.map((item) => `
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
  `).join("");
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

document.querySelector("#refresh").addEventListener("click", loadStock);
loadStock();
setInterval(loadStock, 3000);
