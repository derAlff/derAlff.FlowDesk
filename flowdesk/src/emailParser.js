/**
 * E-Mail Parser für Bewerbungen
 * Extrahiert strukturierte Daten aus Freitext per Regex
 * Kein KI — regelbasiert
 */

const DOCUMENT_KEYWORDS = [
  'bewerbungsschreiben', 'anschreiben',
  'lebenslauf', 'cv',
  'zeugnis', 'zeugnisse',
  'zertifikat', 'zertifikate',
  'referenz', 'referenzen',
  'lichtbild', 'foto',
  'arbeitszeugnis', 'ausbildungsnachweis',
];

const POSITION_PATTERNS = [
  /stelle als ([^\.\,\n]+)/i,
  /position als ([^\.\,\n]+)/i,
  /job als ([^\.\,\n]+)/i,
  /als ([^\.\,\n]+) bewerbe/i,
  /bewerbe mich (?:auf die|als|für die) (?:von ihnen )?(?:ausgeschriebene )?(?:stelle als )?([^\.\,\n]+)/i,
];

const NAME_PATTERNS = [
  /mein name ist ([A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+)/i,
  /ich (?:heiße|heisse) ([A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+)/i,
  /([A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+)\s*$/m,  // letzte Zeile (Signatur)
];

const AGE_PATTERNS = [
  /(\d{1,2}) jahre(?: jung| alt)?/i,
  /alter[:\s]+(\d{1,2})/i,
  /geboren.*?(\d{4})/i,  // Geburtsjahr → Alter berechnen
];

function parseApplicationEmail(rawText, senderEmail = '', senderName = '') {
  const text = rawText.trim();
  const result = {
    applicant_name:  null,
    applicant_email: senderEmail || null,
    applicant_phone: null,
    position:        null,
    age:             null,
    documents:       [],
    raw_text:        text,
    confidence:      {},
  };

  // ── Name ──────────────────────────────────────────────────────────────────
  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.applicant_name = match[1].trim();
      result.confidence.name = pattern === NAME_PATTERNS[0] ? 'high' : 'medium';
      break;
    }
  }
  // Fallback: Absendername
  if (!result.applicant_name && senderName) {
    result.applicant_name = senderName;
    result.confidence.name = 'low';
  }

  // ── Position ──────────────────────────────────────────────────────────────
  for (const pattern of POSITION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.position = match[1].trim()
        .replace(/\.$/, '')
        .replace(/\s+/g, ' ');
      result.confidence.position = 'high';
      break;
    }
  }

  // ── Alter ─────────────────────────────────────────────────────────────────
  for (const pattern of AGE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const val = parseInt(match[1]);
      // Geburtsjahr → Alter
      if (val > 1900) {
        result.age = new Date().getFullYear() - val;
      } else {
        result.age = val;
      }
      result.confidence.age = 'high';
      break;
    }
  }

  // ── Telefon ───────────────────────────────────────────────────────────────
  const phoneMatch = text.match(/(?:tel|telefon|mobil|fon)?[:\s]*(\+?[\d\s\-\/\(\)]{8,})/i);
  if (phoneMatch) {
    const cleaned = phoneMatch[1].replace(/\s+/g, ' ').trim();
    if (cleaned.replace(/\D/g, '').length >= 6) {
      result.applicant_phone = cleaned;
    }
  }

  // ── Dokumente ─────────────────────────────────────────────────────────────
  const lowerText = text.toLowerCase();
  DOCUMENT_KEYWORDS.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      // Normalisieren
      const label = {
        'bewerbungsschreiben': 'Bewerbungsschreiben',
        'anschreiben':         'Anschreiben',
        'lebenslauf':          'Lebenslauf',
        'cv':                  'Lebenslauf (CV)',
        'zeugnis':             'Zeugnis',
        'zeugnisse':           'Zeugnisse',
        'zertifikat':          'Zertifikat',
        'zertifikate':         'Zertifikate',
        'referenz':            'Referenz',
        'referenzen':          'Referenzen',
        'lichtbild':           'Lichtbild',
        'foto':                'Foto',
        'arbeitszeugnis':      'Arbeitszeugnis',
        'ausbildungsnachweis': 'Ausbildungsnachweis',
      }[keyword] || keyword;

      if (!result.documents.includes(label)) {
        result.documents.push(label);
      }
    }
  });

  return result;
}

module.exports = { parseApplicationEmail };
