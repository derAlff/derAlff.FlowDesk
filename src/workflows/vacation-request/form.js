/**
 * Dynamisches Formular: Urlaubsantrag
 * Zeigt ein Genehmiger-Dropdown mit der kompletten Vorgesetzten-Kette
 * (direkter Manager + alle darüber, bis zum CEO).
 *
 * @param {object} user - der eingeloggte User (aus der Session)
 */
const { getManagerChain } = require('../../middleware/auth');

module.exports = function buildForm(user) {
  const chain = user ? getManagerChain(user.username) : [];

  const approverOptions = chain.map((manager, index) => ({
    value: manager.username,
    label: index === 0
      ? `${manager.name} (Ihr direkter Vorgesetzter)`
      : `${manager.name} — ${manager.department}`,
  }));

  return {
    hint: chain.length > 1
      ? 'Standardmäßig ist Ihr direkter Vorgesetzter ausgewählt. Sie können den Antrag aber auch direkt an eine höhere Ebene richten.'
      : null,
    fields: [
      { id: 'start_date', label: 'Von',                  type: 'date',     required: true },
      { id: 'end_date',   label: 'Bis',                  type: 'date',     required: true },
      { id: 'days',       label: 'Anzahl Arbeitstage',   type: 'number',   required: true, min: 1 },
      {
        id: 'approver',
        label: 'Genehmiger',
        type: 'select',
        required: true,
        options: approverOptions,
        // erste Option (direkter Vorgesetzter) ist Default
        defaultValue: approverOptions[0]?.value || '',
      },
      { id: 'note', label: 'Hinweis (optional)', type: 'textarea', required: false },
    ],
  };
};
