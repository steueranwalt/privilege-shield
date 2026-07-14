/** Placeholder metadata: prefix, label, overlap priority (higher wins). */
export const TYPES = {
  term:    { prefix: "TERM",     label: "Your term",          priority: 140 },
  other:   { prefix: "REDACTED", label: "Manual",             priority: 130 },
  email:   { prefix: "EMAIL",    label: "Email",              priority: 100 },
  ssn:     { prefix: "SSN",      label: "SSN / IdNr",         priority: 95 },
  iban:    { prefix: "IBAN",     label: "IBAN",               priority: 93 },
  phone:   { prefix: "PHONE",    label: "Phone",              priority: 90 },
  case:    { prefix: "CASE",     label: "Case / Aktenzeichen", priority: 88 },
  date:    { prefix: "DATE",     label: "Date",               priority: 86 },
  account: { prefix: "ACCOUNT",  label: "Account / Routing",  priority: 85 },
  money:   { prefix: "AMOUNT",   label: "Amount",             priority: 80 },
  address: { prefix: "ADDRESS",  label: "Address",            priority: 70 },
  name:    { prefix: "CLIENT",   label: "Name",               priority: 50 },
  entity:  { prefix: "ENTITY",   label: "Possible name/entity", priority: 45 },
  zip:     { prefix: "ZIP",      label: "ZIP / PLZ",          priority: 40 },
};

export const TOGGLEABLE = [
  "name", "entity", "ssn", "iban", "email", "phone",
  "address", "zip", "date", "account", "case", "money",
];

export const DEFAULT_ENABLED = Object.fromEntries(TOGGLEABLE.map((t) => [t, true]));
