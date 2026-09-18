# Weather dashboard

A responsive weather dashboard with city search, browser geolocation, current conditions, and a seven-day forecast. It uses the public [Open-Meteo](https://open-meteo.com/) geocoding and forecast APIs, so no API key is required.

## Run

From the repository root:

```bash
npm install
npm run weather:start
```

Open http://localhost:3100.

Set `WEATHER_PORT` to use another port. The server proxies API calls so the browser does not need to call Open-Meteo directly.

## API routes

- `GET /api/weather/search?q=Johannesburg`
- `GET /api/weather/forecast?latitude=-26.2041&longitude=28.0473&timezone=auto`

This is a separate dashboard service and does not alter the Debit NOW payment service or its credentials.
