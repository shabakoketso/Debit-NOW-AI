# To-do dashboard

A responsive to-do list with add, complete, delete, filtering, and clear-completed actions. Tasks are persisted in the browser with `localStorage`; no database or API key is required.

## Run locally

From the repository root:

```bash
npm install
npm run todo:start
```

Open `http://localhost:3200`.

Set `PORT` or `TODO_PORT` to use a different port. Data is stored separately per browser and device under the `debit-now-todos-v1` local-storage key.
