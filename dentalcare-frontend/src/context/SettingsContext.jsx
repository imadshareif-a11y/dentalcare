import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api, getToken, apiHref } from '../api/client';
import { useAuth } from './AuthContext';
import { formatDate, formatMoney } from '../utils/format';

const SettingsContext = createContext(null);

const DEFAULTS = {
  dateFormat: 'DD/MM/YYYY',
  currencySymbol: '₪',
  baseCurrencyId: null,
  baseCurrencyCode: 'ILS',
  decimalPlaces: 2,
  thousandsSeparator: ',',
  decimalSeparator: '.',
  printHeaderText: '',
  hasLetterhead: false,
  letterheadMime: null,
  aiEnabled: false,
  aiReady: false,
  aiReadyReason: null,
  hasAiApiKey: false,
  aiApiKeyHint: null,
  aiProvider: 'openai',
  aiBaseUrl: '',
  aiVisionModel: 'gpt-4o-mini',
  waEnabled: false,
  hasWaApiToken: false,
  waApiTokenHint: null,
  waProvider: 'compatible',
  waBaseUrl: '',
  waPhoneNumberId: '',
  waDefaultCountry: '972',
  waTemplateAppointment: '',
  waTemplateReminder: '',
  waTemplatePayment: '',
  waTemplateBalance: '',
  waAutoAppointment: false,
  waAutoReminder: false,
  waAutoPayment: false,
  dateFormats: ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM/DD/YYYY'],
};

export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULTS);
  const [letterheadUrl, setLetterheadUrl] = useState(null);

  const load = useCallback(async () => {
    if (!user || user.role === 'SUPER_ADMIN') {
      setSettings(DEFAULTS);
      setLetterheadUrl(null);
      return;
    }
    try {
      const data = await api.get('/settings');
      setSettings({ ...DEFAULTS, ...data });
      if (data.hasLetterhead) {
        const token = getToken();
        const res = await fetch(apiHref('/settings/letterhead'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const blob = await res.blob();
          setLetterheadUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        }
      } else {
        setLetterheadUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      }
    } catch {
      setSettings(DEFAULTS);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(() => ({
    settings,
    letterheadUrl,
    reload: load,
    money: (v) => formatMoney(v, settings),
    date: (v) => formatDate(v, settings),
    isOwner: user?.role === 'OWNER',
  }), [settings, letterheadUrl, load, user]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings يجب أن يُستخدم داخل SettingsProvider');
  return ctx;
}
