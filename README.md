# FlowDesk

Leichtgewichtige Prozessautomatisierung für interne Freigabe-Workflows — Node.js, selbst gehostet, kein Overhead.

## Quick Start

```bash
cp .env.example .env
npm install
node app.js
# → http://localhost:3000
```

### Demo-Logins (Mock-Auth, solange kein LDAP konfiguriert ist)

Alle Passwörter: `test`

| Username  | Name              | Rolle      | Abteilung          |
|-----------|-------------------|------------|--------------------|
| `peter`   | Peter Hoffmann    | manager    | Geschäftsführung   |
| `markus`  | Markus Reiter     | manager    | Bereichsführung    |
| `michael` | Michael Berg      | manager    | Einkauf            |
| `lukas`   | Lukas Vogt        | employee   | Einkauf            |
| `sandra`  | Sandra Keller     | employee   | Einkauf            |
| `klaus`   | Klaus Wagner      | manager    | Werkstatt          |
| `tom`     | Tom Lindner       | employee   | Werkstatt          |
| `jonas`   | Jonas Brandt      | employee   | Werkstatt          |
| `erik`    | Erik Schuster     | employee   | Werkstatt          |
| `paula`   | Paula Hartmann    | hr         | HR                 |
| `nina`    | Nina Krause       | employee   | HR                 |
| `sophie`  | Sophie Albrecht   | employee   | HR                 |
| `chris`   | Chris Mertens     | it         | IT                 |
| `tarek`   | Tarek Younis      | employee   | IT                 |
| `lea`     | Lea Sommer        | employee   | IT                 |
| `frank`   | Frank Neumann     | facility   | Facility           |
| `admin`   | Admin User        | admin      | IT                 |

Die Vorgesetzten-Hierarchie (für Genehmiger-Ketten, z. B. bei Urlaubsanträgen):

```
Peter (CEO)
  └─ Markus (Bereichsleiter)
       ├─ Michael  (Einkauf)   ─ Lukas, Sandra
       ├─ Klaus    (Werkstatt) ─ Tom, Jonas, Erik
       ├─ Paula    (HR)        ─ Nina, Sophie
       └─ Chris    (IT)        ─ Tarek, Lea
```

---

## Projektstruktur

```
flowdesk/
├── app.js                        # Einstiegspunkt, Session-Setup, IMAP/Timeout-Scheduler
├── config/
│   ├── config.json               # Firmenname, Farben, Logo, Login-Seite, Feature-Flags
│   └── config.example.json
├── src/
│   ├── engine/index.js           # Workflow-Engine (State Machine)
│   ├── middleware/auth.js        # LDAP/AD + Mock-Auth, Vorgesetzten-Kette
│   ├── routes/index.js           # Alle HTTP-Routen + View-Rendering
│   ├── templateEngine.js         # Minimal-Templating für views/*.html
│   ├── db.js                     # JSON-Datenspeicher (data/instances.json)
│   ├── mockBusinessDb.js         # Fiktive Geschäftsdaten für Demo-Workflows
│   ├── emailParser.js            # Parst eingehende E-Mails zu Formulardaten
│   ├── emailTrigger.js           # Ordnet E-Mails Workflows zu, startet Instanzen
│   ├── imapPoller.js             # Pollt ein IMAP-Postfach für emailTrigger
│   └── workflows/                # ← Hier neue Workflows anlegen
│       ├── vacation-request/
│       │   ├── definition.json   # Steps, Rollen, Metadaten
│       │   ├── form.js           # Optional: dynamisches Formular (User-abhängig)
│       │   └── actions.js        # Action-Handler pro Step
│       ├── km-logging/
│       ├── purchase-approval/
│       ├── invoice-approval/
│       ├── employee-onboarding/
│       └── application-process/
├── views/                        # HTML-Templates (Handlebars-ähnliche Syntax)
│   ├── layout.html
│   ├── login.html
│   ├── dashboard.html
│   ├── workflow-form.html
│   └── instance.html
├── public/css/style.css          # Design-System (CSS-Variablen, Corporate-Theme)
└── data/instances.json           # Laufzeit-Daten (auto-erstellt)
```

---

## Neuen Workflow anlegen

Einen neuen Ordner unter `src/workflows/<workflow-id>/` anlegen mit drei Dateien:

### 1. `definition.json` — Steps & Metadaten

```json
{
  "id": "my-workflow",
  "name": "Mein Prozess",
  "description": "Kurze Beschreibung",
  "icon": "📦",
  "submitLabel": "Absenden",
  "roles": ["employee", "manager"],

  "steps": [
    { "id": "submit",          "type": "form",     "actor": "submitter", "onApprove": "notify-manager" },
    { "id": "notify-manager",  "type": "action",   "actor": "system",    "action": "notify-manager", "onApprove": "approval" },
    { "id": "approval",        "type": "approval",  "actor": "manager",   "onApprove": "done", "onReject": "done" }
  ]
}
```

