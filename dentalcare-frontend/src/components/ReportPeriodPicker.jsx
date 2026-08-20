import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

const BASE_PRESETS = ['year', 'prev_year', 'month', 'today', 'yesterday', ...Array.from({ length: 12 }, (_, i) => `m${i + 1}`)];

export default function ReportPeriodPicker({
  mode = 'range',
  fromDate,
  toDate,
  asOfDate,
  preset,
  onFromDate,
  onToDate,
  onAsOfDate,
  onPreset,
}) {
  const { t } = useTranslation();
  const [fiscalPresets, setFiscalPresets] = useState([]);

  useEffect(() => {
    api.get('/settings/fiscal-years')
      .then((data) => {
        const years = (data.years || [])
          .map((y) => Number(y.yearLabel))
          .filter((y) => Number.isFinite(y))
          .sort((a, b) => b - a);
        setFiscalPresets(years.map((y) => `fy${y}`));
      })
      .catch(() => setFiscalPresets([]));
  }, []);

  const presets = [...BASE_PRESETS, ...fiscalPresets.filter((p) => !BASE_PRESETS.includes(p))];

  return (
    <div className="dc-period-picker">
      {mode === 'range' ? (
        <>
          <input type="date" value={fromDate} onChange={(e) => onFromDate(e.target.value)} />
          <input type="date" value={toDate} onChange={(e) => onToDate(e.target.value)} />
        </>
      ) : (
        <input type="date" value={asOfDate} onChange={(e) => onAsOfDate(e.target.value)} />
      )}
      <select value={preset || 'custom'} onChange={(e) => onPreset(e.target.value)}>
        <option value="custom">{t('report_period_custom')}</option>
        {presets.map((key) => (
          <option key={key} value={key}>
            {key.startsWith('fy')
              ? t('report_period_fiscal_year', { year: key.slice(2) })
              : key.startsWith('m')
                ? t('report_period_month_n', { n: key.slice(1) })
                : t(`report_period_${key}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
