/**
 * IMAP-Poller
 *
 * Verbindet sich mit einem Postfach (z.B. bewerbungen@firma.de),
 * holt ungelesene E-Mails und leitet sie an den EmailTrigger weiter.
 *
 * Konfiguration via .env:
 *   IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS
 *   IMAP_MAILBOX   (default: INBOX)
 *   IMAP_INTERVAL  (Sekunden, default: 60)
 *   IMAP_TLS       (true/false, default: true)
 */
const { ImapFlow } = require('imapflow');
const { handleIncomingEmail } = require('./emailTrigger');

let _poller = null;

async function pollOnce() {
  const client = new ImapFlow({
    host:   process.env.IMAP_HOST,
    port:   parseInt(process.env.IMAP_PORT || '993'),
    secure: process.env.IMAP_TLS !== 'false',
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
    logger: false,
  });

  try {
    await client.connect();

    const mailbox = process.env.IMAP_MAILBOX || 'INBOX';
    await client.mailboxOpen(mailbox);

    // Nur ungelesene E-Mails holen
    const messages = [];
    for await (const msg of client.fetch({ seen: false }, {
      envelope: true,
      bodyStructure: true,
      source: true,
    })) {
      messages.push(msg);
    }

    if (messages.length === 0) {
      console.log(`[IMAP] Keine neuen E-Mails in ${mailbox}`);
    } else {
      console.log(`[IMAP] ${messages.length} neue E-Mail(s) gefunden`);
    }

    for (const msg of messages) {
      const envelope = msg.envelope;
      const from     = envelope.from?.[0]?.address || '';
      const fromName = envelope.from?.[0]?.name    || '';
      const subject  = envelope.subject            || '';

      // Body aus Source parsen (plain text extrahieren)
      const raw    = msg.source.toString('utf8');
      const body   = extractPlainText(raw);

      console.log(`[IMAP] Verarbeite: "${subject}" von ${fromName || from}`);

      // An EmailTrigger übergeben
      handleIncomingEmail({ from, fromName, subject, body });

      // Als gelesen markieren
      await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen']);
    }

    await client.logout();

  } catch (err) {
    console.error('[IMAP] Fehler:', err.message);
    try { await client.logout(); } catch (_) {}
  }
}

/**
 * Extrahiert Plain-Text aus einer rohen E-Mail
 * Entfernt Header, HTML-Tags und Base64-Blöcke
 */
function extractPlainText(raw) {
  // Header abtrennen (alles nach erstem Leerzeile)
  const bodyStart = raw.indexOf('\r\n\r\n');
  let body = bodyStart !== -1 ? raw.slice(bodyStart + 4) : raw;

  // Base64-Blöcke entfernen
  body = body.replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '');

  // HTML-Tags entfernen
  body = body.replace(/<[^>]+>/g, ' ');

  // MIME-Boundaries entfernen
  body = body.replace(/--[^\n]+/g, '');

  // Content-Type Header-Zeilen entfernen
  body = body.replace(/Content-[^\n]+\n/gi, '');

  // Mehrfache Leerzeilen zusammenfassen
  body = body.replace(/\n{3,}/g, '\n\n');

  return body.trim();
}

/**
 * Startet den IMAP-Poller als Intervall
 */
function startImapPoller() {
  if (!process.env.IMAP_HOST) {
    console.log('[IMAP] Kein IMAP_HOST konfiguriert — Poller deaktiviert');
    console.log('[IMAP] Zum Aktivieren: IMAP_HOST, IMAP_USER, IMAP_PASS in .env setzen');
    return;
  }

  const interval = parseInt(process.env.IMAP_INTERVAL || '60') * 1000;
  console.log(`[IMAP] Poller gestartet → ${process.env.IMAP_USER} (Intervall: ${interval / 1000}s)`);

  // Sofort einmal laufen
  pollOnce();

  // Dann im Intervall
  _poller = setInterval(pollOnce, interval);
}

function stopImapPoller() {
  if (_poller) {
    clearInterval(_poller);
    _poller = null;
    console.log('[IMAP] Poller gestoppt');
  }
}

// Auch manuell aufrufbar (z.B. per API-Endpunkt)
module.exports = { startImapPoller, stopImapPoller, pollOnce };
