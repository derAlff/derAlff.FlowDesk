/**
 * FlowDesk Workflow Engine v2
 *
 * Unterstützt:
 *   - Sequentielle Steps       (form, approval, action)
 *   - Parallele Steps          (parallel — alle Branches müssen abgeschlossen sein)
 *   - Bedingte Verzweigungen   (condition — wertet Formdata aus)
 *   - Timeouts & Eskalation    (timeout auf approval-Steps)
 *   - Externe Trigger          (webhook, timer — registriert Events)
 *
 * Workflow-Interface (definition.json + actions.js):
 *   definition.id, name, icon, description, roles, form, steps, triggers?
 *   actions: { [actionName]: (instance) => { outcome, note } }
 */

const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const db    = require('../db');
const path  = require('path');
const fs    = require('fs');

// ─── Workflows laden ──────────────────────────────────────────────────────────
const WORKFLOWS = {};
const workflowDir = path.join(__dirname, '../workflows');

fs.readdirSync(workflowDir).forEach(name => {
  const dir = path.join(workflowDir, name);
  if (!fs.statSync(dir).isDirectory()) return;

  const defFile     = path.join(dir, 'definition.json');
  const actionsFile = path.join(dir, 'actions.js');
  const formFile    = path.join(dir, 'form.js');
  if (!fs.existsSync(defFile)) return;

  const definition = JSON.parse(fs.readFileSync(defFile, 'utf8'));
  const actions    = fs.existsSync(actionsFile) ? require(actionsFile) : {};
  if (fs.existsSync(formFile)) definition.form = require(formFile)();

  WORKFLOWS[definition.id] = { ...definition, actions };
});

// ─── Trigger-Registry ─────────────────────────────────────────────────────────
// { eventName: [ { workflowId, stepId } ] }
const TRIGGER_REGISTRY = {};

Object.values(WORKFLOWS).forEach(wf => {
  (wf.triggers || []).forEach(t => {
    if (!TRIGGER_REGISTRY[t.event]) TRIGGER_REGISTRY[t.event] = [];
    TRIGGER_REGISTRY[t.event].push({ workflowId: wf.id, trigger: t });
  });
});

// ─── Timeout-Scheduler ───────────────────────────────────────────────────────
// Prüft alle 60 Sekunden ob Approvals abgelaufen sind
let _timeoutInterval = null;

