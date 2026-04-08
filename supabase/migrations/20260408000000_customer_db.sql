-- 고객 보장 데이터베이스

-- 고객 기본정보
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  birth_date DATE,
  gender TEXT CHECK (gender IN ('남', '여')),
  phone TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 보험 계약
CREATE TABLE IF NOT EXISTS insurance_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  insurer TEXT NOT NULL,
  product_name TEXT NOT NULL,
  contract_date DATE,
  expiry_date DATE,
  insured_name TEXT,
  policyholder TEXT,
  premium_monthly INTEGER,
  status TEXT DEFAULT '정상',
  silson_generation TEXT,
  policy_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 특약별 보장 상세
CREATE TABLE IF NOT EXISTS coverage_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES insurance_contracts(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subcategory TEXT,
  coverage_name TEXT NOT NULL,
  coverage_amount INTEGER,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 청구 이력
CREATE TABLE IF NOT EXISTS claim_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES insurance_contracts(id),
  claim_date DATE NOT NULL,
  hospital_name TEXT,
  hospital_grade TEXT,
  diagnosis TEXT,
  total_amount INTEGER,
  insured_covered INTEGER,
  non_insured INTEGER,
  insurance_paid INTEGER,
  silson_generation TEXT,
  receipt_images TEXT[],
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_history ENABLE ROW LEVEL SECURITY;

-- 모든 접근 허용 (설계사 단독 사용 환경)
CREATE POLICY "allow_all" ON customers FOR ALL USING (true);
CREATE POLICY "allow_all" ON insurance_contracts FOR ALL USING (true);
CREATE POLICY "allow_all" ON coverage_details FOR ALL USING (true);
CREATE POLICY "allow_all" ON claim_history FOR ALL USING (true);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
