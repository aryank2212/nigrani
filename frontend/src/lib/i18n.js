import { useSyncExternalStore } from "react";

const en = {
  "nav.home": "Home", "nav.report": "Report", "nav.myReports": "My reports", "nav.map": "Live map",
  "nav.scoreboard": "Scoreboard", "nav.grap": "What's banned", "nav.signin": "Sign in", "nav.signout": "Sign out",
  "nav.queue": "Queue", "nav.closed": "Closed", "nav.dashboard": "Dashboard", "nav.command": "Control room",
  "nav.policies": "Policies", "nav.menu": "Menu", "nav.incidents": "All incidents",

  "hero.title": "Pollution complaints that can't be ignored.",
  "hero.sub": "Report burning waste or construction dust in three taps. Nigrani checks the photo, finds the agency responsible, and makes sure it is actually fixed.",
  "hero.cta": "Report a problem", "hero.cta2": "See who actually fixes things",
  "how.title": "How a complaint is handled",
  "how.1.t": "You report", "how.1.d": "A photo and your location. Hindi or English.",
  "how.2.t": "AI checks the evidence", "how.2.d": "Old or copied photos are rejected. The activity is checked against today's GRAP rules.",
  "how.3.t": "The right agency gets it", "how.3.d": "Matched to the exact MCD zone, NDMC, PWD, DDA or other owner of that spot.",
  "how.4.t": "Worst harm goes first", "how.4.d": "Smoke drifting towards a school ranks above a fire in an empty field.",
  "how.5.t": "Fixed means fixed", "how.5.d": "The officer must upload an after-photo from the same place. If the AI still sees the problem, it reopens.",

  "type.waste_burning": "Garbage or waste burning", "type.construction_dust": "Construction dust",
  "type.debris": "Uncovered debris", "type.industrial_smoke": "Industrial smoke", "type.road_dust": "Road dust",

  "status.new": "Received", "status.acknowledged": "Accepted by officer", "status.in_progress": "Action under way",
  "status.closed": "Verified fixed", "status.reopened": "Reopened: not fixed", "status.rejected": "Rejected at intake",

  "report.title": "Report a problem",
  "report.step1": "Photo", "report.step2": "Place", "report.step3": "Send",
  "report.photo.title": "Take a photo of the problem",
  "report.photo.hint": "Use your camera. Photos older than 30 minutes are not accepted, so the evidence is always current.",
  "report.photo.take": "Take or choose a photo", "report.photo.change": "Choose a different photo",
  "report.photo.samples": "No camera? Try a sample photo (demo)",
  "report.what": "What is happening?",
  "report.place.title": "Where is it?",
  "report.place.gps": "Use my current location", "report.place.pick": "Or choose a locality",
  "report.place.drag": "Drag the pin to the exact spot.", "report.place.landmark": "Landmark (optional)",
  "report.place.landmarkHint": "For example: behind the community hall",
  "report.send.title": "Check and send",
  "report.desc": "Anything else we should know? (optional)", "report.anon": "Keep my name hidden from the public",
  "report.submit": "Send report", "report.next": "Next", "report.back": "Back",
  "report.done.created": "Your report is registered", "report.done.merged": "Someone already reported this. You are now a witness.",
  "report.done.rejected": "We could not accept this report",
  "report.track": "Track this report", "report.another": "Report another",
  "report.retake": "Retake the photo",

  "login.title": "Sign in", "login.citizen": "Citizen", "login.official": "Department",
  "login.phone": "Mobile number", "login.sendOtp": "Send code", "login.otp": "6-digit code",
  "login.verify": "Verify and continue", "login.email": "Official email", "login.password": "Password",
  "login.signin": "Sign in", "login.demo": "Demo accounts", "login.register": "New here? Just enter your number and we will create your account.",
  "login.name": "Your name",

  "my.title": "My reports", "my.empty": "You have not reported anything yet.",
  "common.loading": "Loading…", "common.language": "हिन्दी", "common.view": "View",
};

