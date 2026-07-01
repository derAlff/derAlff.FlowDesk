/**
 * Dynamisches Formular: Kilometerstand erfassen
 * Name/E-Mail werden aus dem eingeloggten User vorbefüllt.
 */
module.exports = function buildForm(user) {
  return {
    fields: [
      { id: 'employee_name',  label: 'Name',            type: 'text',   required: true, defaultValue: user?.name  || '', readOnly: true },
      { id: 'employee_email', label: 'E-Mail',          type: 'text',   required: true, defaultValue: user?.email || '', readOnly: true },
      { id: 'kennzeichen',    label: 'Kennzeichen',     type: 'text',   required: true },
      { id: 'km_stand',       label: 'Kilometerstand',  type: 'number', required: true, min: 0 },
    ],
  };
};