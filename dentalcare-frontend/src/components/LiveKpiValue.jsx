import { useCountUp } from '../hooks/useDashboardLive';

/** رقم KPI يتحرك عند التحديث */
export default function LiveKpiValue({ value, format, className = '' }) {
  const n = useCountUp(value);
  const isInt = Number.isInteger(Number(value));
  const shown = format
    ? format(isInt ? Math.round(n) : n)
    : (isInt ? String(Math.round(n)) : n.toFixed(2));

  return (
    <strong className={`dc-live-kpi-value${className ? ` ${className}` : ''}`} data-live-kpi>
      {shown}
    </strong>
  );
}
