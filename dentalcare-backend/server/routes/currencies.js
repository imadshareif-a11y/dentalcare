// routes/currencies.js
const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { setBaseCurrency } = require('../accounting/currency');
const { dedupeById } = require('../accounting/listDedupe');
const { getMarketRatesToBase } = require('../accounting/marketRates');
const { ensureSystemBoxesForCurrency } = require('../accounting/cashBoxes');

const dailyConfirmAccess = requireAnyPermission([
  ['accounts', 'view'],
  ['accounts', 'edit'],
  ['receipts', 'edit'],
  ['payments', 'edit'],
  ['journal', 'edit'],
  ['users', 'edit'],
]);

function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{3,10}$/.test(code)) {
    throw Object.assign(new Error('رمز العملة يجب أن يكون من 3 إلى 10 أحرف لاتينية'), { statusCode: 400 });
  }
  return code;
}

function parseBody(body, { partial = false } = {}) {
  const out = {};

  if (!partial || body.code !== undefined) {
    out.code = normalizeCode(body.code);
  }
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw Object.assign(new Error('اسم العملة مطلوب'), { statusCode: 400 });
    out.name = name;
  }
  if (!partial || body.nameEn !== undefined) {
    out.nameEn = body.nameEn ? String(body.nameEn).trim() : null;
  }
  if (!partial || body.nameHe !== undefined) {
    out.nameHe = body.nameHe ? String(body.nameHe).trim() : null;
  }
  if (!partial || body.symbol !== undefined) {
    const symbol = String(body.symbol || '').trim();
    if (!symbol) throw Object.assign(new Error('رمز العرض مطلوب'), { statusCode: 400 });
    if (symbol.length > 16) throw Object.assign(new Error('رمز العرض طويل جدًا'), { statusCode: 400 });
    out.symbol = symbol;
  }
  if (!partial || body.decimalPlaces !== undefined) {
    const places = Number(body.decimalPlaces ?? 2);
    if (!Number.isInteger(places) || places < 0 || places > 6) {
      throw Object.assign(new Error('عدد المنازل العشرية يجب أن يكون بين 0 و6'), { statusCode: 400 });
    }
    out.decimalPlaces = places;
  }
  if (!partial || body.isBase !== undefined) {
    out.isBase = Boolean(body.isBase);
  }
  if (!partial || body.isActive !== undefined) {
    out.isActive = body.isActive === undefined ? true : Boolean(body.isActive);
  }

  if (out.isBase) {
    out.rateToBase = 1;
  } else if (!partial || body.rateToBase !== undefined) {
    if (!partial && (body.rateToBase === undefined || body.rateToBase === null || body.rateToBase === '')) {
      throw Object.assign(new Error('يجب تحديد سعر الصرف مقابل العملة الرئيسية'), { statusCode: 400 });
    }
    const rate = Number(body.rateToBase);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw Object.assign(new Error('سعر الصرف يجب أن يكون أكبر من صفر'), { statusCode: 400 });
    }
    out.rateToBase = rate;
  }

  return out;
}

router.get(
  '/currencies',
  requireAuth,
  requireAnyPermission([
    ['accounts', 'view'],
    ['receipts', 'edit'],
    ['payments', 'edit'],
    ['journal', 'edit'],
    ['users', 'edit'],
  ]),
  async (req, res) => {
    try {
      const rows = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id, code, name, name_en, name_he, symbol, decimal_places,
                  rate_to_base, is_base, is_active, created_at
           FROM currencies
           WHERE tenant_id = $1
           ORDER BY is_base DESC, code ASC`,
          [req.user.tenantId]
        );
        return dedupeById(result.rows, 'id');
      });
      res.json(rows);
    } catch (err) {
      console.error('Listing currencies failed:', err);
      res.status(500).json({ error: 'تعذّر جلب العملات' });
    }
  }
);

router.get(
  '/currencies/rates-status',
  requireAuth,
  dailyConfirmAccess,
  async (req, res) => {
    try {
      const row = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT currency_rates_confirmed_at
           FROM tenant_settings
           WHERE tenant_id = $1`,
          [req.user.tenantId]
        );
        return result.rows[0] || null;
      });
      res.json({
        confirmedAt: row?.currency_rates_confirmed_at || null,
      });
    } catch (err) {
      if (err.code === '42703') {
        return res.json({ confirmedAt: null });
      }
      console.error('Fetching currency rates status failed:', err);
      res.status(500).json({ error: 'تعذّر جلب حالة أسعار الصرف' });
    }
  }
);