**Step-Typen:**
| Typ         | Verhalten                                                             |
|-------------|------------------------------------------------------------------------|
| `form`      | Wartet auf Formular-Submit, dann automatisch weiter (`onApprove`)     |
| `action`    | Führt eine Funktion aus `actions.js` aus, läuft automatisch weiter    |
| `approval`  | Wartet auf manuelle Entscheidung (`decide()`), verzweigt per `onApprove`/`onReject` |
| `condition` | Wertet einen Ausdruck über die Formulardaten aus, verzweigt `onTrue`/`onFalse` |
| `parallel`  | Startet mehrere Branches gleichzeitig, wartet bis alle `done` sind (`onAllApproved`) |

`actor` steuert, wem der Step im Dashboard als "Offene Genehmigung" angezeigt wird: `manager`, `hr`, `it`, `facility` (jeweils zusätzlich sichtbar für `admin`).

### 2. `form.js` (optional) — dynamisches Formular

Nur nötig, wenn Felder vom eingeloggten User abhängen (z. B. vorausgefüllter Name, Genehmiger-Dropdown aus der Vorgesetzten-Kette). Ohne `form.js` werden Felder direkt aus `definition.json` gelesen (statisches `form.fields`-Array).

```js
module.exports = function buildForm(user) {
  return {
    hint: 'Optionaler Hinweistext über dem Formular',
    fields: [
      { id: 'employee_name', label: 'Name', type: 'text', required: true,
        defaultValue: user?.name || '', readOnly: true },
      { id: 'amount', label: 'Betrag (€)', type: 'number', required: true, min: 0 },
    ],
  };
};
```

Feld-Typen: `text`, `number`, `date`, `textarea`, `select` (mit `options: [{value, label}]`).

### 3. `actions.js` — Action-Handler

Jede Funktion bekommt `(instance)` und gibt `{ outcome: 'approve' | 'reject', note: '...' }` zurück. Formulardaten liegen unter `instance.formData`, **nicht** direkt auf der Instanz:

```js
module.exports = {
  'notify-manager'(instance) {
    const { amount } = instance.formData;
    console.log(`E-Mail → Manager ${instance.manager}: Antrag über ${amount} €`);
    // TODO: nodemailer
    return { outcome: 'approve', note: `Manager benachrichtigt` };
  },
};
```

Nach dem Anlegen: `node app.js` neu starten — Workflows werden nur beim Serverstart eingelesen. Der neue Workflow erscheint automatisch auf der Dashboard-Landingpage, gefiltert nach `roles`.

---

## Design / Theme anpassen

Corporate-Farben, Logo und Texte liegen zentral in `config/config.json` (Firmenname, Akzentfarbe, Login-Hintergrundbild). Feinere CSS-Anpassungen (z. B. Formular-Zentrierung, Abstände) in `public/css/style.css`, gesteuert über CSS-Variablen im `:root`-Block.

---

## LDAP/AD anbinden

In `.env`:

```
LDAP_URL=ldap://dc.firma.local
LDAP_BASE_DN=dc=firma,dc=local
LDAP_BIND_PREFIX=uid=
LDAP_MANAGER_GROUP=CN=Managers,OU=Groups,DC=firma,DC=local
LDAP_ADMIN_GROUP=CN=Admins,OU=Groups,DC=firma,DC=local
```

Ist `LDAP_URL` gesetzt, greift automatisch `authenticateLDAP()` statt der Mock-User-Liste in `src/middleware/auth.js`. Gruppen-zu-Rolle-Mapping dort bei Bedarf erweitern.

---

## E-Mail-Integration

- **IMAP-Poller** (`src/imapPoller.js`): Pollt ein Postfach, übergibt eingehende Mails an `emailTrigger.js`, das per `emailParser.js` Formulardaten extrahiert und passende Workflow-Instanzen startet.
- **Manueller Trigger:** `POST /api/imap/poll` (einmaliger Abruf) und `POST /api/email/simulate` (Test ohne echtes Postfach, Body: `{ from, fromName, subject, body }`).
- Steuerung über `features.emailSimulator` / `features.imapPoller` in `config/config.json`.

---

## Auf eine echte Datenbank wechseln

`src/db.js` austauschen — Engine und Routes sprechen nur gegen `db.find()`, `db.insert()`, `db.update()`, `db.all()`, `db.findOne()`. Alle anderen Dateien bleiben unverändert.

---

## Bekannte Baustellen

- `engine.getPendingForUser()` hat aktuell einen Variablen-Bug (`instance` statt `i` im Filter) — wird derzeit nicht aufgerufen, da die Router-Logik den Filter inline dupliziert.
- E-Mail-Versand ist überall nur als `console.log`/TODO angelegt (kein echter Nodemailer-Versand aktiv).

## Roadmap

- [ ] E-Mail-Benachrichtigungen tatsächlich versenden (Nodemailer)
- [ ] Dateianhänge (Multer)
- [ ] Resturlaub-Konto
- [ ] PostgreSQL-Adapter
- [ ] Admin-Panel für Workflow-Management