const apiKey = document.querySelector("#apiKey");
const scannerId = document.querySelector("#scannerId");
const operatorName = document.querySelector("#operator");
const statusBox = document.querySelector("#status");

apiKey.value = localStorage.getItem("wmsApiKey") || "";
scannerId.value = localStorage.getItem("wmsScannerId") || scannerId.value;
operatorName.value = localStorage.getItem("wmsOperator") || "";

for (const field of [apiKey, scannerId, operatorName]) {
  field.addEventListener("change", () => {
    localStorage.setItem("wmsApiKey", apiKey.value);
    localStorage.setItem("wmsScannerId", scannerId.value);
    localStorage.setItem("wmsOperator", operatorName.value);
  });
}

document.querySelector("#scanForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = event.submitter.dataset.action;
  await send(`/api/stock/${action}`, {
    sku: document.querySelector("#sku").value.trim(),
    location: document.querySelector("#location").value.trim(),
    quantity: Number(document.querySelector("#quantity").value),
    scanner_id: scannerId.value.trim(),
    operator: operatorName.value.trim() || null
  });
  document.querySelector("#sku").select();
});

document.querySelector("#moveForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await send("/api/stock/move", {
    sku: document.querySelector("#moveSku").value.trim(),
    from_location: document.querySelector("#fromLocation").value.trim(),
    to_location: document.querySelector("#toLocation").value.trim(),
    quantity: Number(document.querySelector("#moveQuantity").value),
    scanner_id: scannerId.value.trim(),
    operator: operatorName.value.trim() || null
  });
  document.querySelector("#moveSku").select();
});

async function send(url, body) {
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
    return;
  }

  setStatus("Zapisano operacje.", false);
}

function setStatus(message, isError) {
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
}
