// Illustrative reference data for the demo. Jurisdictions, zones, schools and AQI values are
// simulated placeholders, not authoritative government records.

export const AGENCIES = {
  MCD: { id: "MCD", name: "Municipal Corporation of Delhi", short: "MCD" },
  NDMC: { id: "NDMC", name: "New Delhi Municipal Council", short: "NDMC" },
  PWD: { id: "PWD", name: "Public Works Department", short: "PWD" },
  DDA: { id: "DDA", name: "Delhi Development Authority", short: "DDA" },
  DSIIDC: { id: "DSIIDC", name: "Delhi State Industrial & Infrastructure Development Corp.", short: "DSIIDC" },
  DCB: { id: "DCB", name: "Delhi Cantonment Board", short: "Cantt. Board" },
  DPCC: { id: "DPCC", name: "Delhi Pollution Control Committee", short: "DPCC" },
};

// Agencies that receive field complaints (DPCC is the escalation apex, not a first responder).
export const FIELD_AGENCIES = ["MCD", "NDMC", "PWD", "DDA", "DSIIDC", "DCB"];

const p = (id, name, lat, lon, agency, zone, aqi, kind = "residential") => ({
  id, name, lat, lon, agency, zone, aqi, kind,
});

export const PLACES = [
  p("ashok-vihar", "Ashok Vihar", 28.695, 77.1695, "MCD", "Civil Lines", 156),
  p("model-town", "Model Town", 28.715, 77.19, "MCD", "Civil Lines", 161),
  p("timarpur", "Timarpur", 28.705, 77.206, "MCD", "Civil Lines", 149),
  p("karol-bagh", "Karol Bagh", 28.6519, 77.1909, "MCD", "Karol Bagh", 172),
  p("rohini-s7", "Rohini Sector 7", 28.7165, 77.113, "MCD", "Rohini", 198),
  p("bhalswa", "Bhalswa Landfill", 28.743, 77.165, "MCD", "Rohini", 236, "landfill"),
  p("narela", "Narela", 28.8527, 77.0929, "MCD", "Narela", 214),
  p("shahdara", "Shahdara", 28.673, 77.289, "MCD", "Shahdara North", 183),
  p("dilshad", "Dilshad Garden", 28.682, 77.321, "MCD", "Shahdara North", 176),
  p("anand-vihar", "Anand Vihar", 28.6469, 77.3158, "MCD", "Shahdara South", 129),
  p("patparganj", "Patparganj", 28.624, 77.295, "MCD", "Shahdara South", 129),
  p("ghazipur", "Ghazipur Landfill", 28.624, 77.327, "MCD", "Shahdara South", 201, "landfill"),
  p("laxmi-nagar", "Laxmi Nagar", 28.63, 77.277, "MCD", "Shahdara South", 168),
  p("lajpat-nagar", "Lajpat Nagar", 28.5677, 77.2433, "MCD", "Central", 163),
  p("rk-puram", "R.K. Puram", 28.565, 77.175, "MCD", "South", 157),
  p("saket", "Saket", 28.5245, 77.2066, "MCD", "South", 146),
  p("janakpuri", "Janakpuri", 28.6219, 77.0878, "MCD", "West", 178),
  p("dwarka-10", "Dwarka Sector 10", 28.5823, 77.05, "MCD", "Najafgarh", 169),
  p("najafgarh", "Najafgarh", 28.609, 76.98, "MCD", "Najafgarh", 192),
  p("connaught-place", "Connaught Place", 28.6315, 77.2167, "NDMC", "Connaught Place", 154),
  p("india-gate", "India Gate area", 28.6129, 77.2295, "NDMC", "New Delhi", 141),
  p("sarojini-nagar", "Sarojini Nagar", 28.5775, 77.198, "NDMC", "New Delhi", 148),
  p("ring-road-moolchand", "Ring Road, Moolchand", 28.568, 77.234, "PWD", "South Roads", 171, "road"),
  p("orr-pitampura", "Outer Ring Road, Pitampura", 28.701, 77.133, "PWD", "North Roads", 189, "road"),
  p("mb-road", "Mehrauli–Badarpur Road", 28.5, 77.23, "PWD", "South Roads", 158, "road"),
  p("wazirabad-road", "Wazirabad Road", 28.723, 77.23, "PWD", "North Roads", 184, "road"),
  p("yamuna-khadar", "Yamuna Khadar", 28.615, 77.275, "DDA", "Yamuna Zone", 160, "green"),
  p("vasant-ridge", "Vasant Kunj Ridge", 28.529, 77.156, "DDA", "South Zone", 139, "green"),
  p("delhi-cantt", "Delhi Cantonment", 28.595, 77.136, "DCB", "Cantonment", 140),
  p("bawana", "Bawana Industrial Area", 28.7922, 77.048, "DSIIDC", "Bawana", 248, "industrial"),
  p("narela-ind", "Narela Industrial Area", 28.825, 77.1, "DSIIDC", "Narela Industrial", 231, "industrial"),
  p("wazirpur", "Wazirpur Industrial Area", 28.7005, 77.1555, "DSIIDC", "Wazirpur", 224, "industrial"),
  p("okhla", "Okhla Phase II", 28.53, 77.275, "DSIIDC", "Okhla", 187, "industrial"),
  p("mayapuri", "Mayapuri", 28.636, 77.123, "DSIIDC", "Mayapuri", 205, "industrial"),
];