function startTimeoutScheduler() {
  if (_timeoutInterval) return;
  _timeoutInterval = setInterval(() => {
    engine._checkTimeouts();
  }, 60 * 1000);
  console.log('[Engine] Timeout-Scheduler gestartet (Intervall: 60s)');
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function evalCondition(condition, formData) {
  // Einfacher Condition-Evaluator für Formdata-Felder
  // Unterstützt: >, <, >=, <=, ==, !=, includes
  // Beispiele: "amount > 10000", "department == IT", "role includes manager"
  try {
    const safeData = { ...formData };
    // Numerische Felder automatisch casten
    Object.keys(safeData).forEach(k => {
      if (!isNaN(safeData[k])) safeData[k] = parseFloat(safeData[k]);
    });
    // Condition in sichere Funktion wrappen
    const fn = new Function(...Object.keys(safeData),
      `"use strict"; return (${condition});`
    );
    return fn(...Object.values(safeData));
  } catch (e) {
    console.warn(`[Engine] Condition-Fehler: "${condition}" →`, e.message);
    return false;
  }
}

function logHistory(instance, stepId, actor, action, note = '') {
  instance.history.push({
    step: stepId,
    actor,
    action,
    timestamp: dayjs().toISOString(),
    note,
  });
}

// ─── Engine ───────────────────────────────────────────────────────────────────
const engine = {

  // ── Public API ──────────────────────────────────────────────────────────────

  getAvailableWorkflows(role) {
    return Object.values(WORKFLOWS).filter(wf =>
      wf.roles.includes(role) || wf.roles.includes('*')
    );
  },

  start(workflowId, submitter, formData) {
    const wf = WORKFLOWS[workflowId];
    if (!wf) throw new Error(`Workflow "${workflowId}" nicht gefunden`);

    const firstStep = wf.steps[0];
    const instance = {
      id:            uuidv4(),
      workflowId,
      workflowName:  wf.name,
      submitter:     submitter.username,
      submitterName: submitter.name,
      department:    submitter.department,
      manager:       submitter.manager,
      currentStep:   firstStep.id,
      // Parallele Steps: trackt welche Branches fertig sind
      parallelState: {},
      status:        'running',
      formData,
      history:       [],
      createdAt:     dayjs().toISOString(),
      updatedAt:     dayjs().toISOString(),
    };

    logHistory(instance, firstStep.id, submitter.username, 'submitted');
    db.insert('instances', instance);

    // Form-Step: sofort den nächsten Step ausführen (auto-advance)
    if (firstStep.type === 'form' && firstStep.onApprove) {
      const nextStep = wf.steps.find(s => s.id === firstStep.onApprove);
      if (nextStep) {
        instance.currentStep = nextStep.id;
        this._executeStep(wf, instance, nextStep);
      }
    } else {
      this._executeStep(wf, instance, firstStep);
    }

    db.update('instances', { id: instance.id }, instance);
    return instance;
  },

  // Manuelle Entscheidung (approve/reject) für approval-Steps
  decide(instanceId, actor, action, note = '') {
    const instance = db.findOne('instances', { id: instanceId });
    if (!instance) throw new Error('Instanz nicht gefunden');
    if (instance.status !== 'running') throw new Error('Instanz ist nicht aktiv');

    const wf          = WORKFLOWS[instance.workflowId];
    const currentStep = wf.steps.find(s => s.id === instance.currentStep);
    if (!currentStep) throw new Error('Schritt nicht gefunden');
    if (currentStep.type !== 'approval') throw new Error('Aktueller Schritt erwartet keine Entscheidung');

    logHistory(instance, currentStep.id, actor.username, action, note);

    const nextStepId = action === 'approve' ? currentStep.onApprove : currentStep.onReject;
    this._advance(wf, instance, nextStepId, action);

    instance.updatedAt = dayjs().toISOString();
    db.update('instances', { id: instanceId }, instance);
    return instance;
  },

  // Parallel-Branch abschließen (z.B. IT meldet fertig)
  completeBranch(instanceId, branchStepId, actor, note = '') {
    const instance = db.findOne('instances', { id: instanceId });
    if (!instance) throw new Error('Instanz nicht gefunden');

    const wf          = WORKFLOWS[instance.workflowId];
    const parentStep  = wf.steps.find(s =>
      s.type === 'parallel' && s.branches.includes(branchStepId)
    );
    if (!parentStep) throw new Error(`Branch "${branchStepId}" keinem parallel-Step zugeordnet`);
    if (instance.currentStep !== parentStep.id) throw new Error('Parallel-Step ist nicht aktiv');

    // Branch als fertig markieren
    if (!instance.parallelState[parentStep.id]) instance.parallelState[parentStep.id] = {};
    instance.parallelState[parentStep.id][branchStepId] = 'done';

    logHistory(instance, branchStepId, actor.username, 'completed', note);

    // Alle Branches fertig?
    const allDone = parentStep.branches.every(
      b => instance.parallelState[parentStep.id][b] === 'done'
    );

    if (allDone) {
      logHistory(instance, parentStep.id, 'system', 'all-branches-completed');
      this._advance(wf, instance, parentStep.onAllApproved, 'approve');
    }

    instance.updatedAt = dayjs().toISOString();
    db.update('instances', { id: instanceId }, instance);
    return instance;
  },

  // Externen Event feuern (Webhook, Timer, etc.)
  fireEvent(eventName, payload = {}) {
    const listeners = TRIGGER_REGISTRY[eventName] || [];
    if (!listeners.length) {
      console.log(`[Engine] Event "${eventName}" — keine Listener`);
      return [];
    }

    const started = [];
    listeners.forEach(({ workflowId, trigger }) => {
      console.log(`[Engine] Event "${eventName}" → startet Workflow "${workflowId}"`);
      const submitter = trigger.submitter || { username: 'system', name: 'System', department: '', manager: null };
      const instance  = this.start(workflowId, submitter, { ...payload, _trigger: eventName });
      started.push(instance);
    });
    return started;
  },

  // ── Intern ──────────────────────────────────────────────────────────────────

  _executeStep(wf, instance, step) {
    switch (step.type) {

      case 'form':
        // Wartet auf User-Input — nichts tun
        break;

      case 'action':
        this._runAction(wf, instance, step);
        break;

      case 'approval':
        // Timeout setzen falls definiert
        if (step.timeout) {
          const expireAt = dayjs().add(
            step.timeout.hours  || 0, 'hour'
          ).add(
            step.timeout.minutes || 0, 'minute'
          ).toISOString();
          instance._timeouts = instance._timeouts || {};
          instance._timeouts[step.id] = {
            expireAt,
            onExpire: step.timeout.onExpire,
          };
          console.log(`[Engine] Timeout gesetzt für Step "${step.id}": ${expireAt}`);
        }
        // Wartet auf decide() — nichts tun
        break;

      case 'condition':
        const result = evalCondition(step.condition, instance.formData);
        console.log(`[Engine] Condition "${step.condition}" → ${result}`);
        logHistory(instance, step.id, 'system', result ? 'condition-true' : 'condition-false',
          `Bedingung: ${step.condition}`);
        this._advance(wf, instance, result ? step.onTrue : step.onFalse, result ? 'approve' : 'reject');
        break;

      case 'parallel':
        // Alle Branches gleichzeitig aktivieren
        instance.parallelState[step.id] = {};
        step.branches.forEach(branchId => {
          instance.parallelState[step.id][branchId] = 'pending';
        });
        logHistory(instance, step.id, 'system', 'parallel-started',
          `Branches: ${step.branches.join(', ')}`);
        // Action-Branches sofort ausführen
        step.branches.forEach(branchId => {
          const branchStep = wf.steps.find(s => s.id === branchId);
          if (branchStep && branchStep.type === 'action') {
            this._runAction(wf, instance, branchStep);
            instance.parallelState[step.id][branchId] = 'done';
          }
        });
        // Prüfen ob alle sofort fertig waren (nur action-branches)
        const allImmediate = step.branches.every(
          b => instance.parallelState[step.id][b] === 'done'
        );
        if (allImmediate && instance.currentStep === step.id) {
          this._advance(wf, instance, step.onAllApproved, 'approve');
        }
        break;

      default:
        console.warn(`[Engine] Unbekannter Step-Typ: "${step.type}"`);
    }
  },

  _runAction(wf, instance, step) {
    const actionFn = wf.actions?.[step.action];
    if (!actionFn) {
      console.warn(`[Engine] Keine Action "${step.action}" in Workflow "${wf.id}"`);
      return;
    }
    const result  = actionFn(instance, step);
    const outcome = typeof result === 'object' ? result.outcome : result;
    const note    = typeof result === 'object' ? (result.note || '') : '';

    logHistory(instance, step.id, 'system', outcome, note);
    this._advance(wf, instance, outcome === 'approve' ? step.onApprove : step.onReject, outcome);
  },

  _advance(wf, instance, nextStepId, outcome) {
    if (!nextStepId || nextStepId === 'done') {
      instance.status      = outcome === 'approve' ? 'approved' : 'rejected';
      instance.currentStep = 'done';
      console.log(`[Engine] Instanz ${instance.id} abgeschlossen: ${instance.status}`);
      return;
    }
    instance.currentStep = nextStepId;
    const nextStep = wf.steps.find(s => s.id === nextStepId);
    if (nextStep) this._executeStep(wf, instance, nextStep);
  },

  // Timeout-Check — wird vom Scheduler aufgerufen
  _checkTimeouts() {
    const now      = dayjs();
    const running  = db.all('instances').filter(i => i.status === 'running' && i._timeouts);

    running.forEach(instance => {
      const timeoutInfo = instance._timeouts?.[instance.currentStep];
      if (!timeoutInfo) return;

      if (now.isAfter(dayjs(timeoutInfo.expireAt))) {
        const wf = WORKFLOWS[instance.workflowId];
        console.log(`[Engine] Timeout! Instanz ${instance.id}, Step "${instance.currentStep}" → "${timeoutInfo.onExpire}"`);
        logHistory(instance, instance.currentStep, 'system', 'timeout',
          `Timeout nach ${dayjs(timeoutInfo.expireAt).diff(dayjs(instance.createdAt), 'hour')}h`);
        delete instance._timeouts[instance.currentStep];
        this._advance(wf, instance, timeoutInfo.onExpire, 'reject');
        instance.updatedAt = dayjs().toISOString();
        db.update('instances', { id: instance.id }, instance);
      }
    });
  },

  // ── Getter ──────────────────────────────────────────────────────────────────

  getInstancesForUser(user) {
    const all = db.all('instances');
    if (user.role === 'admin') return all;
    return all.filter(i =>
      i.submitter === user.username ||
      (user.role === 'manager'  && i.manager === user.username) ||
      (['hr', 'it', 'facility'].includes(user.role) && this._isResponsible(user, i))
    );
  },

  _isResponsible(user, instance) {
    const wf          = WORKFLOWS[instance.workflowId];
    const currentStep = wf?.steps.find(s => s.id === instance.currentStep);
    return currentStep?.actor === user.role;
  },

  getPendingForUser(user) {
    return db.all('instances').filter(i => {
      if (i.status !== 'running') return false;
      const wf          = WORKFLOWS[instance.workflowId];
      const currentStep = wf?.steps.find(s => s.id === i.currentStep);
      if (!currentStep) return false;
      if (currentStep.type === 'approval') {
        if (currentStep.actor === 'manager')  return user.role === 'manager'  && i.manager === user.username;
        if (currentStep.actor === 'hr')       return user.role === 'hr'       || user.role === 'admin';
        if (currentStep.actor === 'it')       return user.role === 'it'       || user.role === 'admin';
        if (currentStep.actor === 'facility') return user.role === 'facility' || user.role === 'admin';
      }
      if (currentStep.type === 'parallel') {
        return currentStep.branches.some(b => {
          const branch = wf.steps.find(s => s.id === b);
          return branch?.actor === user.role && i.parallelState?.[currentStep.id]?.[b] === 'pending';
        });
      }
      return false;
    });
  },

  getInstance(id)      { return db.findOne('instances', { id }); },
  getWorkflow(id)      { return WORKFLOWS[id]; },
  getAllWorkflows()     { return WORKFLOWS; },
  getTriggerRegistry() { return TRIGGER_REGISTRY; },
  startTimeoutScheduler,
};

module.exports = engine;
