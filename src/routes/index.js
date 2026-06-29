const express = require('express');
const router = express.Router();
const { authenticateUser, requireAuth } = require('../middleware/auth');
const engine = require('../engine');
const dayjs  = require('dayjs');
const { config, generateThemeCSS } = require('../config');

// ─── LOGIN ───────────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/');
  res.send(renderLogin(req.query.error));
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await authenticateUser(username, password);
  if (!user) return res.redirect('/login?error=1');
  req.session.user = user;
  res.redirect('/');
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
  const user = req.session.user;
  const workflows = engine.getAvailableWorkflows(user.role);
  const instances = engine.getInstancesForUser(user);

  // Pending approvals — je nach Rolle andere Zuständigkeit
  const pendingApprovals = instances.filter(i => {
    if (i.status !== 'running') return false;
    const wf = engine.getWorkflow(i.workflowId);
    const currentStep = wf?.steps.find(s => s.id === i.currentStep);
    if (!currentStep || currentStep.type !== 'approval') return false;

    if (currentStep.actor === 'manager')  return user.role === 'manager'  && i.manager === user.username;
    if (currentStep.actor === 'hr')       return user.role === 'hr'       || user.role === 'admin';
    if (currentStep.actor === 'it')       return user.role === 'it'       || user.role === 'admin';
    if (currentStep.actor === 'facility') return user.role === 'facility' || user.role === 'admin';
    return false;
  });

  // My requests
  const myRequests = instances.filter(i => i.submitter === user.username);

  res.send(renderDashboard(user, workflows, myRequests, pendingApprovals));
});

// ─── WORKFLOW FORM ────────────────────────────────────────────────────────────

router.get('/workflow/:id', requireAuth, (req, res) => {
  const user = req.session.user;
  const wf = engine.getWorkflow(req.params.id);
  if (!wf) return res.status(404).send('Workflow nicht gefunden');
  res.send(renderWorkflowForm(user, wf, req.query.error));
});

router.post('/workflow/:id', requireAuth, (req, res) => {
  const user = req.session.user;
  const wf = engine.getWorkflow(req.params.id);
  if (!wf) return res.status(404).send('Workflow nicht gefunden');

  try {
    engine.start(req.params.id, user, req.body);
    res.redirect('/?success=1');
  } catch (e) {
    res.redirect(`/workflow/${req.params.id}?error=${encodeURIComponent(e.message)}`);
  }
});

// ─── APPROVAL ────────────────────────────────────────────────────────────────

router.get('/instance/:id', requireAuth, (req, res) => {
  const user = req.session.user;
  const instance = engine.getInstance(req.params.id);
  if (!instance) return res.status(404).send('Nicht gefunden');

  const wf = engine.getWorkflow(instance.workflowId);
  res.send(renderInstance(user, instance, wf));
});

