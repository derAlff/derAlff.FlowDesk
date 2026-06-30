/**
 * Actions: Urlaubsantrag
 * Jede Funktion bekommt (instance) und gibt { outcome, note } zurück.
 */
module.exports = {

  'notify-manager'(instance) {
    console.log(`[Urlaubsantrag] E-Mail → Manager ${instance.manager}: Antrag von ${instance.submitterName}`);
    // TODO: nodemailer
    return { outcome: 'approve', note: `Manager ${instance.manager} benachrichtigt` };
  },

  'notify-approved'(instance) {
    console.log(`[Urlaubsantrag] E-Mail → ${instance.submitter}: Urlaub genehmigt`);
    return { outcome: 'approve', note: `${instance.submitterName} über Genehmigung informiert` };
  },

  'notify-rejected'(instance) {
    console.log(`[Urlaubsantrag] E-Mail → ${instance.submitter}: Urlaub abgelehnt`);
    return { outcome: 'approve', note: `${instance.submitterName} über Ablehnung informiert` };
  },

};
