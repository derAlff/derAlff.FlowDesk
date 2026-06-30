/**
 * Mock-Geschäftsdatenbank
 * 
 * In Produktion: echte DB-Abfragen hier rein (PostgreSQL, MSSQL etc.)
 * Einfach die Funktionen unten durch echte Queries ersetzen —
 * der Rest der App ändert sich nicht.
 */

// ─── Zugelassene Lieferanten ──────────────────────────────────────────────────
const SUPPLIERS = [
  { id: 'S001', name: 'Office Partner GmbH',    approved: true,  maxInvoiceAmount: 5000  },
  { id: 'S002', name: 'TechSupply AG',           approved: true,  maxInvoiceAmount: 20000 },
  { id: 'S003', name: 'Bürobedarf Müller',       approved: true,  maxInvoiceAmount: 1000  },
  { id: 'S004', name: 'Unbekannter Lieferant',   approved: false, maxInvoiceAmount: 0     },
  { id: 'S005', name: 'OldVendor KG',            approved: false, maxInvoiceAmount: 0     },
];

// ─── Kostenstellen & Budgets ──────────────────────────────────────────────────
const COST_CENTERS = [
  { id: 'K100', name: 'IT-Infrastruktur',    department: 'IT', budgetTotal: 50000, budgetUsed: 31000 },
  { id: 'K101', name: 'IT-Software',         department: 'IT', budgetTotal: 20000, budgetUsed: 18500 },
  { id: 'K200', name: 'HR-Allgemein',        department: 'HR', budgetTotal: 15000, budgetUsed: 4200  },
  { id: 'K300', name: 'Marketing',           department: 'MKT',budgetTotal: 30000, budgetUsed: 29800 },
  { id: 'K400', name: 'Fuhrpark',            department: 'MGT',budgetTotal: 40000, budgetUsed: 12000 },
];

// ─── API-Funktionen (hier echte DB-Queries einsetzen) ────────────────────────

/**
 * Lieferant per Name suchen (case-insensitive, Teilstring)
 * → in Prod: SELECT * FROM suppliers WHERE LOWER(name) LIKE LOWER($1)
 */
function findSupplier(name) {
  const needle = name.trim().toLowerCase();
  return SUPPLIERS.find(s =>
    s.name.toLowerCase().includes(needle) ||
    needle.includes(s.name.toLowerCase())
  ) || null;
}

/**
 * Kostenstelle per ID abrufen
 * → in Prod: SELECT * FROM cost_centers WHERE id = $1
 */
function findCostCenter(id) {
  return COST_CENTERS.find(c => c.id === id.trim().toUpperCase()) || null;
}

/**
 * Verfügbares Budget einer Kostenstelle prüfen
 */
function getAvailableBudget(costCenterId) {
  const cc = findCostCenter(costCenterId);
  if (!cc) return null;
  return cc.budgetTotal - cc.budgetUsed;
}

/**
 * Alle Kostenstellen (für Dropdown im Formular)
 */
function getAllCostCenters() {
  return COST_CENTERS.map(c => ({
    id: c.id,
    label: `${c.id} – ${c.name} (${c.department})`,
    available: c.budgetTotal - c.budgetUsed,
  }));
}

/**
 * Alle freigegebenen Lieferanten (für Hinweis im Formular)
 */
function getApprovedSuppliers() {
  return SUPPLIERS.filter(s => s.approved).map(s => s.name);
}

module.exports = {
  findSupplier,
  findCostCenter,
  getAvailableBudget,
  getAllCostCenters,
  getApprovedSuppliers,
};
