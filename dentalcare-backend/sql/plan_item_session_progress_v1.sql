-- Multi-session plan items: link session lines to plan items; status IN_PROGRESS is app-level (VARCHAR).

ALTER TABLE clinical_session_items
  ADD COLUMN IF NOT EXISTS plan_item_id UUID REFERENCES treatment_plan_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_session_items_plan_item
  ON clinical_session_items(plan_item_id);