router.get(
  '/currencies/market-rates',
  requireAuth,
  dailyConfirmAccess,
  async (req, res) => {
    try {
      const payload = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id, code, is_base, is_active, rate_to_base
           FROM currencies
           WHERE tenant_id = $1 AND is_active = TRUE
           ORDER BY is_base DESC, code ASC`,
          [req.user.tenantId]
        );
        return result.rows;
      });

      const base = payload.find((c) => c.is_base) || payload[0];
      if (!base) {
        return res.status(400).json({ error: 'لا توجد عملة رئيسية — أضف عملات أولًا' });
      }

      const foreignCodes = payload.filter((c) => !c.is_base).map((c) => c.code);
      const market = await getMarketRatesToBase(base.code, foreignCodes);

      const items = payload.map((c) => {
        if (c.is_base) {
          return {
            currencyId: c.id,
            code: c.code,
            isBase: true,
            currentRate: 1,
            marketRate: 1,
          };
        }
        const marketRate = market.rates[c.code] ?? null;
        return {
          currencyId: c.id,
          code: c.code,
          isBase: false,
          currentRate: Number(c.rate_to_base),
          marketRate,
        };
      });

      res.json({
        baseCode: market.baseCode,
        provider: market.providerName,
        attributionUrl: market.attributionUrl,
        updatedAt: market.updatedAt,
        missing: market.missing,
        items,
      });
    } catch (err) {
      console.error('Fetching market rates failed:', err);
      res.status(502).json({ error: 'تعذّر جلب أسعار الصرف من المصدر الخارجي' });
    }
  }
);

router.post(
  '/currencies/daily-confirm',
  requireAuth,
  dailyConfirmAccess,
  async (req, res) => {
    const rates = Array.isArray(req.body?.rates) ? req.body.rates : null;
    if (!rates || rates.length === 0) {
      return res.status(400).json({ error: 'قائمة أسعار الصرف مطلوبة' });
    }

    try {
      let confirmedAt = null;
      await withTenantClient(req.user.tenantId, async (client) => {
        const tenantCurrencies = await client.query(
          `SELECT id, code, is_base
           FROM currencies
           WHERE tenant_id = $1`,
          [req.user.tenantId]
        );
        const byId = new Map(tenantCurrencies.rows.map((row) => [String(row.id), row]));
        const byCode = new Map(
          tenantCurrencies.rows.map((row) => [String(row.code || '').toUpperCase(), row])
        );

        for (const row of rates) {
          const currencyId = row.currencyId != null ? String(row.currencyId) : '';
          const code = String(row.code || '').trim().toUpperCase();
          const rate = Number(row.rateToBase);
          const existing = (currencyId && byId.get(currencyId))
            || (code && byCode.get(code))
            || null;
          if (!existing) {
            throw Object.assign(
              new Error(code ? `عملة غير موجودة (${code})` : 'عملة غير موجودة'),
              { statusCode: 404 }
            );
          }
          if (existing.is_base) continue;
          if (!Number.isFinite(rate) || rate <= 0) {
            throw Object.assign(new Error('سعر الصرف يجب أن يكون أكبر من صفر'), { statusCode: 400 });
          }
          await client.query(
            `UPDATE currencies
             SET rate_to_base = $2
             WHERE id = $1 AND tenant_id = $3 AND is_base = FALSE`,
            [existing.id, rate, req.user.tenantId]
          );
        }
        const stamp = await client.query(
          `UPDATE tenant_settings
           SET currency_rates_confirmed_at = now(), updated_at = now()
           WHERE tenant_id = $1
           RETURNING currency_rates_confirmed_at`,
          [req.user.tenantId]
        );
        confirmedAt = stamp.rows[0]?.currency_rates_confirmed_at || new Date().toISOString();

        const { reconcileAllForeignAccounts } = require('../accounting/fxReconciliation');
        await reconcileAllForeignAccounts(client, {
          tenantId: req.user.tenantId,
          userId: req.user.id,
          memo: 'تسوية فروق بعد تحديث أسعار الصرف',
        });
      });
      res.json({ success: true, confirmedAt });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Daily currency confirm failed:', err);
      res.status(500).json({ error: 'تعذّر حفظ تأكيد أسعار الصرف' });
    }
  }
);

router.post(
  '/currencies',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    let data;
    try {
      data = parseBody(req.body);
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      throw err;
    }

    try {
      const row = await withTenantClient(req.user.tenantId, async (client) => {
        const { namesFromBody } = require('../i18n/localizeNames');
        const names = await namesFromBody(client, req.user.tenantId, req.body);
        data.name = names.name;
        data.nameEn = names.name_en;
        data.nameHe = names.name_he;

        if (data.isBase) {
          await client.query(
            `UPDATE currencies SET is_base = FALSE WHERE tenant_id = $1 AND is_base = TRUE`,
            [req.user.tenantId]
          );
        } else {
          const base = await client.query(
            `SELECT id FROM currencies WHERE tenant_id = $1 AND is_base = TRUE LIMIT 1`,
            [req.user.tenantId]
          );
          if (base.rowCount === 0) {
            data.isBase = true;
            data.rateToBase = 1;
          }
        }

        const result = await client.query(
          `INSERT INTO currencies
             (tenant_id, code, name, name_en, name_he, symbol, decimal_places, rate_to_base, is_base, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [
            req.user.tenantId,
            data.code,
            data.name,
            data.nameEn,
            data.nameHe,
            data.symbol,
            data.decimalPlaces,
            data.rateToBase,
            data.isBase,
            data.isActive,
          ]
        );
        if (data.isBase) {
          await setBaseCurrency(client, req.user.tenantId, result.rows[0].id);
        }

        await ensureSystemBoxesForCurrency(client, req.user.tenantId, {
          id: result.rows[0].id,
          code: data.code,
          is_base: data.isBase,
        });

        return result.rows[0];
      });
      res.status(201).json({ success: true, id: row.id });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'رمز العملة مستخدم مسبقًا' });
      }
      console.error('Creating currency failed:', err);
      res.status(500).json({ error: 'تعذّر إضافة العملة' });
    }
  }
);

