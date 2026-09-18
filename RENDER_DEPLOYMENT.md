# Render deployment

The unified Debit NOW service starts from the repository root with:

```bash
npm install
npm start
```

The application listens on Render's injected `PORT` value and serves the control dashboard at `/dashboard`.

## Fixing an existing Render service

If Render logs show:

```text
Running 'node src/index.js'
Cannot find module '/opt/render/project/src/src/index.js'
```

then the existing Render service has an incorrect **Start Command** override. In Render, open:

**Service → Settings → Build & Deploy → Start Command**

Set it to:

```bash
npm start
```

Do not use `node src/index.js`; this repository's entrypoint is `index.js` in the repository root.

Then save and select **Manual Deploy → Deploy latest commit**.

The Blueprint file contains only the unified Debit NOW web service. The weather dashboard remains available for local use with `npm run weather:start` and should be deployed as a separate Render service only if required.
