import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import ar from "../locales/ar.json";

const savedLang = localStorage.getItem("aqari_lang") ?? "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: "en" | "ar") {
  i18n.changeLanguage(lang);
  localStorage.setItem("aqari_lang", lang);
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = lang;
}

// Apply on load
document.documentElement.dir = savedLang === "ar" ? "rtl" : "ltr";
document.documentElement.lang = savedLang;

export default i18n;
