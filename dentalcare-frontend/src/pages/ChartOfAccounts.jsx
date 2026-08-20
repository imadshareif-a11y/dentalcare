import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import PartyModal from '../components/PartyModal';
import ChartAccountForm from '../components/ChartAccountForm';

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

function buildForest(flat) {
  const byId = new Map(flat.map((a) => [a.id, { ...a, children: [] }]));
  const rootsByType = Object.fromEntries(TYPE_ORDER.map((t) => [t, []]));

  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id).children.push(node);
    } else {
      const list = rootsByType[node.account_type] || (rootsByType[node.account_type] = []);
      list.push(node);
    }
  }

  const sortRec = (nodes) => {
    nodes.sort((a, b) => (a.sort_order - b.sort_order) || String(a.account_code).localeCompare(String(b.account_code)));
    nodes.forEach((n) => sortRec(n.children));
  };
  TYPE_ORDER.forEach((t) => sortRec(rootsByType[t] || []));
  return { byId, rootsByType };
}

function collectIds(nodes, into = new Set()) {
  for (const n of nodes) {
    into.add(n.id);
    collectIds(n.children, into);
  }
  return into;
}

function matchesQuery(node, q, displayName) {
  if (!q) return true;
  const hay = `${node.account_code} ${displayName(node)}`.toLowerCase();
  return hay.includes(q);
}

function filterTree(nodes, q, displayName) {
  if (!q) return nodes;
  const out = [];
  for (const n of nodes) {
    const kids = filterTree(n.children, q, displayName);
    if (matchesQuery(n, q, displayName) || kids.length) {
      out.push({ ...n, children: kids });
    }
  }
  return out;
}

