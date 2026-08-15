// components/VoucherForm.jsx
// -----------------------------------------------------------
// القطعة الأخطر بالواجهة. مبادئها:
// 1) التحقق من التوازن هون بالفرونت-إند = "مساعدة بصرية" فقط
//    (تلوين الزر، رسالة فورية) — مش المصدر النهائي للحقيقة.
//    السيرفر هو يلي بيقرر فعليًا (عبر postJournalEntry + trigger
//    قاعدة البيانات يلي بنيناهم قبل شوي).
// 2) idempotencyKey يتولّد مرة وحدة لحظة فتح النموذج، ونفس
//    القيمة تترسل حتى لو المستخدم ضغط "حفظ" أكتر من مرة أو
//    الطلب تكرر شبكيًا.
// -----------------------------------------------------------

import { useState, useMemo } from 'react';
import { api, ApiError, newIdempotencyKey } from '../api/client';

const emptyLine = () => ({ accountId: '', debit: '', credit: '', lineMemo: '' });

export default function VoucherForm({ accounts, onPosted }) {
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // مفتاح ثابت طول عمر النموذج المفتوح — ما بيتغيّر إلا لما
  // ينترحّل بنجاح وينفتح نموذج جديد فاضي
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const { totalDebit, totalCredit, diff } = useMemo(() => {
    const d = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const c = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return { totalDebit: d, totalCredit: c, diff: Math.round((d - c) * 100) / 100 };
  }, [lines]);

  const isBalanced = diff === 0 && totalDebit > 0;

  function updateLine(index, field, value) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index) {
    if (lines.length <= 2) return; // القيد لازم يبقى سطرين على الأقل
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    // تحقق بصري سريع — نفس التحقق النهائي رح يصير بالسيرفر بغض
    // النظر شو صار هون، فما في خطورة لو فاتنا شي هون بالغلط
    if (!isBalanced) {
      setError(`القيد غير متوازن (الفارق: ${Math.abs(diff)} ₪)`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post('/journal-entries', {
        memo,
        idempotencyKey,
        lines: lines
          .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
          .map((l) => ({
            accountId: l.accountId,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            lineMemo: l.lineMemo,
          })),
      });

      // نجاح — نفتح نموذج جديد بمفتاح جديد (النموذج القديم "انتهى")
      setLines([emptyLine(), emptyLine()]);
      setMemo('');
      setIdempotencyKey(newIdempotencyKey());
      onPosted?.(result);
    } catch (err) {
      // ما منحاول "نصلح" الخطأ محليًا أو نتظاهر بالنجاح — منعرضه
      // صريح، ومنسيب idempotencyKey متل ما هو (نفس المحاولة لو
      // ضغط المستخدم "حفظ" تاني، ما بينترحّل القيد مرتين)
      if (err instanceof ApiError) {
        setError(err.body?.error || err.message);
      } else {
        setError('تعذّر الاتصال بالسيرفر — حاول مرة أخرى');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select
            value={line.accountId}
            onChange={(e) => updateLine(i, 'accountId', e.target.value)}
            required
          >
            <option value="">اختر حساب</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.account_name}</option>
            ))}
          </select>
          <input
            type="number" min="0" step="0.01" placeholder="مدين"
            value={line.debit}
            onChange={(e) => updateLine(i, 'debit', e.target.value)}
          />
          <input
            type="number" min="0" step="0.01" placeholder="دائن"
            value={line.credit}
            onChange={(e) => updateLine(i, 'credit', e.target.value)}
          />
          <input
            type="text" placeholder="بيان السطر"
            value={line.lineMemo}
            onChange={(e) => updateLine(i, 'lineMemo', e.target.value)}
          />
          <button type="button" onClick={() => removeLine(i)} disabled={lines.length <= 2}>×</button>
        </div>
      ))}

      <button type="button" onClick={addLine}>+ إضافة سطر</button>

      <div className={isBalanced ? 'text-emerald-700' : 'text-rose-700'}>
        مدين: {totalDebit.toFixed(2)} ₪ — دائن: {totalCredit.toFixed(2)} ₪
        {!isBalanced && ` — الفارق: ${Math.abs(diff).toFixed(2)} ₪`}
      </div>

      <input
        type="text" placeholder="بيان القيد"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      {error && <div className="text-rose-700 font-bold">{error}</div>}

      {/* الزر يتعطّل أثناء الإرسال (منع ضغط مزدوج بصريًا) — لكن
          idempotencyKey هو الضمان الحقيقي، مش هاد التعطيل لحاله */}
      <button type="submit" disabled={!isBalanced || submitting}>
        {submitting ? 'جارٍ الترحيل...' : 'حفظ وترحيل القيد'}
      </button>
    </form>
  );
}
