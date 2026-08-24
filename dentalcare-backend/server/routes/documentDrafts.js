const express = require('express');
const router = express.Router();
const { requireAuth, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');

const SOURCE_TYPES = new Set([
  'RECEIPT',
  'PAYMENT',
  'PURCHASE_INVOICE',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'BANK_ENTRY',
  'JOURNAL',
]);

const EDIT_ACCESS = {
  RECEIPT: requireAnyPermission([['receipts', 'edit']]),
  PAYMENT: requireAnyPermission([['payments', 'edit']]),
  PURCHASE_INVOICE: requireAnyPermission([['payments', 'edit']]),
  CREDIT_NOTE: requireAnyPermission([['receipts', 'edit'], ['payments', 'edit'], ['journal', 'edit']]),
  DEBIT_NOTE: requireAnyPermission([['receipts', 'edit'], ['payments', 'edit'], ['journal', 'edit']]),
  BANK_ENTRY: requireAnyPermission([['journal', 'edit'], ['payments', 'edit'], ['accounts', 'edit']]),
  JOURNAL: requireAnyPermission([['journal', 'edit']]),
};

function mapRow(row) {
  return {
    id: row.id,
    sourceType: row.source_type,
    summary: row.summary || null,
    payload: row.payload || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_name || null,
  };
}

function editGuard(sourceType) {
  const guard = EDIT_ACCESS[sourceType];
  if (!guard) {
    throw Object.assign(new Error('نوع المستند غير صالح'), { statusCode: 400 });
  }
  return guard;
}

router.get('/document-drafts', requireAuth, async (req, res, next) => {
  const sourceType = String(req.query.sourceType || '');
  if (!SOURCE_TYPES.has(sourceType)) {
    return res.status(400).json({ error: 'نوع المستند غير صالح' });
  }
  return editGuard(sourceType)(req, res, async () => {
    try {
      const rows = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT d.id, d.source_type, d.summary, d.payload, d.created_at, d.updated_at,
                  u.name AS created_by_name
           FROM document_drafts d
           LEFT JOIN users u ON u.id = d.created_by AND u.tenant_id = d.tenant_id
           WHERE d.tenant_id = $1 AND d.source_type = $2
           ORDER BY d.updated_at DESC
           LIMIT 100`,
          [req.user.tenantId, sourceType]
        );
        return result.rows.map(mapRow);
      });
      res.json(rows);
    } catch (err) {
      console.error('Listing document drafts failed:', err);
      res.status(500).json({ error: 'تعذّر جلب المستندات المعلقة' });
    }
  });
});

router.get('/document-drafts/:id', requireAuth, async (req, res) => {
  try {
    const draft = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT d.id, d.source_type, d.summary, d.payload, d.created_at, d.updated_at,
                u.name AS created_by_name
         FROM document_drafts d
         LEFT JOIN users u ON u.id = d.created_by AND u.tenant_id = d.tenant_id
         WHERE d.id = $1 AND d.tenant_id = $2`,
        [req.params.id, req.user.tenantId]
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    });
    if (!draft) return res.status(404).json({ error: 'المسودة غير موجودة' });
    return editGuard(draft.sourceType)(req, res, () => {
      res.json(draft);
    });
  } catch (err) {
    console.error('Loading document draft failed:', err);
    res.status(500).json({ error: 'تعذّر جلب المسودة' });
  }
});

router.post('/document-drafts', requireAuth, async (req, res) => {
  const sourceType = String(req.body.sourceType || '');
  if (!SOURCE_TYPES.has(sourceType)) {
    return res.status(400).json({ error: 'نوع المستند غير صالح' });
  }
  if (!req.body.payload || typeof req.body.payload !== 'object') {
    return res.status(400).json({ error: 'بيانات المسودة غير صالحة' });
  }
  return editGuard(sourceType)(req, res, async () => {
    try {
      const row = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `INSERT INTO document_drafts (tenant_id, source_type, summary, payload, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, source_type, summary, payload, created_at, updated_at`,
          [
            req.user.tenantId,
            sourceType,
            req.body.summary ? String(req.body.summary).slice(0, 500) : null,
            req.body.payload,
            req.user.userId,
          ]
        );
        return mapRow({ ...result.rows[0], created_by_name: null });
      });
      res.status(201).json(row);
    } catch (err) {
      console.error('Creating document draft failed:', err);
      res.status(500).json({ error: 'تعذّر حفظ المسودة' });
    }
  });
});

router.put('/document-drafts/:id', requireAuth, async (req, res) => {
  if (!req.body.payload || typeof req.body.payload !== 'object') {
    return res.status(400).json({ error: 'بيانات المسودة غير صالحة' });
  }
  try {
    const existing = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT source_type FROM document_drafts WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.user.tenantId]
      );
      return result.rows[0] || null;
    });
    if (!existing) return res.status(404).json({ error: 'المسودة غير موجودة' });

    return editGuard(existing.source_type)(req, res, async () => {
      try {
        const row = await withTenantClient(req.user.tenantId, async (client) => {
          const result = await client.query(
            `UPDATE document_drafts
             SET summary = $3, payload = $4, updated_at = now()
             WHERE id = $1 AND tenant_id = $2
             RETURNING id, source_type, summary, payload, created_at, updated_at`,
            [
              req.params.id,
              req.user.tenantId,
              req.body.summary ? String(req.body.summary).slice(0, 500) : null,
              req.body.payload,
            ]
          );
          return result.rows[0] ? mapRow(result.rows[0]) : null;
        });
        if (!row) return res.status(404).json({ error: 'المسودة غير موجودة' });
        res.json(row);
      } catch (err) {
        console.error('Updating document draft failed:', err);
        res.status(500).json({ error: 'تعذّر تحديث المسودة' });
      }
    });
  } catch (err) {
    console.error('Updating document draft failed:', err);
    res.status(500).json({ error: 'تعذّر تحديث المسودة' });
  }
});

router.delete('/document-drafts/:id', requireAuth, async (req, res) => {
  try {
    const existing = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT source_type FROM document_drafts WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.user.tenantId]
      );
      return result.rows[0] || null;
    });
    if (!existing) return res.status(404).json({ error: 'المسودة غير موجودة' });

    return editGuard(existing.source_type)(req, res, async () => {
      try {
        const deleted = await withTenantClient(req.user.tenantId, async (client) => {
          const result = await client.query(
            `DELETE FROM document_drafts WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.user.tenantId]
          );
          return result.rowCount > 0;
        });
        if (!deleted) return res.status(404).json({ error: 'المسودة غير موجودة' });
        res.json({ success: true });
      } catch (err) {
        console.error('Deleting document draft failed:', err);
        res.status(500).json({ error: 'تعذّر حذف المسودة' });
      }
    });
  } catch (err) {
    console.error('Deleting document draft failed:', err);
    res.status(500).json({ error: 'تعذّر حذف المسودة' });
  }
});

module.exports = router;
