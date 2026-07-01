const express = require('express');
const router  = express.Router();
const dayjs   = require('dayjs');

const { authenticateUser, requireAuth } = require('../middleware/auth');
const engine  = require('../engine');
const { config, generateThemeCSS } = require('../config');
const { render } = require('../templateEngine');

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
  const instances  = engine.getInstancesForUser(user);

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

  const myRequests = instances.filter(i => i.submitter === user.username);

  res.send(renderDashboard(user, workflows, myRequests, pendingApprovals));
});

// ─── WORKFLOW FORM ────────────────────────────────────────────────────────────

router.get('/workflow/:id', requireAuth, (req, res) => {
  const user = req.session.user;
  const wf = engine.getWorkflow(req.params.id, user);
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

// ─── APPROVAL / DETAIL ─────────────────────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════
// VIEW RENDERER — lädt views/*.html, befüllt sie, wrappt in layout.html
// ═══════════════════════════════════════════════════════════════════════════

function page(pageTitle, bodyHtml, user = null) {
  const { company, theme, app } = config;
  const themeCSS = generateThemeCSS(theme);

  const logoHtml = theme.nav.logoStyle === 'image' && company.logoUrl
    ? `<a href="/"><img class="nav-logo-img" src="${company.logoUrl}" alt="${company.name}"></a>`
    : `<a href="/" class="logo-text">${company.name}</a>`;

  return render('layout', {
    language:    app.language || 'de',
    pageTitle,
    appTitle:    app.title,
    faviconUrl:  company.faviconUrl,
    themeCSS,
    logoHtml,
    isLoggedIn:  !!user,
    userName:    user?.name,
    userRole:    user?.role,
    body:        bodyHtml,
  });
}

function renderLogin(error) {
  const { company, app, login } = config;

  const hasBackground = !!login.backgroundImage;
  const heroStyle = hasBackground
    ? `background: linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('${login.backgroundImage}') center/cover no-repeat;`
    : '';

  const body = render('login', {
    heroClass:        hasBackground ? 'has-bg' : '',
    heroStyle,
    hasBackground,
    hasNoBackground:  !hasBackground,
    welcomeMessage:   login.welcomeMessage,
    tagline:          company.tagline,
    hasError:         !!error,
    showDemoHint:     login.showDemoHint,
    appTitle:         app.title,
    companyName:      company.name,
    companyPhone:     company.phone || '',
  });

  return page('Anmelden', body);
}

function renderDashboard(user, workflows, myRequests, pendingApprovals) {
  const statusLabel = { running: 'In Bearbeitung', approved: 'Genehmigt', rejected: 'Abgelehnt' };
  const statusClass = { running: 'status-running', approved: 'status-approved', rejected: 'status-rejected' };

  const workflowCards = workflows.map(wf => `
    <a href="/workflow/${wf.id}" class="workflow-card">
      <div class="workflow-icon">${wf.icon}</div>
      <div class="workflow-name">${wf.name}</div>
      <div class="workflow-desc">${wf.description}</div>
      <div class="workflow-cta">Starten</div>
    </a>
  `).join('');

  const pendingRows = pendingApprovals.length
    ? pendingApprovals.map(i => `
      <tr>
        <td>${i.workflowName}</td>
        <td>${i.submitterName}</td>
        <td>${dayjs(i.createdAt).format('DD.MM.YYYY')} ${dayjs(i.createdAt).format('HH:mm')}</td>
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

  const showPending = user.role === 'manager' || user.role === 'hr' || user.role === 'it' || user.role === 'facility' || user.role === 'admin';

  const body = render('dashboard', {
    welcomeText:   config.app.welcomeText,
    firstName:     user.name.split(' ')[0],
    department:    user.department,
    role:          user.role,
    showPending,
    pendingRows,
    workflowCards,
    myRequestRows: myRows,
  });

  return page(config.app.title, body, user);
}

function renderWorkflowForm(user, wf, error) {
  const form = wf.form;
  const fieldsHtml = form.fields.map(f => {
    let input = '';
    if (f.type === 'textarea') {
      input = `<textarea name="${f.id}" placeholder="${f.placeholder||''}" ${f.required ? 'required' : ''}></textarea>`;
    } else if (f.type === 'select') {
      const opts = (f.options || []).map(o =>
        `<option value="${o.value}" ${o.value === f.defaultValue ? 'selected' : ''}>${o.label}</option>`
      ).join('');
      const placeholderOpt = f.defaultValue ? '' : '<option value="">— bitte wählen —</option>';
      input = `<select name="${f.id}" ${f.required ? 'required' : ''}>${placeholderOpt}${opts}</select>`;
    } /*else {
      input = `<input type="${f.type}" name="${f.id}"
        placeholder="${f.placeholder||''}"
        ${f.min !== undefined ? `min="${f.min}"` : ''}
        ${f.step ? `step="${f.step}"` : ''}
        ${f.required ? 'required' : ''}>`;
    }*/
    else {
      input = `<input type="${f.type}" name="${f.id}"
        placeholder="${f.placeholder||''}"
        value="${f.defaultValue !== undefined ? f.defaultValue : ''}"
        ${f.min !== undefined ? `min="${f.min}"` : ''}
        ${f.step ? `step="${f.step}"` : ''}
        ${f.readOnly ? 'readonly' : ''}
        ${f.required ? 'required' : ''}>`;
    }
    return `<div class="form-group"><label>${f.label}${f.required ? ' *' : ''}</label>${input}</div>`;
  }).join('');

  const body = render('workflow-form', {
    icon:          wf.icon,
    name:          wf.name,
    description:   wf.description,
    hasError:      !!error,
    errorMessage:  error ? decodeURIComponent(error) : '',
    hasHint:       !!form.hint,
    hint:          form.hint || '',
    actionUrl:     `/workflow/${wf.id}`,
    fields:        fieldsHtml,
    submitLabel:   wf.submitLabel || 'Antrag einreichen',
  });

  return page(wf.name, body, user);
}

function renderInstance(user, instance, wf) {
  const statusLabel = { running: 'In Bearbeitung', approved: 'Genehmigt', rejected: 'Abgelehnt' };
  const statusClass = { running: 'status-running', approved: 'status-approved', rejected: 'status-rejected' };

  const currentStep = wf?.steps.find(s => s.id === instance.currentStep);
  const canDecide = currentStep?.type === 'approval'
    && (instance.manager === user.username || ['hr','it','facility','admin'].includes(user.role))
    && instance.status === 'running';

  const dataRows = Object.entries(instance.formData)
    .filter(([k]) => !k.startsWith('_') && k !== 'raw_text')
    .map(([k, v]) => `<tr><td>${k}</td><td>${v || '–'}</td></tr>`)
    .join('');

  const actionClass = { approve: 'tl-action-approve', reject: 'tl-action-reject', submitted: 'tl-action-submit' };
  const actionLabel = { approve: 'Genehmigt', reject: 'Abgelehnt', submitted: 'Eingereicht',
    'condition-true': 'Bedingung erfüllt', 'condition-false': 'Bedingung nicht erfüllt',
    'all-branches-completed': 'Alle Bereiche fertig', timeout: 'Timeout', completed: 'Abgeschlossen' };

  const timeline = instance.history.map(h => `
    <div class="timeline-item">
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-actor">
          ${h.actor}
          <span class="tl-action ${actionClass[h.action] || 'tl-action-default'}">
            ${actionLabel[h.action] || h.action}
          </span>
        </div>
        ${h.note ? `<div class="tl-note">${h.note}</div>` : ''}
        <div class="tl-time">${dayjs(h.timestamp).format('DD.MM.YYYY HH:mm')}</div>
      </div>
    </div>
  `).join('');

  const body = render('instance', {
    icon:            wf?.icon || '📄',
    workflowName:    instance.workflowName,
    submitterName:   instance.submitterName,
    statusClass:     statusClass[instance.status],
    statusLabel:     statusLabel[instance.status],
    dataRows,
    timeline,
    canDecide,
    instanceId:      instance.id,
  });

  return page(wf?.name || 'Antrag', body, user);
}

module.exports = router;
