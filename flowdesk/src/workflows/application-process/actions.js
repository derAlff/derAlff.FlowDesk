/**
 * Actions: Bewerbungsprozess
 * Am Ende wird automatisch der Onboarding-Workflow gestartet.
 */
module.exports = {

  'notify-hr-new'(instance) {
    const d = instance.formData;
    console.log(`[Bewerbung] Neue Bewerbung eingegangen: ${d.applicant_name} für "${d.position}" (${d.department})`);
    console.log(`[Bewerbung] E-Mail → HR: Neue Bewerbung zur Prüfung`);
    return { outcome: 'approve', note: `HR über neue Bewerbung von ${d.applicant_name} informiert` };
  },

  'schedule-interview'(instance) {
    const d = instance.formData;
    console.log(`[Bewerbung] E-Mail → Manager ${instance.manager}: Vorstellungsgespräch mit ${d.applicant_name} einplanen`);
    console.log(`[Bewerbung] E-Mail → ${d.applicant_email}: Einladung zum Vorstellungsgespräch`);
    return { outcome: 'approve', note: `Gesprächseinladung an ${d.applicant_name} (${d.applicant_email}) versendet` };
  },

  'notify-accepted'(instance) {
    const d = instance.formData;
    console.log(`[Bewerbung] E-Mail → ${d.applicant_email}: Zusage für Position "${d.position}"`);
    console.log(`[Bewerbung] E-Mail → HR: Bewerber ${d.applicant_name} angenommen — Vertrag vorbereiten`);
    return { outcome: 'approve', note: `Zusage an ${d.applicant_name} versendet` };
  },

  'trigger-onboarding'(instance) {
    const d = instance.formData;
    console.log(`[Bewerbung] Starte Onboarding-Workflow für ${d.applicant_name}...`);

    // Onboarding-Workflow automatisch starten
    // Daten aus der Bewerbung werden übernommen
    const engine = require('../../engine');
    const onboardingInstance = engine.start('employee-onboarding', {
      username: instance.submitter,
      name:     instance.submitterName,
      department: instance.department,
      manager:  instance.manager,
    }, {
      employee_name:  d.applicant_name,
      employee_email: d.applicant_email,
      position:       d.position,
      department:     d.department,
      start_date:     d.start_date || '',
      application_id: instance.id,
    });

    console.log(`[Bewerbung] Onboarding gestartet — ID: ${onboardingInstance.id}`);
    return { outcome: 'approve', note: `Onboarding-Workflow gestartet (ID: ${onboardingInstance.id})` };
  },

  'notify-rejected'(instance) {
    const d = instance.formData;
    console.log(`[Bewerbung] E-Mail → ${d.applicant_email}: Absage`);
    console.log(`[Bewerbung] E-Mail → HR: Bewerbung ${d.applicant_name} abgeschlossen (abgelehnt)`);
    return { outcome: 'approve', note: `Absage an ${d.applicant_name} versendet` };
  },

};