router.patch(
  '/currencies/:id',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    let data;
    try {
      data = parseBody(req.body, { partial: true });
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      throw err;
    }

    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT id, is_base FROM currencies WHERE id = $1 AND tenant_id = $2`,
          [req.params.id, req.user.tenantId]
        );
        if (existing.rowCount === 0) {
          throw Object.assign(new Error('العملة غير موجودة'), { statusCode: 404 });
        }
        const current = existing.rows[0];

        if (data.isBase === false && current.is_base) {
          throw Object.assign(new Error('لا يمكن إلغاء العملة الأساس دون تعيين بديل'), { statusCode: 400 });
        }
        if (data.isActive === false && (data.isBase === true || current.is_base)) {
          throw Object.assign(new Error('لا يمكن تعطيل العملة الأساس'), { statusCode: 400 });
        }

        if (data.isBase) {
          await setBaseCurrency(client, req.user.tenantId, req.params.id);
          data.rateToBase = 1;
          data.isActive = true;
        }

        if (data.name !== undefined) {
          const { namesFromBody } = require('../i18n/localizeNames');
          const names = await namesFromBody(client, req.user.tenantId, req.body);
          data.name = names.name;
          data.nameEn = names.name_en;
          data.nameHe = names.name_he;
        }

        const fields = [];
        const values = [req.params.id];
        const push = (col, val) => {
          values.push(val);
          fields.push(`${col} = $${values.length}`);
        };

        if (data.code !== undefined) push('code', data.code);
        if (data.name !== undefined) push('name', data.name);
        if (data.nameEn !== undefined) push('name_en', data.nameEn);
        if (data.nameHe !== undefined) push('name_he', data.nameHe);
        if (data.symbol !== undefined) push('symbol', data.symbol);
        if (data.decimalPlaces !== undefined) push('decimal_places', data.decimalPlaces);
        if (data.rateToBase !== undefined) push('rate_to_base', data.rateToBase);
        if (data.isBase !== undefined && !data.isBase) push('is_base', false);
        if (data.isActive !== undefined) push('is_active', data.isActive);

        if (fields.length === 0) return;

        await client.query(
          `UPDATE currencies SET ${fields.join(', ')} WHERE id = $1 AND tenant_id = $${values.length + 1}`,
          [...values, req.user.tenantId]
        );

        if (data.symbol !== undefined || data.decimalPlaces !== undefined) {
          const stillBase = await client.query(
            `SELECT is_base FROM currencies WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.user.tenantId]
          );
          if (stillBase.rows[0]?.is_base) {
            await client.query(
              `UPDATE tenant_settings
               SET currency_symbol = COALESCE($2, currency_symbol),
                   decimal_places = COALESCE($3, decimal_places),
                   updated_at = now()
               WHERE tenant_id = $1`,
              [
                req.user.tenantId,
                data.symbol !== undefined ? String(data.symbol).slice(0, 8) : null,
                data.decimalPlaces !== undefined ? data.decimalPlaces : null,
              ]
            );
          }
        }
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 400) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.code === '23505') {
        return res.status(409).json({ error: 'رمز العملة مستخدم مسبقًا' });
      }
      console.error('Updating currency failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث العملة' });
    }
  }
);

module.exports = router;
