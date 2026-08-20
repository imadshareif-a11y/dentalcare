// accounting/bankCatalog.js
// قائمة أرقام البنوك المعتمدة (عربي / إنجليزي / عبري) لبذرة كل عيادة.

// [رقم, عربي, إنجليزي, عبري]
const STANDARD_BANKS = [
  ['0', 'غير محدد', 'Unspecified', 'לא צוין'],
  ['1', 'يورا', 'Uora', 'יורא'],
  ['2', 'بنك أتسيفون أميركا', 'Bank Otzar HaHayal America', 'בנק אוצר החייל אמריקה'],
  ['3', 'بنك أتسيفون أميركا', 'Bank Otzar HaHayal America', 'בנק אוצר החייל אמריקה'],
  ['4', 'بنك يهب لعمال الدولة', 'Bank Yahav for Government Employees Ltd', 'בנק יהב לעובדי המדינה בע"מ'],
  ['6', 'بنك أدونيم لمشكنوت', 'Bank Adanim for Mortgages', 'בנק אדנים למשכנתאות'],
  ['7', 'بنك التطوير والصناعة', 'Development and Industry Bank', 'בנק לפיתוח ולתעשייה'],
  ['8', 'بنك حسغنوت لسرائيل', 'Israel Mortgage Bank', 'בנק למשכנתאות לישראל'],
  ['9', 'بنك البريد', 'Postal Bank', 'בנק הדואר'],
  ['10', 'بنك لؤومي', 'Bank Leumi Le-Israel B.M', 'בנק לאומי לישראל בע"מ'],
  ['11', 'بنك ديسكونت', 'Israel Discount Bank Ltd', 'בנק דיסקונט לישראל בע"מ'],
  ['12', 'بنك هبوعليم', 'Bank Hapoalim B.M', 'בנק הפועלים בע"מ'],
  ['13', 'بنك الاتحاد الإسرائيلي', 'Union Bank of Israel Ltd', 'בנק איגוד לישראל בע"מ'],
  ['14', 'بنك اوتسار حيال المحدود', 'Bank Otsar Ha-hayal Ltd', 'בנק אוצר החייל בע"מ'],
  ['17', 'بنك ميرسنتيل ديسكونت', 'Mercantile Discount Bank Ltd', 'בנק מרכנתיל דיסקונט בע"מ'],
  ['18', 'OneZero', 'OneZero', 'OneZero'],
  ['19', 'بنك حكلئوت', 'Agriculture Bank', 'בנק לחקלאות'],
  ['20', 'بنك مزراحي الموحد', 'Mizrahi Tefahot Bank Ltd', 'בנק מזרחי טפחות בע"מ'],
  ['21', 'بنك استراليا نيوزيلاند', 'Australia and New Zealand Bank', 'בנק אוסטרליה וניו זילנד'],
  ['22', 'بنك سيتي بانك', 'Citibank N.A', 'סיטיבנק'],
  ['23', 'بنك اتش اس بي سي', 'HSBC Bank plc', 'בנק HSBC'],
  ['24', 'بنك إسرائيل الأمريكي', 'Israel-American Bank', 'בנק ישראלי אמריקאי'],
  ['25', 'بنك بي ان بي باريبا', 'BNP Paribas', 'בנק BNP פריבה'],
  ['26', 'بنك كليلي لإسرائيل', 'UBank Ltd', 'יובנק בע"מ'],
  ['27', 'البنك الوطني', 'The National Bank', 'הבנק הלאומי'],
  ['28', 'بنك كونتننتال لإسرائيل', 'Continental Bank of Israel', 'בנק קונטיננטל לישראל'],
  ['30', 'بنك لمسحار المحدود', 'Trade Bank Ltd', 'בנק למסחר בע"מ'],
  ['31', 'بنك هبن لؤومي هريشون', 'The First International Bank of Israel Ltd', 'הבנק הבינלאומי הראשון לישראל בע"מ'],
  ['32', 'بنك لميمون ولسحر', 'Bank for Financing and Trade', 'בנק למימון ולמסחר'],
  ['33', 'بنك مركنتيل لإسرائيل', 'Mercantile Bank of Israel', 'בנק מרכנתיל לישראל'],
  ['34', 'البنك العربي الإسرائيلي', 'Arab Israel Bank Ltd', 'הבנק הערבי הישראלי בע"מ'],
  ['37', 'بنك الأردن', 'Bank Of Jordan', 'בנק ירדן'],
  ['38', 'البنك التجاري الفلسطيني', 'Palestine Commercial Bank', 'הבנק המסחרי הפלסטיני'],
  ['39', 'بنك اس بي اي سنات', 'State Bank Of India', 'בנק סטייט אוף אינדיה'],
  ['41', '41', 'Bank 41', 'בנק 41'],
  ['43', 'البنك الأهلي الأردني', 'Jordan Ahli Bank', 'הבנק האהלי הירדני'],
  ['44', 'بنك ايتان لكودوم', 'Bank Eitan for Advancement', 'בנק איתן לקידום'],
  ['46', 'بنك مساد المحدود', 'Bank Massad Ltd', 'בנק מסד בע"מ'],
  ['47', 'بنك كوبات اشراي وحسخون', 'Credit and Savings Fund Bank', 'בנק קופת אשראי וחסכון'],
  ['48', 'بنك كوبات عوفيد هلؤومي', 'National Workers Fund Bank', 'בנק קופת עובד לאומי'],
  ['49', 'البنك العربي', 'Arab Bank', 'הבנק הערבי'],
  ['50', 'بنك ام اس بي', 'Bank Clearing Center Ltd', 'מרכז סליקה בנקאי בע"מ'],
  ['51', '51', 'Bank 51', 'בנק 51'],
  ['52', 'بنك بوعلي اجودات اسرائيل', 'Poalei Agudat Israel Bank', 'בנק פועלי אגודת ישראל'],
  ['53', 'بنك عليا لؤومي', 'National Aliyah Bank', 'בנק עליה לאומי'],
  ['54', 'بنك القدس للاسكان', 'Bank of Jerusalem Ltd', 'בנק ירושלים בע"מ'],
  ['55', 'بنك الصناعة', 'Industry Bank', 'בנק לתעשייה'],
  ['58', 'بنك لؤومي وهشكعوت', 'Bank Leumi for Mortgages', 'בנק לאומי למשכנתאות'],
  ['59', 'بنك شين فاف اف', 'Automated Banking Services Ltd', 'שירותים בנקאיים אוטומטיים בע"מ'],
  ['62', 'البنك الأقصى الإسلامي', 'Al-Aqsa Islamic Bank', 'בנק אלאקצא האיסלאמי'],
  ['65', 'بنك حسك', 'Hesech - Kupat Hisachon Lechinuch Ltd', 'חסך – קופת חיסכון לחינוך בע"מ'],
  ['66', 'بنك القاهرة عمان', 'Cairo Amman Bank', 'בנק קהיר עמאן'],
  ['67', 'البنك العقاري المصري', 'Egyptian Arab Land Bank', 'הבנק לקרקעות המצרי הערבי'],
  ['68', 'بنك دكسيا إسرائيل', 'Dexia Israel Bank Ltd', 'בנק דקסיה ישראל בע"م'],
  ['71', 'البنك التجاري الأردني', 'Jordan Commercial Bank', 'הבנק המסחרי הירדני'],
  ['72', 'بنك عيدود', 'Bank Igud', 'בנק איגוד'],
  ['73', 'البنك الإسلامي العربي', 'Arab Islamic Bank', 'הבנק האיסלאמי הערבי'],
  ['74', 'البنك البريطاني للشرق الأوسط', 'British Bank of the Middle East', 'הבנק הבריטי למזרח התיכון'],
  ['76', 'بنك الاستثمار الفلسطيني', 'Palestine Investment Bank', 'בנק ההשקעות הפלסטיני'],
  ['77', 'بنك لئومي لقروض الاسكان', 'Bank Leumi for Housing Loans', 'בנק לאומי להלוואות דיור'],
  ['78', 'مصرف الصفا', 'Safa Bank', 'בנק ספא'],
  ['79', 'بنك اي اند زد جرندلز', 'ANZ Grindlays Bank', 'בנק ANZ גרינדלייס'],
  ['80', 'بنك تفحوت لمشكنوت', 'Tefahot Mortgage Bank', 'בנק טפחות למשכנתאות'],
  ['81', 'البنك الإسلامي الفلسطيني', 'Palestine Islamic Bank', 'הבנק האיסלאמי הפלסטיני'],
  ['82', 'بنك القدس', 'Al-Quds Bank', 'בנק אלקודס'],
  ['83', 'بنك الاتحاد للادخار والاستثمار', 'Union Bank', 'בנק האיחוד לחיסכון ולהשקעה'],
  ['84', 'بنك الإسكان للتجارة والتمويل', 'The Housing Bank For Trade & Finance', 'בנק השיכון למסחר ולמימון'],
  ['85', 'بنك يعسور لمشكنوت', 'Bank Yaasur for Mortgages', 'בנק יעסור למשכנתאות'],
  ['86', 'بنك الكرمل لمشكنوت', 'Bank Carmel for Mortgages', 'בנק הכרמל למשכנתאות'],
  ['87', 'بنك فلسطين الدولي', 'Palestine International Bank', 'בנק פלסטין הבינלאומי'],
  ['89', 'بنك فلسطين', 'Bank Of Palestine', 'בנק פלסטין'],
  ['90', 'بنك لفنوح لمشكنوت', 'Bank Adanim for Mortgages', 'בנק אדנים למשכנתאות'],
  ['91', 'بنك هبوعليم لمشكنوت', 'Bank Hapoalim for Mortgages', 'בנק הפועלים למשכנתאות'],
  ['93', 'البنك الأردني الكويتي', 'Jordan Kuwait Bank', 'הבנק הירדני הכוויתי'],
  ['94', 'بنك عتسميلوت لمشكنوت', 'Bank Atzmaut for Mortgages', 'בנק עצמאות למשכנתאות'],
  ['99', 'بنك اسرائيل', 'Bank of Israel', 'בנק ישראל'],
];

