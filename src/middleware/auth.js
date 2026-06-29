/**
 * Auth Middleware
 * - LDAP/AD in production (set LDAP_URL in .env)
 * - Mock users for development
 */
const ldap = require('ldapjs');

// Mock users for development (replace with real AD groups)
const MOCK_USERS = [
  { username: 'alice',    password: 'test', name: 'Alice Müller',   role: 'employee',  department: 'IT',       manager: 'bob'    },
  { username: 'bob',      password: 'test', name: 'Bob Schmidt',    role: 'manager',   department: 'IT',       manager: null     },
  { username: 'carol',    password: 'test', name: 'Carol Weber',    role: 'hr',        department: 'HR',       manager: 'dave'   },
  { username: 'dave',     password: 'test', name: 'Dave Fischer',   role: 'manager',   department: 'HR',       manager: null     },
  { username: 'ingo',     password: 'test', name: 'Ingo Braun',     role: 'it',        department: 'IT',       manager: 'bob'    },
  { username: 'frank',    password: 'test', name: 'Frank Neumann',  role: 'facility',  department: 'Facility', manager: null     },
  { username: 'admin',    password: 'test', name: 'Admin User',     role: 'admin',     department: 'IT',       manager: null     },
];

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

module.exports = { authenticateUser, requireAuth, requireRole };
