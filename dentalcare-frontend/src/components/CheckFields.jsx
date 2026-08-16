// components/CheckFields.jsx
import { useTranslation } from 'react-i18next';

export default function CheckFields({ check, onChange, showAmount = false }) {
  const { t } = useTranslation();

  function update(field, value) {
    onChange({ ...check, [field]: value });
  }

  return (
    <div style={{ border: '1px solid #ccc', padding: 8, borderRadius: 6 }}>
      {showAmount && (
        <input
          type="number" min="0" step="0.01" placeholder={t('amount')}
          value={check.amount || ''} onChange={(e) => update('amount', e.target.value)} required
        />
      )}
      <input
        type="text" placeholder={t('check_number')}
        value={check.checkNumber || ''} onChange={(e) => update('checkNumber', e.target.value)} required
      />
      <input
        type="text" placeholder={t('check_bank')}
        value={check.bankName || ''} onChange={(e) => update('bankName', e.target.value)} required
      />
      <input
        type="date" placeholder={t('check_due_date')}
        value={check.dueDate || ''} onChange={(e) => update('dueDate', e.target.value)} required
      />
      <input
        type="text" placeholder={t('check_drawer')}
        value={check.drawerName || ''} onChange={(e) => update('drawerName', e.target.value)}
      />
    </div>
  );
}
