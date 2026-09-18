# Deploying the weather dashboard on Render

This repository includes a Render Blueprint for the weather dashboard in `render.yaml`.

## Deploy with Render Blueprint

1. Push the repository to GitHub.
2. Open the Render dashboard: https://dashboard.render.com
3. Select **New → Blueprint**.
4. Connect `shabakoketso/Debit-NOW-AI`.
5. Select the `main` branch.
6. Review the service named `debit-now-weather`.
7. Click **Apply**.

Render will run:

```bash
npm install
npm run weather:start
```

The service listens on Render's `PORT` value. `weather-dashboard/server.js` currently falls back to port `3100` locally and uses `WEATHER_PORT` when supplied. If Render injects `PORT`, set the start environment to use it or update the server to prefer `process.env.PORT`.

## Important port fix before deployment

Render provides the `PORT` environment variable. The recommended server configuration is:

```js
const port = process.env.PORT || process.env.WEATHER_PORT || 3100;
```

After deployment, open the public Render URL shown on the service page.

## Health check

Render checks:

```text
GET /
```

The dashboard uses Open-Meteo's public geocoding and forecast APIs and does not require an API key.
