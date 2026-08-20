import { useState } from 'react';
import { loadReportPeriod, saveReportPeriod, rangeFromPreset } from '../lib/reportPeriod';

export default function useReportPeriod() {
  const [period, setPeriod] = useState(loadReportPeriod);

  function apply(next) {
    setPeriod(next);
    saveReportPeriod(next);
  }

  function setFromDate(fromDate) {
    apply({ ...period, fromDate, preset: 'custom' });
  }

  function setToDate(toDate) {
    apply({ ...period, toDate, preset: 'custom' });
  }

  function setAsOfDate(asOfDate) {
    apply({ ...period, toDate: asOfDate, preset: 'custom' });
  }

  function setPreset(preset) {
    if (preset === 'custom') {
      apply({ ...period, preset: 'custom' });
      return;
    }
    apply({ ...rangeFromPreset(preset), preset });
  }

  return {
    fromDate: period.fromDate,
    toDate: period.toDate,
    asOfDate: period.toDate,
    preset: period.preset,
    setFromDate,
    setToDate,
    setAsOfDate,
    setPreset,
  };
}
