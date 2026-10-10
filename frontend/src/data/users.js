// Fixed credentials for the demo only. Never reuse this pattern for real accounts.
export const DEMO_PASSWORD = "demo1234";
export const DEMO_OTP = "123456";

// Demo accounts. Officials sign in with email + DEMO_PASSWORD, citizens with phone + DEMO_OTP.
const o = (id, key, name, title, agency, zone = "*") => ({
  id, role: "officer", email: `officer.${key}@nigrani.demo`, name, title, agency, zone,
});
const n = (id, key, name, agency) => ({
  id, role: "nodal", email: `nodal.${key}@nigrani.demo`, name, title: "Nodal Officer", agency, zone: "*",
});

export const USERS = [
  { id: "u-cit-1", role: "citizen", name: "Priya Sharma", phone: "9810012345", area: "Ashok Vihar" },
  { id: "u-cit-2", role: "citizen", name: "Rahul Verma", phone: "9810067890", area: "Patparganj" },

  o("u-off-mcd", "mcd", "Anil Kumar", "Junior Engineer, Civil Lines Zone", "MCD", "Civil Lines"),
  o("u-off-mcd2", "mcd2", "Sunita Rao", "Sanitary Inspector, Shahdara South Zone", "MCD", "Shahdara South"),
  o("u-off-ndmc", "ndmc", "Mohd. Faiz", "Environment Inspector", "NDMC"),
  o("u-off-pwd", "pwd", "Kavita Joshi", "Assistant Engineer (Roads)", "PWD"),
  o("u-off-dda", "dda", "Rakesh Meena", "Horticulture Officer", "DDA"),
  o("u-off-dsiidc", "dsiidc", "Deepak Chauhan", "Industrial Area Inspector", "DSIIDC"),
  o("u-off-dcb", "dcb", "Neha Bansal", "Sanitation Officer", "DCB"),

  n("u-nod-mcd", "mcd", "Vikram Malhotra", "MCD"),
  n("u-nod-ndmc", "ndmc", "Anjali Saxena", "NDMC"),
  n("u-nod-pwd", "pwd", "S. K. Tyagi", "PWD"),
  n("u-nod-dda", "dda", "Pooja Arora", "DDA"),
  n("u-nod-dsiidc", "dsiidc", "R. P. Singh", "DSIIDC"),
  n("u-nod-dcb", "dcb", "Col. M. Iyer", "DCB"),

  {
    id: "u-admin", role: "admin", email: "admin@nigrani.demo", name: "Control Room",
    title: "DPCC / CAQM Control Room", agency: "DPCC", zone: "*",
  },
];

export const ROLE_LABEL = {
  citizen: "Citizen",
  officer: "Field officer",
  nodal: "Nodal officer",
  admin: "Control room",
};

export const userById = (id, extra = []) => [...USERS, ...extra].find((u) => u.id === id);
