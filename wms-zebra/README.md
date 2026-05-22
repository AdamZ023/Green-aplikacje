# WMS API dla skanerow Zebra

Minimalny system WMS z centralna baza danych i API po HTTPS.

## Co zawiera

- FastAPI jako serwer API.
- PostgreSQL jako baza produkcyjna.
- SQLite jako tryb lokalny/testowy bez konfiguracji.
- Prosty ekran skanera w przegladarce: `/scanner`.
- Panel podgladu stanow: `/`.
- Operacje magazynowe odporne na rownoczesne zapisy dzieki transakcjom bazy.

## Szybki start lokalnie

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Albo po pierwszej instalacji:

```powershell
.\run_server.ps1
```

Potem otworz:

- panel: `http://127.0.0.1:8000/`
- skaner: `http://127.0.0.1:8000/scanner`
- dokumentacja API: `http://127.0.0.1:8000/docs`

## Konfiguracja produkcyjna

W chmurze ustaw zmienne srodowiskowe:

```text
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME
WMS_API_KEY=dlugi-losowy-klucz
WMS_PUBLIC_URL=https://adres-twojej-aplikacji
```

Strona `/scanner` pozwala wpisac klucz API i zapisuje go lokalnie w przegladarce urzadzenia.

## Wdrozenie

Poniewaz firmowe Wi-Fi izoluje urzadzenia, docelowo uzyj chmury i HTTPS. Szczegoly sa w pliku `DEPLOY_CHMURA.md`.

Najprostsza architektura:

1. Utworz PostgreSQL w chmurze, np. Neon, Supabase, Azure Database for PostgreSQL albo zwykly VPS.
2. Wystaw aplikacje jako usluge HTTPS, np. Render, Railway, Fly.io, Azure App Service albo VPS z Nginx.
3. Na skanerach Zebra otworz adres `https://twoja-domena/scanner`.

## Podstawowe endpointy

- `GET /api/items` - lista pozycji magazynowych.
- `POST /api/items` - utworzenie kartoteki produktu.
- `POST /api/stock/receive` - przyjecie towaru.
- `POST /api/stock/issue` - wydanie towaru.
- `POST /api/stock/move` - przesuniecie miedzy lokalizacjami.
- `GET /api/operations` - historia operacji.
