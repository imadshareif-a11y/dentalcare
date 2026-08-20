// whatsapp/phone.js — تطبيع أرقام الجوال لواتساب (972 إسرائيل / 970 فلسطين)

const IL_CC = '972';
const PS_CC = '970';
const SUPPORTED_CCS = [IL_CC, PS_CC];

/** بادئات جوال إسرائيلية شائعة بعد إزالة 0 المحلي → 5X */
const IL_MOBILE_SECOND = new Set(['0', '1', '2', '3', '4', '5', '8']);
/** بادئات جوال فلسطينية شائعة: 059، 056 */
const PS_MOBILE_SECOND = new Set(['6', '9']);

function normalizeDefaultCountry(value) {
  const cc = String(value || IL_CC).replace(/\D/g, '');
  if (cc === PS_CC || cc === IL_CC) return cc;
  return IL_CC;
}

/**
 * تخمين مفتاح الدولة من رقم محلي يبدأ بـ 05…
 * @returns {'970'|'972'|null}
 */
function guessCcFromLocalMobile(localWithoutLeadingZero) {
  // localWithoutLeadingZero مثل "59xxxxxxx" أو "50xxxxxxx"
  if (!localWithoutLeadingZero || localWithoutLeadingZero[0] !== '5') return null;
  const second = localWithoutLeadingZero[1];
  if (PS_MOBILE_SECOND.has(second)) return PS_CC;
  if (IL_MOBILE_SECOND.has(second)) return IL_CC;
  return null;
}

/**
 * يُرجع الرقم بصيغة دولية بدون + (E.164 digits فقط).
 * يقبل أرقامًا محفوظة بـ 970 أو 972، أو محلية 05… مع تخمين/افتراضي العيادة.
 */
function normalizeWhatsappPhone(raw, defaultCountry = IL_CC) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);

  const fallbackCc = normalizeDefaultCountry(defaultCountry);

  // رقم دولي يبدأ بمفتاح مدعوم — نبقيه كما هو
  for (const cc of SUPPORTED_CCS) {
    if (digits.startsWith(cc) && digits.length >= cc.length + 8 && digits.length <= 15) {
      // إزالة 0 زائد بعد المفتاح إن وُجد (97205… → 9725…)
      const rest = digits.slice(cc.length);
      if (rest.startsWith('0') && rest.length >= 9) {
        digits = cc + rest.slice(1);
      }
      if (digits.length >= 10 && digits.length <= 15) return digits;
    }
  }

  // محلي: 05xxxxxxxx أو 5xxxxxxxx (9–10 أرقام)
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    const national = digits.slice(1);
    const guessed = guessCcFromLocalMobile(national);
    digits = (guessed || fallbackCc) + national;
  } else if (digits.length === 9 && digits.startsWith('5')) {
    const guessed = guessCcFromLocalMobile(digits);
    digits = (guessed || fallbackCc) + digits;
  }

  if (digits.length < 10 || digits.length > 15) return null;

  // بعد التطبيع يجب أن يكون المفتاح 970 أو 972 لجوالات المنطقة
  const hasSupportedCc = SUPPORTED_CCS.some((cc) => digits.startsWith(cc));
  if (!hasSupportedCc && digits.length >= 10) {
    // أرقام دول أخرى تُترك كما هي إن طولها صالح
    return digits;
  }

  return digits;
}

/**
 * صيغ مرشّحة للإرسال عند الشك (نفس الرقم بمفتاحي 970 و 972).
 * تُستخدم فقط للأرقام المحلية/الغامضة — لا تبدّل رقمًا دوليًا واضحًا.
 */
function whatsappPhoneCandidates(raw, defaultCountry = IL_CC) {
  const primary = normalizeWhatsappPhone(raw, defaultCountry);
  if (!primary) return [];

  const candidates = [primary];
  const digits = String(raw || '').replace(/\D/g, '').replace(/^00/, '');

  // إن كان المدخل أصلًا بمفتاح صريح 970/972 — لا نجرّب البديل
  const explicit = SUPPORTED_CCS.some(
    (cc) => digits.startsWith(cc) || digits.startsWith(`0${cc}`)
  );
  if (explicit) return candidates;

  // رقم محلي: أضف البديل الإقليمي إن وُجد
  let national = null;
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    national = digits.slice(1);
  } else if (digits.length === 9 && digits.startsWith('5')) {
    national = digits;
  } else if (primary.startsWith(IL_CC)) {
    national = primary.slice(IL_CC.length);
  } else if (primary.startsWith(PS_CC)) {
    national = primary.slice(PS_CC.length);
  }

  if (national && national.startsWith('5')) {
    const altCc = primary.startsWith(IL_CC) ? PS_CC : IL_CC;
    const alt = altCc + national;
    if (alt !== primary && alt.length >= 10 && alt.length <= 15) {
      candidates.push(alt);
    }
  }

  return candidates;
}

module.exports = {
  normalizeWhatsappPhone,
  whatsappPhoneCandidates,
  normalizeDefaultCountry,
  IL_CC,
  PS_CC,
  SUPPORTED_CCS,
};
