# FlowDesk

Leichtgewichtige Prozessautomatisierung — Node.js, selbst gehostet, kein Overhead.

## Quick Start

```bash
cp .env.example .env
node app.js
# → http://localhost:3000
```

Demo-Login: `alice / test` (Mitarbeiter), `bob / test` (Manager), `admin / test`

---

## Projektstruktur

```
flowdesk/
├── app.js                    # Einstiegspunkt
├── src/
│   ├── engine/index.js       # Workflow-Engine (State Machine)
│   ├── middleware/auth.js    # LDAP/AD + Mock-Auth
│   ├── routes/index.js       # Alle HTTP-Routen + HTML-Templates
│   ├── workflows/            # ← Hier neue Workflows anlegen
│   │   ├── vacation-request.js
│   │   └── purchase-approval.js
│   └── db.js                 # JSON-Datenspeicher (→ PostgreSQL swap)
└── data/                     # Laufzeit-Daten (auto-erstellt)
```

---

## Neuen Workflow anlegen

Einfach eine neue Datei in `src/workflows/` anlegen:

```js
module.exports = {
  id: 'my-workflow',
  name: 'Mein Prozess',
  description: 'Kurze Beschreibung',
  icon: '📦',
  roles: ['employee', 'manager'],  // Wer darf starten

  form: {
    fields: [
      { id: 'field1', label: 'Feld 1', type: 'text', required: true },
      { id: 'field2', label: 'Beschreibung', type: 'textarea', required: false },
      { id: 'amount', label: 'Betrag', type: 'number', required: true },
    ]
  },

  steps: [
    { id: 'submit',           type: 'form',     actor: 'submitter', onApprove: 'notify-manager' },
    { id: 'notify-manager',   type: 'action',   actor: 'system',    action: 'notify-manager', onApprove: 'approval' },
    { id: 'approval',         type: 'approval', actor: 'manager',   onApprove: 'done', onReject: 'done' },
  ]
};
```

Neustart von `node app.js` — der Workflow erscheint automatisch auf der Landingpage.

---

## LDAP/AD anbinden

In `.env`:

```
LDAP_URL=ldap://dc.firma.local
LDAP_BASE_DN=dc=firma,dc=local
LDAP_MANAGER_GROUP=CN=Manager,OU=Groups,DC=firma,DC=local
LDAP_ADMIN_GROUP=CN=Admins,OU=Groups,DC=firma,DC=local
```

Gruppen-Mapping in `src/middleware/auth.js` anpassen.

---

## Auf PostgreSQL wechseln

`src/db.js` austauschen — alle anderen Dateien bleiben unverändert.
Die Engine und Routes sprechen nur gegen `db.find()`, `db.insert()`, `db.update()`.

---

## Roadmap

- [ ] E-Mail-Benachrichtigungen (Nodemailer)
- [ ] Dateianhänge (Multer)
- [ ] Resturlaub-Konto
- [ ] PostgreSQL-Adapter
- [ ] Kilometerstand-Abfrage per externer API
- [ ] Admin-Panel für Workflow-Management
