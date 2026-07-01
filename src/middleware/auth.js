/**
 * Auth Middleware
 * - LDAP/AD in production (set LDAP_URL in .env)
 * - Mock users for development
 */
const ldap = require('ldapjs');

// Mock users for development (replace with real AD groups)
//
// Hierarchie:
//   Peter (CEO)
//     └─ Markus (Bereichsleiter)
//          ├─ Michael  (Manager Einkauf)   ─ Lukas, Sandra
//          ├─ Klaus    (Manager Werkstatt) ─ Tom, Jonas, Erik
//          ├─ Paula    (Manager HR)        ─ Nina, Sophie
//          └─ Chris    (Manager IT)        ─ Tarek, Lea
//
const MOCK_USERS = [
  // ── Geschäftsführung ──────────────────────────────────────────────────────
  { username: 'peter',    password: 'test', name: 'Peter Hoffmann',  email: 'p.hoffmann@firma.lu', role: 'manager',  department: 'Geschäftsführung', manager: null     },
  { username: 'markus',   password: 'test', name: 'Markus Reiter',   email: 'm.reiter@firma.lu',   role: 'manager',  department: 'Bereichsführung', manager: 'peter'  },

  // ── Einkauf ───────────────────────────────────────────────────────────────
  { username: 'michael',  password: 'test', name: 'Michael Berg',    email: 'm.berg@firma.lu',     role: 'manager',  department: 'Einkauf',   manager: 'markus' },
  { username: 'lukas',    password: 'test', name: 'Lukas Vogt',      email: 'l.vogt@firma.lu',     role: 'employee', department: 'Einkauf',   manager: 'michael' },
  { username: 'sandra',   password: 'test', name: 'Sandra Keller',   email: 's.keller@firma.lu',   role: 'employee', department: 'Einkauf',   manager: 'michael' },

  // ── Werkstatt ─────────────────────────────────────────────────────────────
  { username: 'klaus',    password: 'test', name: 'Klaus Wagner',    email: 'k.wagner@firma.lu',   role: 'manager',  department: 'Werkstatt', manager: 'markus' },
  { username: 'tom',      password: 'test', name: 'Tom Lindner',     email: 't.lindner@firma.lu',  role: 'employee', department: 'Werkstatt', manager: 'klaus' },
  { username: 'jonas',    password: 'test', name: 'Jonas Brandt',    email: 'j.brandt@firma.lu',   role: 'employee', department: 'Werkstatt', manager: 'klaus' },
  { username: 'erik',     password: 'test', name: 'Erik Schuster',   email: 'e.schuster@firma.lu', role: 'employee', department: 'Werkstatt', manager: 'klaus' },

  // ── HR ────────────────────────────────────────────────────────────────────
  { username: 'paula',    password: 'test', name: 'Paula Hartmann',  email: 'p.hartmann@firma.lu', role: 'hr',       department: 'HR',       manager: 'markus' },
  { username: 'nina',     password: 'test', name: 'Nina Krause',     email: 'n.krause@firma.lu',   role: 'employee', department: 'HR',       manager: 'paula' },
  { username: 'sophie',   password: 'test', name: 'Sophie Albrecht', email: 's.albrecht@firma.lu', role: 'employee', department: 'HR',       manager: 'paula' },

  // ── IT ────────────────────────────────────────────────────────────────────
  { username: 'chris',    password: 'test', name: 'Chris Mertens',   email: 'c.mertens@firma.lu',  role: 'it',       department: 'IT',       manager: 'markus' },
  { username: 'tarek',    password: 'test', name: 'Tarek Younis',    email: 't.younis@firma.lu',   role: 'employee', department: 'IT',       manager: 'chris' },
  { username: 'lea',      password: 'test', name: 'Lea Sommer',      email: 'l.sommer@firma.lu',   role: 'employee', department: 'IT',       manager: 'chris' },

  // ── Sonstiges (bestehend, für Facility/Demo-Workflows) ──────────────────────
  { username: 'frank',    password: 'test', name: 'Frank Neumann',   email: 'f.neumann@firma.lu',  role: 'facility', department: 'Facility', manager: 'markus' },
  { username: 'admin',    password: 'test', name: 'Admin User',      email: 'admin@firma.lu',      role: 'admin',    department: 'IT',       manager: null     },
];

/**
 * Findet einen User per Username (Mock — bei LDAP müsste das per Suche laufen)
 */
function getUserByUsername(username) {
  const u = MOCK_USERS.find(u => u.username === username);
  if (!u) return null;
  return { username: u.username, name: u.name, email: u.email, role: u.role, department: u.department, manager: u.manager };
}

/**
 * Liefert die komplette Vorgesetzten-Kette nach oben, bis zum CEO
 * z.B. für lukas: [ michael, markus, peter ]
 */
function getManagerChain(username) {
  const chain = [];
  let current = getUserByUsername(username);
  const seen = new Set();

  while (current && current.manager && !seen.has(current.manager)) {
    seen.add(current.manager);
    const managerUser = getUserByUsername(current.manager);
    if (!managerUser) break;
    chain.push(managerUser);
    current = managerUser;
  }

  return chain;
}

async function authenticateUser(username, password) {
  const ldapUrl = process.env.LDAP_URL;

  if (ldapUrl) {
    return await authenticateLDAP(username, password, ldapUrl);
  } else {
    // Mock auth for development
    const user = MOCK_USERS.find(u => u.username === username && u.password === password);
    if (!user) return null;
    return {
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      manager: user.manager,
    };
  }
}

async function authenticateLDAP(username, password, ldapUrl) {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({ url: ldapUrl });
    const bindDN = `${process.env.LDAP_BIND_PREFIX || 'uid='}${username},${process.env.LDAP_BASE_DN}`;

    client.bind(bindDN, password, (err) => {
      if (err) {
        client.destroy();
        return resolve(null);
      }

      // Search for user attributes + group membership
      const opts = {
        filter: `(uid=${username})`,
        scope: 'sub',
        attributes: ['cn', 'mail', 'memberOf', 'department', 'manager'],
      };

      client.search(process.env.LDAP_BASE_DN, opts, (err, res) => {
        let userEntry = null;

        res.on('searchEntry', (entry) => {
          const attrs = entry.object;
          const groups = Array.isArray(attrs.memberOf) ? attrs.memberOf : [attrs.memberOf];

          // Map AD groups to roles
          let role = 'employee';
          if (groups.some(g => g && g.includes(process.env.LDAP_ADMIN_GROUP || 'Admins'))) role = 'admin';
          else if (groups.some(g => g && g.includes(process.env.LDAP_MANAGER_GROUP || 'Managers'))) role = 'manager';

          userEntry = {
            username,
            name: attrs.cn,
            email: attrs.mail,
            role,
            department: attrs.department || '',
            manager: attrs.manager || null,
          };
        });

        res.on('end', () => {
          client.destroy();
          resolve(userEntry);
        });

        res.on('error', (err) => {
          client.destroy();
          resolve(null);
        });
      });
    });
  });
}

// Middleware: require login
function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.redirect('/login');
  }
  next();
}

// Middleware: require specific role
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).send('Zugriff verweigert');
    }
    next();
  };
}

module.exports = { authenticateUser, requireAuth, requireRole, getManagerChain, getUserByUsername };
