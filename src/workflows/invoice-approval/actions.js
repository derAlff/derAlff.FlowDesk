const bizDb = require('../../mockBusinessDb');

module.exports = {

  'check-invoice'(instance) {
    const { supplier, amount, cost_center } = instance.formData;
    const checks = [];
    let pass = true;

    const supplierRecord = bizDb.findSupplier(supplier);
    if (!supplierRecord) {
      checks.push(`❌ Lieferant "${supplier}" nicht in der Datenbank`);
      pass = false;
    } else if (!supplierRecord.approved) {
      checks.push(`❌ Lieferant "${supplierRecord.name}" nicht freigegeben`);
      pass = false;
    } else if (parseFloat(amount) > supplierRecord.maxInvoiceAmount) {
      checks.push(`❌ Betrag überschreitet Limit (max. ${supplierRecord.maxInvoiceAmount}€)`);
      pass = false;
    } else {
      checks.push(`✅ Lieferant "${supplierRecord.name}" freigegeben`);
    }

    const cc = bizDb.findCostCenter(cost_center);
    if (!cc) {
      checks.push(`❌ Kostenstelle "${cost_center}" nicht gefunden`);
      pass = false;
    } else {
      const available = cc.budgetTotal - cc.budgetUsed;
      if (parseFloat(amount) > available) {
        checks.push(`❌ Budget erschöpft — verfügbar: ${available}€`);
        pass = false;
      } else {
        checks.push(`✅ Budget ok — verfügbar: ${available}€`);
      }
    }

    console.log(`[Rechnung] DB-Prüfung: ${pass ? 'BESTANDEN' : 'FEHLGESCHLAGEN'}`);
    return { outcome: pass ? 'approve' : 'reject', note: checks.join('\n') };
  },

  'notify-auto-rejected'(instance) {
    const reason = instance.history.find(h => h.step === 'check-invoice')?.note || '';
    console.log(`[Rechnung] Automatisch abgelehnt → ${instance.submitter}`);
    return { outcome: 'reject', note: `Automatisch abgelehnt:\n${reason}` };
  },

  // Betrag ≤ 10.000 → nur Manager
  'notify-manager'(instance) {
    console.log(`[Rechnung] E-Mail → Manager ${instance.manager}: Freigabe ${instance.formData.amount}€`);
    return { outcome: 'approve', note: `Manager ${instance.manager} benachrichtigt` };
  },

  // Betrag > 10.000 → Manager UND HR parallel
  'notify-manager-parallel'(instance) {
    console.log(`[Rechnung] PARALLEL: E-Mail → Manager ${instance.manager}: Großrechnung ${instance.formData.amount}€`);
    return { outcome: 'approve', note: `Manager ${instance.manager} (parallel) benachrichtigt` };
  },

  'notify-hr-parallel'(instance) {
    console.log(`[Rechnung] PARALLEL: E-Mail → HR: Großrechnung ${instance.formData.amount}€ zur Kenntnis`);
    return { outcome: 'approve', note: `HR (parallel) benachrichtigt` };
  },

  // Timeout → Eskalation
  'escalate'(instance) {
    console.log(`[Rechnung] ⚠️ ESKALATION: Manager ${instance.manager} hat nicht reagiert → Admin`);
    return { outcome: 'approve', note: `Eskaliert: Manager ${instance.manager} hat Timeout überschritten` };
  },

  'notify-approved'(instance) {
    console.log(`[Rechnung] ✅ Freigegeben → ${instance.submitter}`);
    return { outcome: 'approve', note: `${instance.submitterName} über Freigabe informiert` };
  },

  'notify-rejected'(instance) {
    console.log(`[Rechnung] ❌ Abgelehnt → ${instance.submitter}`);
    return { outcome: 'approve', note: `${instance.submitterName} über Ablehnung informiert` };
  },
};
