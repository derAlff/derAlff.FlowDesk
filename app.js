require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'flowdesk-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  },
}));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./src/routes/index'));

// API: Manueller IMAP-Abruf (z.B. per Cron oder Knopf im Admin-Panel)
app.post('/api/imap/poll', require('./src/middleware/auth').requireAuth, async (req, res) => {
  const { pollOnce } = require('./src/imapPoller');
  try {
    await pollOnce();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: E-Mail simulieren (nur für Tests / Demo)
app.post('/api/email/simulate', require('./src/middleware/auth').requireAuth, (req, res) => {
  const { handleIncomingEmail } = require('./src/emailTrigger');
  const { from, fromName, subject, body } = req.body;
  if (!body) return res.status(400).json({ error: 'body fehlt' });
  const result = handleIncomingEmail({ from, fromName, subject, body });
  res.json({
    type:      result.type,
    parsed:    result.parsed,
    instances: result.instances.map(i => ({ id: i.id, workflow: i.workflowName, step: i.currentStep })),
  });
});

// Start
app.listen(PORT, () => {
  console.log(`\n🚀 FlowDesk läuft auf http://localhost:${PORT}`);
  console.log(`\nDemo-Logins:`);
  console.log(`  alice/test  → Mitarbeiter    carol/test → HR`);
  console.log(`  bob/test    → Manager        ingo/test  → IT`);
  console.log(`  frank/test  → Facility       admin/test → Admin\n`);

  // Engine-Services starten
  const engine = require('./src/engine');
  engine.startTimeoutScheduler();

  const { startImapPoller } = require('./src/imapPoller');
  startImapPoller();
});
