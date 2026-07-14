/** Entity metadata: label + overlap priority (higher wins). */
export const TYPES = {
  term:    { prefix: "TERM",     label: "Ihr Begriff",            priority: 140 },
  other:   { prefix: "REDACTED", label: "Manuell",                priority: 130 },
  email:   { prefix: "EMAIL",    label: "E-Mail",                 priority: 100 },
  ssn:     { prefix: "SSN",      label: "SSN / IdNr / AHV",       priority: 95 },
  iban:    { prefix: "IBAN",     label: "IBAN",                   priority: 93 },
  phone:   { prefix: "PHONE",    label: "Telefon",                priority: 90 },
  case:    { prefix: "CASE",     label: "Aktenzeichen / Case",    priority: 88 },
  date:    { prefix: "DATE",     label: "Datum (standard: aus)",  priority: 86 },
  account: { prefix: "ACCOUNT",  label: "Konto / Routing",        priority: 85 },
  money:   { prefix: "AMOUNT",   label: "Betrag",                 priority: 80 },
  address: { prefix: "ADDRESS",  label: "Adresse",                priority: 70 },
  name:    { prefix: "CLIENT",   label: "Name",                   priority: 50 },
  entity:  { prefix: "ENTITY",   label: "Name / Organisation",    priority: 45 },
  zip:     { prefix: "ZIP",      label: "PLZ / ZIP",              priority: 40 },
};

export const TOGGLEABLE = [
  "name", "entity", "ssn", "iban", "email", "phone",
  "address", "zip", "date", "account", "case", "money",
];

/** Dates stay in cleartext by default (DE/CH calendar forms inclusive). */
export const DEFAULT_ENABLED = Object.fromEntries(
  TOGGLEABLE.map((t) => [t, t !== "date"])
);
