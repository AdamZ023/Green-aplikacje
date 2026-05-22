const apiKeyInput = document.querySelector("#apiKey");
const rows = document.querySelector("#stockRows");
const savedKey = localStorage.getItem("wmsApiKey") || "";
apiKeyInput.value = savedKey;

apiKeyInput.addEventListener("change", () => {
  localStorage.setItem("wmsApiKey", apiKeyInput.value);
});

async function loadStock() {
  rows.innerHTML = "<tr><td colspan=\"4\">Ladowanie...</td></tr>";
  const response = await fetch("/api/stock", {
    headers: { "X-API-Key": apiKeyInput.value }
  });

  if (!response.ok) {
    rows.innerHTML = "<tr><td colspan=\"4\">Brak dostepu albo blad API.</td></tr>";
    return;
  }

  const stock = await response.json();
  if (!stock.length) {
    rows.innerHTML = "<tr><td colspan=\"4\">Brak stanow.</td></tr>";
    return;
  }

  rows.innerHTML = stock.map((item) => `
    <tr>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.location)}</td>
      <td>${item.quantity}</td>
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

document.querySelector("#refresh").addEventListener("click", loadStock);
loadStock();
