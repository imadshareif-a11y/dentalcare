// i18n.js
// -----------------------------------------------------------
// اللغتان ar وhe اتجاههم RTL، en اتجاهه LTR. تبديل اللغة لازم
// يغيّر dir بالـ <html> فعليًا، مش بس النص — وإلا الأزرار
// والجداول بتضل بترتيب غلط.
// -----------------------------------------------------------

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';
import he from './locales/he.json';

const RTL_LANGUAGES = ['ar', 'he'];

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
    he: { translation: he },
  },
  lng: localStorage.getItem('locale') || 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export function applyDirection(locale) {
  const dir = RTL_LANGUAGES.includes(locale) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', locale);
}

export function changeLocale(locale) {
  i18n.changeLanguage(locale);
  localStorage.setItem('locale', locale);
  applyDirection(locale);
}

// تطبيق الاتجاه فورًا عند تحميل الصفحة أول مرة
applyDirection(i18n.language);

export default i18n;
