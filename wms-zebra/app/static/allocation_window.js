(function () {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get("kind") || "events";
  const workspaceId = params.get("workspace_id") || "";
  const config = {
    pallets: {
      title: "Palety pod alokacje",
      endpoint: "/api/allocations/pallets",
      empty: "Brak palet w tej alokacji.",
      headers: ["Paleta", "Status", "Rzad", "Pozycja", "Kartony", "Indeks", "EAN", "Dostawa", "Plik", "Rozstawienie", "Operator", "ID skanera", "Odstawiono"],
      row: (item) => [
        item.pallet_code,
        item.status,
        item.layout_row,
        item.layout_position,
        item.total_cartons,
        item.sku_list,
        item.ean_list,
        item.delivery_ref,
        item.source_filename,
        formatPlacementStatus(item.placement_status),
        item.placed_by,
        item.placed_scanner_id,
        formatScanTime(item.placed_at)
      ]
    },
    contents: {
      title: "Zawartosc palet",
      endpoint: "/api/allocations/contents",
      empty: "Brak zawartosci palet.",
      headers: ["Dostawa", "Paleta", "Indeks", "Kolor", "Rodzaj", "Rozmiar", "EAN", "Kartonow", "Status"],
      row: (item) => [item.delivery_ref, item.pallet_code, item.sku, item.color, item.kind, item.size, item.ean, item.quantity_cartons, item.status]
    },
    plan: {
      title: "Plan Alokacji",
      endpoint: "/api/allocations/plan",
      empty: "Brak planu alokacji.",
      headers: ["MDK", "Kolor", "Dostawca", "Dostawa plan", "EAN PREPACK", "Plik", "Status"],
      row: (item) => [item.mdk, item.color, item.supplier, item.delivery_plan, item.ean_prepack, item.source_filename, item.status]
    },
    events: {
      title: "Historia alokacji",
      endpoint: "/api/allocations/events",
      empty: "Brak historii alokacji.",
      headers: ["Czas", "Operacja", "Opis", "Plik", "MDK", "Kolor", "Palety", "Kartony / pozycje", "Akcje"],
      row: (item) => [
        formatScanTime(item.created_at),
        formatAllocationEvent(item.event_type),
        item.description,
        item.source_filename,
        item.sku,
        item.color,
        item.pallet_count ?? "",
        item.carton_count ?? "",
        `<button type="button" data-undo-allocation-event="${escapeHtml(item.id)}" ${item.can_undo ? "" : "disabled"}>Cofnij</button>`
      ]
    }
  }[kind];

  const title = document.querySelector("#title");
  const workspaceLabel = document.querySelector("#workspaceLabel");
  const status = document.querySelector("#status");
  const tableWrap = document.querySelector("#tableWrap");

  if (!config) {
    title.textContent = "Nieznane okno alokacji";
    status.textContent = "Nieznany typ danych.";
    return;
  }

  title.textContent = config.title;
  document.title = config.title;
  workspaceLabel.textContent = `Alokacja: ${workspaceId || "-"}`;

  function currentApiKey() {
    if (window.opener && !window.opener.closed) {
      const input = window.opener.document.querySelector("#apiKey");
      if (input && input.value) return input.value;
    }
    return localStorage.getItem("wmsApiKey") || "";
  }

  async function loadRows() {
    if (!workspaceId) {
      status.textContent = "Brak wybranej alokacji.";
      return;
    }
    const apiKey = currentApiKey();
    if (!apiKey) {
      status.textContent = "Brak klucza API. Otworz okno z glownego WMS po wpisaniu klucza.";
      return;
    }
    status.textContent = "Ladowanie...";
    const response = await fetch(`${config.endpoint}?workspace_id=${encodeURIComponent(workspaceId)}`, {
      headers: { "X-API-Key": apiKey }
    });
    if (!response.ok) {
      status.textContent = "Brak dostepu albo blad API.";
      return;
    }
    const rows = await response.json();
    status.textContent = "";
    renderTable(rows);
  }

  function renderTable(rows) {
    if (!rows.length) {
      tableWrap.innerHTML = `<p>${escapeHtml(config.empty)}</p>`;
      return;
    }
    tableWrap.innerHTML = `
      <table>
        <thead><tr>${config.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((item) => `<tr>${config.row(item).map((cell, index) => `<td>${index === config.headers.length - 1 && kind === "events" ? cell : escapeHtml(cell ?? "")}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  function rowStatus(button) {
    let label = button.parentElement.querySelector(".row-status");
    if (!label) {
      label = document.createElement("span");
      label.className = "row-status";
      button.parentElement.appendChild(label);
    }
    label.classList.remove("error");
    return label;
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-undo-allocation-event]");
    if (!button || button.disabled) return;
    if (!confirm("Cofnac te operacje alokacji?")) return;
    const label = rowStatus(button);
    const apiKey = currentApiKey();
    if (!apiKey) {
      label.textContent = "Brak klucza API.";
      label.classList.add("error");
      return;
    }
    button.disabled = true;
    label.textContent = "Cofanie operacji...";
    try {
      const response = await fetch("/api/allocations/events/undo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey
        },
        body: JSON.stringify({ event_id: Number(button.dataset.undoAllocationEvent) })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        label.textContent = payload.detail || "Nie mozna cofnac operacji.";
        label.classList.add("error");
        button.disabled = false;
        return;
      }
      label.textContent = payload.message || "Cofnieto operacje.";
      if (window.opener && !window.opener.closed && typeof window.opener.refreshAllocationDataFromWindow === "function") {
        await window.opener.refreshAllocationDataFromWindow();
      }
      await loadRows();
    } catch (error) {
      label.textContent = "Nie mozna polaczyc sie z API.";
      label.classList.add("error");
      button.disabled = false;
    }
  });

  function formatAllocationEvent(value) {
    return {
      utworzenie_alokacji: "Utworzenie alokacji",
      usuniecie_alokacji: "Usuniecie alokacji",
      import_rozladunku: "Import rozladunku",
      usuniecie_rozladunku: "Wycofanie rozladunku",
      import_planu_alokacji: "Import planu alokacji",
      usuniecie_mdk: "Usuniecie MDK",
      przeniesienie_mdk: "Przeniesienie MDK",
      zsuniecie_palet: "Zsuniecie palet",
      zlecenie_rozstawienia: "Zlecenie rozstawienia",
      skan_palety_rozstawienie: "Skan palety",
      odstawienie_palety: "Odstawienie palety",
      cofniecie_operacji: "Cofniecie operacji"
    }[value] || value || "";
  }

  function formatPlacementStatus(value) {
    return {
      niezlecone: "niezlecone",
      do_rozstawienia: "do rozstawienia",
      odstawiona: "odstawiona"
    }[value] || value || "";
  }

  function formatScanTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (part, length = 2) => String(part).padStart(length, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(Math.floor(date.getMilliseconds() / 10), 2)}`;
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

  window.reloadAllocationDataWindow = loadRows;
  loadRows();
})();
