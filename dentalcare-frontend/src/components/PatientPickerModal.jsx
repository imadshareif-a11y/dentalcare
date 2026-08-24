import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../context/SettingsContext';
import PartyModal from './PartyModal';

export default function PatientPickerModal({
  open,
  onClose,
  onSelect,
  patients = [],
  selectedPatientId = '',
}) {
  const { t } = useTranslation();
  const { money } = useSettings();
  const searchRef = useRef(null);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearchText('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const focusSearch = () => {
      const el = searchRef.current;
      if (!el) return;
      el.focus();
      el.select?.();
    };
    const t0 = window.setTimeout(focusSearch, 0);
    const t1 = window.setTimeout(focusSearch, 50);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => {
      const hay = [p.name, p.phone, p.billing_party_name].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [patients, searchText]);

  function pick(patientId) {
    onSelect?.(patientId);
    onClose?.();
  }

  return (
    <PartyModal
      open={open}
      wide
      className="dc-party-picker-modal"
      title={t('patient_picker_title')}
      onClose={onClose}
    >
      <div className="dc-party-picker">
        <p className="dc-muted text-sm">{t('patient_picker_hint')}</p>

        <section className="dc-party-picker-section">
          <div className="dc-party-picker-toolbar">
            <input
              ref={searchRef}
              type="search"
              className="dc-field-grow"
              placeholder={t('patient_picker_search')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              autoFocus
            />
          </div>

          {filtered.length === 0 ? (
            <div className="dc-muted dc-party-picker-empty">{t('clinical_patient_search_empty')}</div>
          ) : (
            <div className="dc-party-picker-table-wrap">
              <table className="dc-party-picker-table text-sm">
                <thead>
                  <tr>
                    <th>{t('patient_picker_col_name')}</th>
                    <th>{t('patient_picker_col_phone')}</th>
                    <th>{t('patient_picker_col_balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const balance = Number(p.balance) || 0;
                    const balanceOk = balance <= 0;
                    const isSelected = String(p.id) === String(selectedPatientId);
                    return (
                      <tr
                        key={p.id}
                        className={`dc-party-picker-row${isSelected ? ' is-selected' : ''}`}
                        onClick={() => pick(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') pick(p.id);
                        }}
                        tabIndex={0}
                        role="button"
                      >
                        <td>
                          {p.name}
                          {p.is_dependent && p.billing_party_name && (
                            <span className="dc-muted text-sm"> · {p.billing_party_name}</span>
                          )}
                        </td>
                        <td dir="ltr">{p.phone || '—'}</td>
                        <td className="dc-money">
                          <span className={`dc-balance-chip${balanceOk ? ' is-ok' : ''}`}>
                            {money(balance)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PartyModal>
  );
}