const hi = {
  "nav.home": "होम", "nav.report": "शिकायत करें", "nav.myReports": "मेरी शिकायतें", "nav.map": "लाइव नक्शा",
  "nav.scoreboard": "स्कोरबोर्ड", "nav.grap": "क्या प्रतिबंधित है", "nav.signin": "लॉग इन", "nav.signout": "लॉग आउट",
  "nav.menu": "मेनू",

  "hero.title": "प्रदूषण की शिकायतें, जिन्हें अनदेखा नहीं किया जा सकता।",
  "hero.sub": "कचरा जलाने या निर्माण की धूल की शिकायत तीन टैप में करें। निगरानी फ़ोटो की जाँच करता है, सही विभाग तक पहुँचाता है और पक्का करता है कि समस्या सच में ठीक हुई।",
  "hero.cta": "शिकायत दर्ज करें", "hero.cta2": "देखें कौन सा विभाग सच में काम करता है",
  "how.title": "शिकायत कैसे निपटाई जाती है",
  "how.1.t": "आप शिकायत करते हैं", "how.1.d": "एक फ़ोटो और आपकी लोकेशन। हिन्दी या अंग्रेज़ी में।",
  "how.2.t": "AI सबूत जाँचता है", "how.2.d": "पुरानी या कॉपी की हुई फ़ोटो अस्वीकार हो जाती हैं। आज के GRAP नियमों से मिलान होता है।",
  "how.3.t": "सही विभाग को मिलती है", "how.3.d": "उस जगह के असली मालिक (MCD ज़ोन, NDMC, PWD, DDA आदि) को भेजी जाती है।",
  "how.4.t": "सबसे ज़्यादा नुकसान पहले", "how.4.d": "स्कूल की ओर बढ़ता धुआँ खाली मैदान की आग से ऊपर रखा जाता है।",
  "how.5.t": "ठीक का मतलब ठीक", "how.5.d": "अधिकारी को उसी जगह की \"बाद की\" फ़ोटो डालनी होती है। AI को समस्या दिखे तो शिकायत फिर खुल जाती है।",

  "type.waste_burning": "कचरा या कूड़ा जलाना", "type.construction_dust": "निर्माण की धूल",
  "type.debris": "खुला मलबा", "type.industrial_smoke": "फ़ैक्टरी का धुआँ", "type.road_dust": "सड़क की धूल",

  "status.new": "प्राप्त हुई", "status.acknowledged": "अधिकारी ने स्वीकार की", "status.in_progress": "कार्रवाई जारी",
  "status.closed": "ठीक होने की पुष्टि", "status.reopened": "फिर खुली: ठीक नहीं हुआ", "status.rejected": "जाँच में अस्वीकार",

  "report.title": "शिकायत दर्ज करें",
  "report.step1": "फ़ोटो", "report.step2": "जगह", "report.step3": "भेजें",
  "report.photo.title": "समस्या की फ़ोटो लें",
  "report.photo.hint": "अपने कैमरे से लें। 30 मिनट से पुरानी फ़ोटो स्वीकार नहीं होती, ताकि सबूत हमेशा ताज़ा रहे।",
  "report.photo.take": "फ़ोटो लें या चुनें", "report.photo.change": "दूसरी फ़ोटो चुनें",
  "report.photo.samples": "कैमरा नहीं है? नमूना फ़ोटो आज़माएँ (डेमो)",
  "report.what": "क्या हो रहा है?",
  "report.place.title": "यह कहाँ है?",
  "report.place.gps": "मेरी मौजूदा लोकेशन इस्तेमाल करें", "report.place.pick": "या इलाका चुनें",
  "report.place.drag": "पिन को सही जगह पर खींचें।", "report.place.landmark": "पहचान की जगह (वैकल्पिक)",
  "report.place.landmarkHint": "जैसे: कम्युनिटी हॉल के पीछे",
  "report.send.title": "जाँचें और भेजें",
  "report.desc": "और कुछ बताना चाहें? (वैकल्पिक)", "report.anon": "जनता से मेरा नाम छिपाएँ",
  "report.submit": "शिकायत भेजें", "report.next": "आगे", "report.back": "पीछे",
  "report.done.created": "आपकी शिकायत दर्ज हो गई", "report.done.merged": "यह शिकायत पहले ही दर्ज थी। अब आप भी गवाह हैं।",
  "report.done.rejected": "हम यह शिकायत स्वीकार नहीं कर सके",
  "report.track": "शिकायत की स्थिति देखें", "report.another": "एक और शिकायत करें",
  "report.retake": "फ़ोटो दोबारा लें",

  "login.title": "लॉग इन", "login.citizen": "नागरिक", "login.official": "विभाग",
  "login.phone": "मोबाइल नंबर", "login.sendOtp": "कोड भेजें", "login.otp": "6 अंकों का कोड",
  "login.verify": "सत्यापित करें और आगे बढ़ें", "login.email": "आधिकारिक ईमेल", "login.password": "पासवर्ड",
  "login.signin": "लॉग इन", "login.demo": "डेमो खाते", "login.register": "नए हैं? बस अपना नंबर डालें, हम आपका खाता बना देंगे।",
  "login.name": "आपका नाम",

  "my.title": "मेरी शिकायतें", "my.empty": "आपने अभी तक कोई शिकायत नहीं की है।",
  "common.loading": "लोड हो रहा है…", "common.language": "English", "common.view": "देखें",
};

const DICT = { en, hi };
const KEY = "nigrani.lang";
let lang = (() => { try { return localStorage.getItem(KEY) === "hi" ? "hi" : "en"; } catch { return "en"; } })();
const listeners = new Set();

export function setLang(next) {
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  document.documentElement.lang = next;
  listeners.forEach((l) => l());
}
document.documentElement.lang = lang;

export function useT() {
  const current = useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => lang);
  const t = (key, vars) => {
    let s = DICT[current][key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  };
  return { t, lang: current, setLang };
}
