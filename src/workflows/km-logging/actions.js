/**
 * Actions: Kilometerstand erfassen
 */
module.exports = {

  'notify-complete'(instance) {
    const { kennzeichen, km_stand } = instance.formData;
    console.log(`[Kilometerstand] Erfasst von ${instance.submitterName}: Kennzeichen ${kennzeichen}, Stand ${km_stand} km`);
    // TODO: nodemailer
    return { outcome: 'approve', note: `Kilometerstand für ${kennzeichen} erfasst (${km_stand} km)` };
  },

  'notify-rejected'(instance) {
    const { kennzeichen } = instance.formData;
    console.log(`[Kilometerstand] Abgelehnt: Kennzeichen ${kennzeichen}, gemeldet von ${instance.submitterName}`);
    return { outcome: 'approve', note: `Kilometerstand für ${kennzeichen} wurde abgelehnt` };
  },

};