function TreeNode({
  node,
  depth,
  expanded,
  toggle,
  canEdit,
  displayName,
  selectedId,
  onSelect,
  onAddChild,
  onEdit,
  onDelete,
  dragId,
  setDragId,
  onDropOn,
}) {
  const { t } = useTranslation();
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.id);
  const isDragging = dragId === node.id;

  return (
    <div className="dc-coa-branch">
      <div
        className={`dc-coa-row${selectedId === node.id ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}${!node.is_active ? ' is-inactive' : ''}`}
        style={{ paddingInlineStart: 12 + depth * 18 }}
        draggable={canEdit}
        onDragStart={(e) => {
          setDragId(node.id);
          e.dataTransfer.setData('text/plain', node.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => setDragId(null)}
        onDragOver={(e) => {
          if (!canEdit || !dragId || dragId === node.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const from = e.dataTransfer.getData('text/plain') || dragId;
          if (from) onDropOn(from, node.id);
          setDragId(null);
        }}
        onClick={() => onSelect(node.id)}
      >
        <button
          type="button"
          className="dc-coa-twist"
          onClick={(e) => {
            e.stopPropagation();
            if (hasKids) toggle(node.id);
          }}
          aria-label={open ? 'collapse' : 'expand'}
        >
          {hasKids ? (
            <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'}`} />
          ) : (
            <span className="dc-coa-leaf-dot" />
          )}
        </button>

        <span className="dc-coa-code">{node.account_code}</span>
        <span className="dc-coa-name">
          {displayName(node)}
          {node.is_group && <em className="dc-coa-tag">{t('chart_group_tag')}</em>}
          {node.party_type && <em className="dc-coa-tag">{node.party_type}</em>}
        </span>

        {canEdit && (
          <span className="dc-coa-actions" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="dc-icon-btn dc-icon-btn-sm" title={t('chart_add_child')} onClick={() => onAddChild(node)}>
              <i className="fa-solid fa-plus" />
            </button>
            <button type="button" className="dc-icon-btn dc-icon-btn-sm" title={t('party_edit')} onClick={() => onEdit(node)}>
              <i className="fa-solid fa-pen" />
            </button>
            <button type="button" className="dc-icon-btn dc-icon-btn-sm" title={t('chart_delete')} onClick={() => onDelete(node)}>
              <i className="fa-solid fa-trash" />
            </button>
          </span>
        )}
      </div>

      {hasKids && open && (
        <div className="dc-coa-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              canEdit={canEdit}
              displayName={displayName}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              dragId={dragId}
              setDragId={setDragId}
              onDropOn={onDropOn}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChartOfAccounts({ canEdit = true, onAccountsChanged }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set(TYPE_ORDER.map((t) => `type:${t}`)));
  const [selectedId, setSelectedId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [parentHint, setParentHint] = useState(null);
  const [defaultType, setDefaultType] = useState('ASSET');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/chart-tree', { includeInactive: '1' });
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const displayName = useCallback((row) => {
    const lang = i18n.language;
    if (lang === 'en' && row.account_name_en) return row.account_name_en;
    if (lang === 'he' && row.account_name_he) return row.account_name_he;
    return row.account_name_ar || row.account_name || row.account_code;
  }, [i18n.language]);

  const { rootsByType, byId } = useMemo(() => buildForest(rows), [rows]);

  const q = query.trim().toLowerCase();
  const visibleRoots = useMemo(() => {
    const out = {};
    for (const type of TYPE_ORDER) {
      out[type] = filterTree(rootsByType[type] || [], q, displayName);
    }
    return out;
  }, [rootsByType, q, displayName]);

  useEffect(() => {
    if (!q) return;
    const next = new Set(expanded);
    for (const type of TYPE_ORDER) {
      collectIds(visibleRoots[type] || [], next);
      next.add(`type:${type}`);
    }
    setExpanded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    const next = new Set(TYPE_ORDER.map((t) => `type:${t}`));
    collectIds(Object.values(rootsByType).flat(), next);
    setExpanded(next);
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function openAddRoot(type) {
    setEditing(null);
    setParentHint(null);
    setDefaultType(type);
    setModalOpen(true);
  }

  function openAddChild(node) {
    setEditing(null);
    setParentHint(node);
    setDefaultType(node.account_type);
    setModalOpen(true);
  }

  function openEdit(node) {
    setEditing(node);
    setParentHint(null);
    setDefaultType(node.account_type);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setParentHint(null);
  }

  async function handleSaved() {
    await load();
    onAccountsChanged?.();
    closeModal();
  }

  async function handleDelete(node) {
    if (!confirm(t('chart_confirm_delete', { code: node.account_code, name: displayName(node) }))) return;
    try {
      await api.delete(`/chart-tree/${node.id}`);
      await load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function handleDropOn(fromId, ontoId) {
    if (!fromId || !ontoId || fromId === ontoId) return;
    const from = byId.get(fromId);
    if (!from) return;
    try {
      await api.patch(`/chart-tree/${fromId}`, { parentId: ontoId });
      setExpanded((prev) => new Set(prev).add(ontoId));
      await load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function handleDropOnType(fromId, type) {
    if (!fromId) return;
    try {
      await api.patch(`/chart-tree/${fromId}`, { parentId: null, accountType: type });
      setExpanded((prev) => new Set(prev).add(`type:${type}`));
      await load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  return (
    <div className="space-y-4 dc-coa">
      <div className="dc-party-head">
        <h3>{t('chart_tree_title')}</h3>
        {canEdit && (
          <button type="button" className="dc-icon-btn" onClick={() => openAddRoot('ASSET')} title={t('chart_add')}>
            <i className="fa-solid fa-plus" />
          </button>
        )}
      </div>
      <p className="dc-muted text-sm">{t('chart_tree_hint')}</p>

      <div className="dc-coa-toolbar">
        <input
          type="search"
          placeholder={t('chart_search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="dc-ghost" onClick={expandAll}>{t('chart_expand_all')}</button>
        <button type="button" className="dc-ghost" onClick={collapseAll}>{t('chart_collapse_all')}</button>
      </div>

      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div className="dc-error">{error}</div>}

      {!loading && !error && (
        <div className="dc-coa-tree">
          {TYPE_ORDER.map((type) => {
            const typeKey = `type:${type}`;
            const open = expanded.has(typeKey);
            const kids = visibleRoots[type] || [];
            return (
              <div key={type} className="dc-coa-type">
                <div
                  className="dc-coa-type-head"
                  onDragOver={(e) => {
                    if (!canEdit || !dragId) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = e.dataTransfer.getData('text/plain') || dragId;
                    if (from) handleDropOnType(from, type);
                    setDragId(null);
                  }}
                >
                  <button type="button" className="dc-coa-twist" onClick={() => toggle(typeKey)}>
                    <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'}`} />
                  </button>
                  <strong>{t(`chart_type_${type.toLowerCase()}`)}</strong>
                  <span className="dc-muted text-sm">({kids.length})</span>
                  {canEdit && (
                    <button
                      type="button"
                      className="dc-icon-btn dc-icon-btn-sm"
                      title={t('chart_add_under_type')}
                      onClick={() => openAddRoot(type)}
                    >
                      <i className="fa-solid fa-plus" />
                    </button>
                  )}
                </div>
                {open && (
                  <div className="dc-coa-children">
                    {kids.length === 0 && (
                      <div className="dc-coa-empty">{t('chart_type_empty')}</div>
                    )}
                    {kids.map((node) => (
                      <TreeNode
                        key={node.id}
                        node={node}
                        depth={0}
                        expanded={expanded}
                        toggle={toggle}
                        canEdit={canEdit}
                        displayName={displayName}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onAddChild={openAddChild}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        dragId={dragId}
                        setDragId={setDragId}
                        onDropOn={handleDropOn}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <PartyModal
          open={modalOpen}
          title={editing ? t('chart_edit') : t('chart_add')}
          onClose={closeModal}
        >
          <ChartAccountForm
            record={editing}
            parentHint={parentHint}
            defaultType={defaultType}
            onSaved={handleSaved}
            onCancel={closeModal}
          />
        </PartyModal>
      )}
    </div>
  );
}
