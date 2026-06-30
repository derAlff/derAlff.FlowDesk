/**
 * Dynamisches Formular: Rechnungsfreigabe
 * Wird geladen wenn definition.json kein "form" enthält.
 * Hier können Felder aus der DB befüllt werden.
 */
const bizDb = require('../../mockBusinessDb');

module.exports = function buildForm() {
  const costCenters = bizDb.getAllCostCenters();
  const approvedSuppliers = bizDb.getApprovedSuppliers();

  return {
    hint: `Zugelassene Lieferanten: ${approvedSuppliers.join(', ')}`,
    fields: [
      { id: 'invoice_number', label: 'Rechnungsnummer', type: 'text',   required: true,  placeholder: 'z.B. RE-2024-00123' },
      { id: 'supplier',       label: 'Lieferant',       type: 'text',   required: true  },
      { id: 'amount',         label: 'Betrag (€)',       type: 'number', required: true,  min: 0.01, step: '0.01' },
      {
        id: 'cost_center',
        label: 'Kostenstelle',
        type: 'select',
        required: true,
        options: costCenters.map(cc => ({
          value: cc.id,
          label: `${cc.label} — verfügbar: ${cc.available.toLocaleString('de-DE')}€`,
        })),
      },
      { id: 'description', label: 'Verwendungszweck', type: 'textarea', required: true },
    ],
  };
};
