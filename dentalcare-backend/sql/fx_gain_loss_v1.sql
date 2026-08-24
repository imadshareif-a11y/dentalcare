-- حساب فروق العملات + إعداد العيادة
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS fx_gain_loss_account_id UUID;
