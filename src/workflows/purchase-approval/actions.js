/**
 * Actions: Bestellfreigabe
 */
module.exports = {

  'notify-manager'(instance) {
    console.log(`[Bestellung] E-Mail → Manager ${instance.manager}: ${instance.formData.amount}€ von ${instance.submitterName}`);
    // TODO: nodemailer
    return { outcome: 'approve', note: `Manager ${instance.manager} benachrichtigt` };
  },

  'notify-approved'(instance) {
    console.log(`[Bestellung] E-Mail → ${instance.submitter}: Bestellung freigegeben`);
    return { outcome: 'approve', note: `${instance.submitterName} über Freigabe informiert` };
  },

  'notify-rejected'(instance) {
    console.log(`[Bestellung] E-Mail → ${instance.submitter}: Bestellung abgelehnt`);
    return { outcome: 'approve', note: `${instance.submitterName} über Ablehnung informiert` };
  },

};
