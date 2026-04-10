ALTER TABLE policy_chunks ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES insurance_contracts(id) ON DELETE CASCADE;
ALTER TABLE policy_chunks ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_policy_chunks_contract_id ON policy_chunks(contract_id);
CREATE INDEX IF NOT EXISTS idx_policy_chunks_customer_id ON policy_chunks(customer_id);
