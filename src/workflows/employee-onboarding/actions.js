/**
 * Actions: Mitarbeiter Onboarding
 * Jede Station bekommt klare Aufgaben mitgeteilt.
 */
module.exports = {

  'notify-it'(instance) {
    const d = instance.formData;
    console.log(`[Onboarding] E-Mail → IT: Account & Equipment für ${d.employee_name} vorbereiten`);
    console.log(`  - Firmen-E-Mail anlegen`);
    console.log(`  - AD-Account erstellen`);
    console.log(`  - Laptop / Hardware bereitstellen`);
    console.log(`  - VPN-Zugang einrichten`);
    return {
      outcome: 'approve',
      note: `IT benachrichtigt: Account, E-Mail, Hardware und VPN für ${d.employee_name} (Start: ${d.start_date})`,
    };
  },

  'notify-facility'(instance) {
    const d = instance.formData;
    console.log(`[Onboarding] E-Mail → Facility: Arbeitsplatz für ${d.employee_name} vorbereiten`);
    console.log(`  - Arbeitsplatz einrichten`);
    console.log(`  - Mitarbeiterausweis ausstellen`);
    console.log(`  - Schlüssel / Zugangskarte`);
    console.log(`  - Parkausweis (falls nötig)`);
    return {
      outcome: 'approve',
      note: `Facility benachrichtigt: Arbeitsplatz, Ausweis und Zugang für ${d.employee_name}`,
    };
  },

  'notify-manager'(instance) {
    const d = instance.formData;
    console.log(`[Onboarding] E-Mail → Manager ${instance.manager}: Einweisung für ${d.employee_name} einplanen`);
    console.log(`  - Willkommensgespräch führen`);
    console.log(`  - Team vorstellen`);
    console.log(`  - Aufgaben und Ziele besprechen`);
    return {
      outcome: 'approve',
      note: `Manager ${instance.manager} benachrichtigt: Einweisung und Willkommensgespräch für ${d.employee_name}`,
    };
  },

  'notify-complete'(instance) {
    const d = instance.formData;
    console.log(`[Onboarding] ✅ Onboarding abgeschlossen für ${d.employee_name}`);
    console.log(`[Onboarding] E-Mail → HR: Onboarding ${d.employee_name} vollständig abgeschlossen`);
    console.log(`[Onboarding] E-Mail → ${d.employee_email}: Herzlich willkommen im Team!`);
    return {
      outcome: 'approve',
      note: `Onboarding für ${d.employee_name} vollständig abgeschlossen — Willkommens-E-Mail versendet`,
    };
  },

};
