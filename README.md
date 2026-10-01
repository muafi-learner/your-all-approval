# Your All Approval — Prototype

Multi-level WO → PR approval prototype for SCM and Project Design.
Static HTML + Tailwind (CDN) + vanilla JavaScript ES modules. Data lives in the browser's Local Storage; no backend is needed yet.

## Folder structure

```
your-all-approval/
├── index.html            Signature setup (draw or upload, saved per user)
├── dashboard.html        Approval dashboard (pipeline tiles, cards / table)
├── wo-form.html          New WO form (SPV)
├── wo-detail.html        Document detail: pricing, approve / reject, timeline
├── README.md
├── assets/
│   └── favicon.svg
├── css/
│   └── app.css           Small global styles Tailwind doesn't cover
└── js/
    ├── boot.js           Classic script: Tailwind theme + "opened from disk" warning
    ├── config.js         All settings: overdue hours, currency, webhook URLs, storage keys
    ├── storage.js        Safe Local Storage wrapper
    ├── crypto.js         SHA-256 and UUID helpers
    ├── format.js         Escaping, dates, durations, money
    ├── people.js         Demo users, stage holders, current demo user
    ├── signature.js      Read / save / delete signatures
    ├── data.js           Document storage, dummy seed data, numbering
    ├── workflow.js       Stages, permissions and state transitions (create, price, approve, reject)
    ├── outbox.js         Builds and logs the JSON payloads for n8n (POSTs when a URL is set)
    ├── ui.js             Shared shell (header, nav, user switcher), toast, dialog, badges
    └── pages/
        ├── signature.js
        ├── dashboard.js
        ├── wo-form.js
        └── wo-detail.js
```

File and folder names are case-sensitive on GitHub Pages. Keep them exactly as above.

## Deploy to GitHub Pages

1. Upload the **contents** of this folder to the root of your repository (so `index.html` sits at the top level, next to the `js/` folder).
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

## Testing locally

Browsers block ES modules on pages opened by double-clicking (`file://`). Use one of these instead:

- VS Code **Live Server** extension → "Open with Live Server"
- Or, in this folder: `python -m http.server 8000`, then open http://localhost:8000

## Try the full approval loop

1. **Signature page**: pick *Rina Wijaya (SPV)* in the header and save a signature. Repeat for *Andi Pratama (Manager)* and *Sari Utami (MD)*.
2. **New WO**: as Rina, fill in the form and submit. You land on the dashboard with the new WO highlighted.
3. Open the WO → **Switch to Budi Santoso** → enter unit prices → **Convert to PR**.
4. **Switch to Andi Pratama** → **Approve** (his signature is stamped as "Reviewed by").
5. **Switch to Sari Utami** → **Approve** → the PR is fully approved with all three stamps.

Use **Reset demo data** at the bottom of the dashboard to start over (signatures are kept).

## Configuration

Everything adjustable lives in `js/config.js`:

- `OVERDUE_HOURS`: when a stage is flagged "Overdue" (default 24)
- `CURRENCY`, `LOCALE`, `MONEY_LOCALE`: money and date formatting
- `WEBHOOKS`: n8n webhook URLs. Leave empty to only log payloads locally. When filled in, each action also POSTs its JSON (the n8n webhook must allow your GitHub Pages origin via CORS).

Every action's payload is visible on the document page under **Webhook payload**, and in the browser console.