/**
 * يزرع/يحدّث قائمة البنوك المعتمدة للعيادة.
 * يحدّث الأسماء الإنجليزية والعبرية من القائمة المعتمدة.
 */
async function seedStandardBanks(client, tenantId) {
  let inserted = 0;
  let updated = 0;

  for (const [bankNumber, name, nameEn, nameHe] of STANDARD_BANKS) {
    const existing = await client.query(
      `SELECT id, name, name_en, name_he FROM banks WHERE tenant_id = $1 AND bank_number = $2`,
      [tenantId, bankNumber]
    );

    if (existing.rowCount === 0) {
      await client.query(
        `INSERT INTO banks (tenant_id, bank_number, name, name_en, name_he, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [tenantId, bankNumber, name, nameEn, nameHe]
      );
      inserted += 1;
      continue;
    }

    const row = existing.rows[0];
    const nextName = (!row.name || row.name === bankNumber) ? name : row.name;
    // فرض الأسماء المترجمة من القائمة المعتمدة
    const nextNameEn = nameEn || row.name_en;
    const nextNameHe = nameHe || row.name_he;

    if (nextName !== row.name || nextNameEn !== row.name_en || nextNameHe !== row.name_he) {
      await client.query(
        `UPDATE banks SET name = $2, name_en = $3, name_he = $4 WHERE id = $1`,
        [row.id, nextName, nextNameEn, nextNameHe]
      );
      updated += 1;
    }
  }

  return { inserted, updated, total: STANDARD_BANKS.length };
}

module.exports = { STANDARD_BANKS, seedStandardBanks };
