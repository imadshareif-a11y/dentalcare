// components/PermissionsEditor.jsx
import { useTranslation } from 'react-i18next';

export default function PermissionsEditor({ permissionKeys, levels, permissions, onChange }) {
  const { t } = useTranslation();

  function updateKey(key, value) {
    onChange({ ...permissions, [key]: value });
  }

  return (
    <table className="w-full text-sm">
      <tbody>
        {permissionKeys.map((key) => (
          <tr key={key}>
            <td>{t(`permission_${key}`)}</td>
            <td>
              <select value={permissions[key] || 'none'} onChange={(e) => updateKey(key, e.target.value)}>
                {levels.map((lvl) => (
                  <option key={lvl} value={lvl}>{t(`permission_level_${lvl}`)}</option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