export const placeById = (id) => PLACES.find((x) => x.id === id);

const byId = Object.fromEntries(PLACES.map((x) => [x.id, x]));
const s = (id, name, placeId, dLat, dLon, age) => ({
  id, name, kind: "school", age, placeId,
  lat: byId[placeId].lat + dLat, lon: byId[placeId].lon + dLon,
});
const h = (id, name, placeId, dLat, dLon) => ({
  id, name, kind: "hospital", placeId,
  lat: byId[placeId].lat + dLat, lon: byId[placeId].lon + dLon,
});

// Sensitive receptors: schools (illustrative names) and hospitals (approximate real sites).
export const RECEPTORS = [
  s("sch-ndps", "North Delhi Public School", "ashok-vihar", 0, 0, "primary"),
  s("sch-gsss-av", "Govt. Sr. Sec. School, Ashok Vihar", "ashok-vihar", 0.0008, 0.0007, "secondary"),
  s("sch-mt", "Model Town Public School", "model-town", 0.002, -0.002, "primary"),
  s("sch-tim", "Timarpur Govt. School", "timarpur", -0.002, 0.003, "mixed"),
  s("sch-kb", "Karol Bagh Girls' School", "karol-bagh", 0.002, 0.002, "secondary"),
  s("sch-rohini", "Rohini Bal Vidyalaya", "rohini-s7", -0.003, 0.004, "primary"),
  s("sch-bhalswa", "Bhalswa Dairy MCD Primary School", "bhalswa", -0.004, 0.005, "primary"),
  s("sch-shahdara", "Shahdara Sarvodaya Vidyalaya", "shahdara", 0.002, -0.003, "mixed"),
  s("sch-dilshad", "Dilshad Garden Model School", "dilshad", -0.003, -0.002, "primary"),
  s("sch-av", "Anand Vihar Model School", "anand-vihar", 0.002, -0.003, "primary"),
  s("sch-xav", "St. Xavier's School, Patparganj", "patparganj", 0.0025, 0.002, "secondary"),
  s("sch-ghaz", "Ghazipur MCD Primary School", "ghazipur", 0.004, -0.004, "primary"),
  s("sch-lax", "Laxmi Nagar Public School", "laxmi-nagar", 0.002, 0.003, "mixed"),
  s("sch-lajpat", "Lajpat Nagar Convent", "lajpat-nagar", -0.002, 0.002, "primary"),
  s("sch-kv-rkp", "Kendriya Vidyalaya, R.K. Puram", "rk-puram", 0.0012, 0.0012, "mixed"),
  s("sch-sarv-rkp", "Sarvodaya Vidyalaya, R.K. Puram", "rk-puram", -0.002, -0.001, "primary"),
  s("sch-saket", "Saket Public School", "saket", 0.002, 0.002, "secondary"),
  s("sch-janak", "Janakpuri Day School", "janakpuri", 0.002, 0.002, "primary"),
  s("sch-dwarka", "Dwarka Sector 10 Govt. School", "dwarka-10", 0.002, -0.002, "mixed"),
  s("sch-cp", "Connaught Place Sarvodaya School", "connaught-place", 0.003, 0.002, "mixed"),
  s("sch-sn", "Sarojini Nagar Primary School", "sarojini-nagar", -0.002, 0.002, "primary"),
  s("sch-cantt", "Cantt. Board Primary School", "delhi-cantt", 0.003, 0.003, "primary"),
  s("sch-bawana", "Bawana JJ Colony School", "bawana", -0.006, 0.004, "primary"),
  s("sch-okhla", "Okhla Govt. Boys School", "okhla", 0.004, 0.003, "secondary"),
  s("sch-mayapuri", "Mayapuri Municipal School", "mayapuri", -0.003, 0.004, "primary"),
  h("hos-aiims", "AIIMS", "ring-road-moolchand", 0, 0),
  h("hos-sjh", "Safdarjung Hospital", "sarojini-nagar", -0.009, 0.007),
  h("hos-gtb", "GTB Hospital", "dilshad", 0.003, -0.012),
  h("hos-lnjp", "LNJP Hospital", "connaught-place", 0.008, 0.023),
  h("hos-bjrm", "BJRM Hospital, Jahangirpuri", "bhalswa", -0.017, 0.006),
  h("hos-maxsaket", "Max Hospital, Saket", "saket", 0.003, 0.005),
  h("hos-ddu", "Deen Dayal Upadhyay Hospital", "janakpuri", 0.011, 0.021),
  h("hos-rml", "RML Hospital", "connaught-place", -0.005, -0.017),
];
