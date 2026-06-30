/**
 * E-Mail Trigger Handler
 *
 * Empfängt eine eingehende E-Mail (simuliert oder via IMAP),
 * erkennt den Typ (Bewerbung, Rechnung, ...) und feuert
 * den passenden Engine-Event.
 *
 * Später: IMAP-Polling mit 'imapflow' hier einbauen.
 */
const { parseApplicationEmail } = require('./emailParser');
const engine = require('./engine');

const EMAIL_TYPES = {
  application: [
    'bewerb', 'bewerbung', 'stelle', 'position', 'lebenslauf',
    'vorstellungsgespräch', 'vorstellungsgesprach', 'kandidat',
  ],
  invoice: [
    'rechnung', 'invoice', 're-', 'zahlung', 'fälligkeit',
  ],
};

function detectEmailType(subject = '', body = '') {
  const text = (subject + ' ' + body).toLowerCase();
  for (const [type, keywords] of Object.entries(EMAIL_TYPES)) {
    if (keywords.some(k => text.includes(k))) return type;
  }
  return 'unknown';
}

/**
 * Haupt-Eingang für E-Mails
 * @param {object} email - { subject, body, from, fromName }
 * @returns {object} - { type, parsed, instances }
 */
function handleIncomingEmail(email) {
  const { subject = '', body = '', from = '', fromName = '' } = email;

  console.log(`\n[EmailTrigger] Neue E-Mail von: ${fromName || from}`);
  console.log(`[EmailTrigger] Betreff: ${subject || '(kein Betreff)'}`);

  const type = detectEmailType(subject, body);
  console.log(`[EmailTrigger] Erkannter Typ: ${type}`);

  let parsed = null;
  let instances = [];

  if (type === 'application') {
    parsed = parseApplicationEmail(body, from, fromName);

    console.log(`[EmailTrigger] Extrahierte Daten:`);
    console.log(`  Name:      ${parsed.applicant_name || '?'} (${parsed.confidence.name || '-'})`);
    console.log(`  E-Mail:    ${parsed.applicant_email || '?'}`);
    console.log(`  Telefon:   ${parsed.applicant_phone || '?'}`);
    console.log(`  Position:  ${parsed.position || '?'} (${parsed.confidence.position || '-'})`);
    console.log(`  Alter:     ${parsed.age || '?'}`);
    console.log(`  Dokumente: ${parsed.documents.join(', ') || '?'}`);

    // Engine-Event feuern
    instances = engine.fireEvent('application.received', {
      applicant_name:  parsed.applicant_name  || 'Unbekannt',
      applicant_email: parsed.applicant_email || from,
      applicant_phone: parsed.applicant_phone || '',
      position:        parsed.position        || 'Unbekannt',
      department:      '',
      start_date:      '',
      salary:          '',
      source:          'E-Mail',
      age:             parsed.age ? String(parsed.age) : '',
      documents:       parsed.documents.length
                         ? parsed.documents.join(', ')
                         : 'Siehe Anhang',
      notes:           `Automatisch aus E-Mail extrahiert.\nOriginaltext:\n${body}`,
    });

  } else if (type === 'invoice') {
    console.log(`[EmailTrigger] Rechnungs-E-Mail → manuelle Erfassung nötig`);
    // TODO: Rechnungsparser

  } else {
    console.log(`[EmailTrigger] Unbekannter Typ — keine Aktion`);
  }

  return { type, parsed, instances };
}

module.exports = { handleIncomingEmail, detectEmailType };
