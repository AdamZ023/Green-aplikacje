# Wdrozenie WMS w chmurze

Docelowo Zebra ma laczyc sie nie z komputerem w firmowym Wi-Fi, tylko z adresem HTTPS w internecie:

```text
https://twoja-aplikacja/scanner
```

## Opcja najprostsza: Render + PostgreSQL

1. Utworz usluge Web Service z katalogu `wms-zebra` w tym repozytorium.
2. Dodaj PostgreSQL.
3. Ustaw zmienne srodowiskowe:

```text
DATABASE_URL=adres PostgreSQL z panelu hostingu
WMS_API_KEY=dlugi-losowy-klucz
WMS_PUBLIC_URL=https://adres-twojej-aplikacji
```

4. Build command:

```text
pip install -r requirements.txt
```

5. Start command:

```text
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

6. Po wdrozeniu otworz:

```text
https://adres-twojej-aplikacji/
```

QR w lewym gornym rogu bedzie prowadzil Zebre do:

```text
https://adres-twojej-aplikacji/scanner
```

## Opcja Docker

Jesli hosting obsluguje Docker:

```bash
docker build -t wms-zebra .
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql+psycopg://USER:PASSWORD@HOST:5432/DB" \
  -e WMS_API_KEY="dlugi-losowy-klucz" \
  -e WMS_PUBLIC_URL="https://twoja-domena" \
  wms-zebra
```

## Wazne

- Lokalny SQLite jest tylko do testow.
- Produkcyjnie uzyj PostgreSQL.
- QR musi zawierac adres HTTPS dostepny dla Zebry przez internet.
- Po zmianie `WMS_PUBLIC_URL` odswiez panel WMS przez `Ctrl + F5`.
