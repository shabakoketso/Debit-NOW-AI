# Render deployment

The unified service uses the repository-root entrypoint:

```bash
npm install
node index.js
```

The dashboard is served at `/dashboard`.

## Existing Render service

For an existing Render service, the service-level setting takes precedence over `render.yaml`. In Render, open **Settings → Build & Deploy** and set:

```text
Build Command: npm install
Start Command: node index.js
```

Remove any command containing `src/index.js`. This repository intentionally has no required `src/index.js` entrypoint.

Then choose **Manual Deploy → Deploy latest commit**.

Required production environment variables:

- `DATABASE_URL`
- `NODE_ENV=production`
- `OTP_PEPPER`
- `VERIFY_TOKEN`
- `SMS_GATEWAY=mock` for safe sandbox testing
- `OTP_VALID_MINUTES=5`
- `OTP_MAX_ATTEMPTS=3`