router.post('/instance/:id/decide', requireAuth, (req, res) => {
  const user = req.session.user;
  const { action, note } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.status(400).send('Ungültige Aktion');

  try {
    engine.decide(req.params.id, user, action, note);
    res.redirect('/');
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// ─── TEMPLATES ───────────────────────────────────────────────────────────────

function layout(title, body, user = null) {
  const { company, theme, app } = config;
  const themeCSS = generateThemeCSS(theme);

  const logoHtml = theme.nav.logoStyle === 'image' && company.logoUrl
    ? `<a href="/"><img src="${company.logoUrl}" alt="${company.name}" style="height:44px;width:auto;object-fit:contain;"></a>`
    : `<a href="/" class="logo-text">${company.name}</a>`;

  return `<!DOCTYPE html>
<html lang="${app.language || 'de'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} – ${app.title}</title>
  ${company.faviconUrl ? `<link rel="icon" href="${company.faviconUrl}">` : ''}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    ${themeCSS}

    body {
      font-family: var(--font);
      font-size: var(--font-size);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.6;
    }

    nav {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: var(--nav-height);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .logo-text {
      font-weight: 800;
      font-size: 18px;
      letter-spacing: -0.5px;
      color: var(--accent);
      text-decoration: none;
    }

    .nav-user {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      color: var(--muted);
    }

    .badge {
      background: var(--accent-dim);
      color: var(--accent);
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .logout { color: var(--muted); font-size: 13px; }

    main { max-width: 900px; margin: 0 auto; padding: 32px 20px; }

    h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: var(--text); }
    .subtitle { color: var(--muted); margin-bottom: 32px; font-size: 14px; }
    .section { margin-bottom: 40px; }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      padding: 20px;
      cursor: pointer;
      transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s;
      text-decoration: none;
      color: var(--text);
      display: block;
    }

    .card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      text-decoration: none;
    }

    .card-icon  { font-size: 28px; margin-bottom: 10px; }
    .card-title { font-weight: 600; font-size: 15px; }
    .card-desc  { color: var(--muted); font-size: 13px; margin-top: 4px; }

    table { width: 100%; border-collapse: collapse; font-size: 14px; }

    th {
      text-align: left;
      padding: 8px 12px;
      color: var(--muted);
      font-weight: 600;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }

    td { padding: 12px 12px; border-bottom: 1px solid var(--border); }
    tr:last-child td { border-bottom: none; }

    .table-wrap {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      overflow: hidden;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: 20px;
    }

    .status-running  { background: var(--accent-dim); color: var(--accent); }
    .status-approved { background: #d4edda; color: var(--green); }
    .status-rejected { background: #f8d7da; color: var(--red); }

    .empty { color: var(--muted); font-size: 14px; padding: 24px; text-align: center; }

    .form-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      padding: 28px;
      max-width: 560px;
    }

    .form-group { margin-bottom: 18px; }

    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    input, textarea, select {
      width: 100%;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--radius-input);
      padding: 10px 12px;
      color: var(--text);
      font-size: 15px;
      font-family: inherit;
      transition: border-color 0.15s;
    }

    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--accent);
    }

    textarea { resize: vertical; min-height: 80px; }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      border-radius: var(--radius-btn);
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s, transform 0.1s;
      letter-spacing: 0.3px;
    }

    .btn:hover { opacity: 0.88; transform: translateY(-1px); }
    .btn-primary { background: var(--accent); color: var(--accent-text); }
    .btn-success { background: var(--green); color: #fff; }
    .btn-danger  { background: var(--red);   color: #fff; }
    .btn-ghost   { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
    .btn-row     { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }

    .alert {
      padding: 12px 16px;
      border-radius: var(--radius-card);
      font-size: 14px;
      margin-bottom: 20px;
    }

    .alert-success { background: #d4edda; color: var(--green); border: 1px solid #b8dac4; }
    .alert-error   { background: #f8d7da; color: var(--red);   border: 1px solid #f0b8bc; }

    .timeline { margin-top: 20px; }
    .timeline-item {
      display: flex;
      gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    .timeline-item:last-child { border-bottom: none; }
    .tl-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: var(--accent);
      margin-top: 5px; flex-shrink: 0;
    }
    .tl-time { color: var(--muted); font-size: 12px; }

    @media (max-width: 600px) {
      .card-grid { grid-template-columns: 1fr 1fr; }
      main { padding: 20px 14px; }
    }
  </style>
</head>
<body>
  <nav>
    ${logoHtml}
    ${user ? `
    <div class="nav-user">
      <span>${user.name}</span>
      <span class="badge">${user.role}</span>
      <a href="/logout" class="logout">Abmelden</a>
    </div>` : ''}
  </nav>
  <main>${body}</main>
</body>
</html>`;
}


function renderLogin(error) {
  const { company, app, login } = config;
  const bgStyle = login.backgroundImage
    ? `background: linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('${login.backgroundImage}') center/cover no-repeat; min-height: 100vh;`
    : '';

  return layout('Anmelden', `
    <div style="${bgStyle}padding:${login.backgroundImage ? '0' : '0'};margin:-32px -20px;padding:60px 20px;min-height:calc(100vh - var(--nav-height));">
      <div style="max-width:380px;margin:0 auto;">
        ${login.backgroundImage ? `<h1 style="color:#fff;margin-bottom:4px;">${login.welcomeMessage}</h1>
        <p style="color:rgba(255,255,255,0.7);margin-bottom:28px;font-size:14px;">${company.tagline}</p>` : `
        <h1 style="margin-bottom:4px;">${login.welcomeMessage}</h1>
        <p class="subtitle">${company.tagline}</p>`}
        ${error ? '<div class="alert alert-error">Benutzername oder Passwort falsch.</div>' : ''}
        <div class="form-card">
          <form method="POST" action="/login">
            <div class="form-group">
              <label>Benutzername</label>
              <input type="text" name="username" autocomplete="username" required autofocus>
            </div>
            <div class="form-group">
              <label>Passwort</label>
              <input type="password" name="password" autocomplete="current-password" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%">Anmelden</button>
          </form>
          ${login.showDemoHint ? `<p style="margin-top:16px;font-size:12px;color:var(--muted);">
            alice/test (Mitarbeiter) · bob/test (Manager) · carol/test (HR)<br>
            ingo/test (IT) · frank/test (Facility) · admin/test
          </p>` : ''}
        </div>
      </div>
    </div>
  `);
}

function renderDashboard(user, workflows, myRequests, pendingApprovals) {
  const statusLabel = { running: 'In Bearbeitung', approved: 'Genehmigt', rejected: 'Abgelehnt' };
  const statusClass = { running: 'status-running', approved: 'status-approved', rejected: 'status-rejected' };

  const wfCards = workflows.map(wf => `
    <a href="/workflow/${wf.id}" class="card">
      <div class="card-icon">${wf.icon}</div>
      <div class="card-title">${wf.name}</div>
      <div class="card-desc">${wf.description}</div>
    </a>
  `).join('');

  const pendingRows = pendingApprovals.length
    ? pendingApprovals.map(i => `
      <tr>
        <td>${i.workflowName}</td>
        <td>${i.submitterName}</td>
        <td>${dayjs(i.createdAt).format('DD.MM.YYYY HH:mm')}</td>
        <td><a href="/instance/${i.id}" class="btn btn-primary" style="padding:5px 12px;font-size:13px;">Prüfen</a></td>
      </tr>
    `).join('')
    : `<tr><td colspan="4" class="empty">Keine offenen Genehmigungen</td></tr>`;

  const myRows = myRequests.length
    ? myRequests.map(i => `
      <tr>
        <td>${i.workflowName}</td>
        <td><span class="status ${statusClass[i.status]}">${statusLabel[i.status]}</span></td>
        <td>${dayjs(i.createdAt).format('DD.MM.YYYY')}</td>
        <td><a href="/instance/${i.id}">Details</a></td>
      </tr>
    `).join('')
    : `<tr><td colspan="4" class="empty">Noch keine Anträge gestellt</td></tr>`;

  const pendingSection = (user.role === 'manager' || user.role === 'admin') ? `
    <div class="section">
      <h2>⏳ Offene Genehmigungen</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Prozess</th><th>Von</th><th>Eingereicht</th><th></th></tr></thead>
          <tbody>${pendingRows}</tbody>
        </table>
      </div>
    </div>
  ` : '';

  return layout(config.app.title, `
    <h1>${config.app.welcomeText}, ${user.name.split(' ')[0]} 👋</h1>
    <p class="subtitle">${user.department} · ${user.role}</p>

    ${pendingSection}

    <div class="section">
      <h2>🚀 Prozess starten</h2>
      <div class="card-grid">${wfCards}</div>
    </div>

    <div class="section">
      <h2>📋 Meine Anträge</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Prozess</th><th>Status</th><th>Datum</th><th></th></tr></thead>
          <tbody>${myRows}</tbody>
        </table>
      </div>
    </div>
  `, user);
}

function renderWorkflowForm(user, wf, error) {
  const form = wf.form;
  const fields = form.fields.map(f => {
    let input = '';
    if (f.type === 'textarea') {
      input = `<textarea name="${f.id}" placeholder="${f.placeholder||''}" ${f.required ? 'required' : ''}></textarea>`;
    } else if (f.type === 'select') {
      const opts = (f.options || []).map(o =>
        `<option value="${o.value}">${o.label}</option>`
      ).join('');
      input = `<select name="${f.id}" ${f.required ? 'required' : ''}><option value="">— bitte wählen —</option>${opts}</select>`;
    } else {
      input = `<input type="${f.type}" name="${f.id}"
        placeholder="${f.placeholder||''}"
        ${f.min !== undefined ? `min="${f.min}"` : ''}
        ${f.step ? `step="${f.step}"` : ''}
        ${f.required ? 'required' : ''}>`;
    }
    return `<div class="form-group"><label>${f.label}${f.required ? ' *' : ''}</label>${input}</div>`;
  }).join('');

  const hint = form.hint
    ? `<div class="alert" style="background:var(--accent-dim);color:var(--accent);border:1px solid var(--accent);margin-bottom:16px;font-size:13px;">ℹ️ ${form.hint}</div>`
    : '';

  return layout(wf.name, `
    <a href="/" style="color:var(--muted);font-size:13px;">← Zurück</a>
    <h1 style="margin-top:16px;">${wf.icon} ${wf.name}</h1>
    <p class="subtitle">${wf.description}</p>

    ${error ? `<div class="alert alert-error">${decodeURIComponent(error)}</div>` : ''}

    <div class="form-card">
      ${hint}
      <form method="POST" action="/workflow/${wf.id}">
        ${fields}
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Antrag stellen</button>
          <a href="/" class="btn btn-ghost">Abbrechen</a>
        </div>
      </form>
    </div>
  `, user);
}

function renderInstance(user, instance, wf) {
  const statusLabel = { running: 'In Bearbeitung', approved: 'Genehmigt', rejected: 'Abgelehnt' };
  const statusClass = { running: 'status-running', approved: 'status-approved', rejected: 'status-rejected' };

  const currentStep = wf?.steps.find(s => s.id === instance.currentStep);
  const canDecide = currentStep?.type === 'approval'
    && (instance.manager === user.username || user.role === 'admin')
    && instance.status === 'running';

  const dataRows = Object.entries(instance.formData).map(([k, v]) => `
    <tr><td style="color:var(--muted);width:40%">${k}</td><td><strong>${v}</strong></td></tr>
  `).join('');

  const timeline = instance.history.map(h => `
    <div class="timeline-item">
      <div class="tl-dot"></div>
      <div>
        <div><strong>${h.actor}</strong> – ${h.action}</div>
        ${h.note ? `<div style="color:var(--muted)">${h.note}</div>` : ''}
        <div class="tl-time">${dayjs(h.timestamp).format('DD.MM.YYYY HH:mm')}</div>
      </div>
    </div>
  `).join('');

  const approvalForm = canDecide ? `
    <div class="form-card" style="margin-top:24px;">
      <h2>Entscheidung</h2>
      <form method="POST" action="/instance/${instance.id}/decide">
        <div class="form-group">
          <label>Kommentar (optional)</label>
          <textarea name="note" placeholder="Begründung..."></textarea>
        </div>
        <div class="btn-row">
          <button type="submit" name="action" value="approve" class="btn btn-success">✓ Genehmigen</button>
          <button type="submit" name="action" value="reject"  class="btn btn-danger">✗ Ablehnen</button>
        </div>
      </form>
    </div>
  ` : '';

  return layout(`${wf?.name || 'Antrag'}`, `
    <a href="/" style="color:var(--muted);font-size:13px;">← Zurück</a>
    <h1 style="margin-top:16px;">${wf?.icon || '📄'} ${instance.workflowName}</h1>
    <p class="subtitle">
      Von <strong>${instance.submitterName}</strong> · 
      <span class="status ${statusClass[instance.status]}">${statusLabel[instance.status]}</span>
    </p>

    <div class="form-card" style="margin-bottom:24px;">
      <h2>Angaben</h2>
      <table style="margin-top:8px;">
        <tbody>${dataRows}</tbody>
      </table>
    </div>

    <div class="form-card">
      <h2>Verlauf</h2>
      <div class="timeline">${timeline}</div>
    </div>

    ${approvalForm}
  `, user);
}

module.exports = router;
