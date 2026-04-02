-- ══════════════════════════════════════════════════════════════════
-- 내 손안의 손해사정사 — Supabase 벡터 RAG 초기 설정
-- Supabase 대시보드 > SQL Editor에서 전체 실행하세요.
-- ══════════════════════════════════════════════════════════════════

-- 1. pgvector 확장 활성화 (신규 프로젝트는 이미 활성화돼 있을 수 있음)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 약관 청크 테이블 생성
CREATE TABLE IF NOT EXISTS policy_chunks (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id       TEXT        NOT NULL,
    doc_name     TEXT        NOT NULL,
    chunk_index  INTEGER     NOT NULL,
    chunk_text   TEXT        NOT NULL,
    embedding    vector(256),            -- 256차원 해시 임베딩
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 벡터 유사도 검색 인덱스 (HNSW — 데이터 없이도 생성 가능)
CREATE INDEX IF NOT EXISTS policy_chunks_embedding_hnsw_idx
    ON policy_chunks
    USING hnsw (embedding vector_cosine_ops);

-- 4. 코사인 유사도 검색 함수
CREATE OR REPLACE FUNCTION match_policy_chunks(
    query_embedding  vector(256),
    match_count      INT     DEFAULT 5,
    match_threshold  FLOAT   DEFAULT 0.1
)
RETURNS TABLE (
    id          UUID,
    doc_name    TEXT,
    chunk_text  TEXT,
    similarity  FLOAT
)
LANGUAGE sql
AS $$
    SELECT
        pc.id,
        pc.doc_name,
        pc.chunk_text,
        (1 - (pc.embedding <=> query_embedding))::FLOAT AS similarity
    FROM policy_chunks pc
    WHERE (1 - (pc.embedding <=> query_embedding)) > match_threshold
    ORDER BY pc.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- 5. 문서별 청크 전체 삭제 함수
CREATE OR REPLACE FUNCTION delete_policy_doc(target_doc_id TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
    DELETE FROM policy_chunks WHERE doc_id = target_doc_id;
$$;

-- 6. 저장된 문서 목록 조회 함수
CREATE OR REPLACE FUNCTION list_policy_docs()
RETURNS TABLE (
    doc_id      TEXT,
    doc_name    TEXT,
    chunk_count BIGINT,
    created_at  TIMESTAMPTZ
)
LANGUAGE sql
AS $$
    SELECT
        doc_id,
        doc_name,
        COUNT(*)       AS chunk_count,
        MIN(created_at) AS created_at
    FROM policy_chunks
    GROUP BY doc_id, doc_name
    ORDER BY MIN(created_at) DESC;
$$;

-- ══════════════════════════════════════════════════════════════════
-- 판례 DB — 금융감독원 분쟁조정 사례
-- ══════════════════════════════════════════════════════════════════

-- 7. 판례 청크 테이블 생성
CREATE TABLE IF NOT EXISTS precedent_chunks (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id       TEXT        NOT NULL,
    doc_name     TEXT        NOT NULL,
    chunk_index  INTEGER     NOT NULL,
    chunk_text   TEXT        NOT NULL,
    embedding    vector(256),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 판례 벡터 유사도 검색 인덱스
CREATE INDEX IF NOT EXISTS precedent_chunks_embedding_hnsw_idx
    ON precedent_chunks
    USING hnsw (embedding vector_cosine_ops);

-- 9. 판례 코사인 유사도 검색 함수
CREATE OR REPLACE FUNCTION match_precedent_chunks(
    query_embedding  vector(256),
    match_count      INT     DEFAULT 5,
    match_threshold  FLOAT   DEFAULT 0.1
)
RETURNS TABLE (
    id          UUID,
    doc_name    TEXT,
    chunk_text  TEXT,
    similarity  FLOAT
)
LANGUAGE sql
AS $$
    SELECT
        pc.id,
        pc.doc_name,
        pc.chunk_text,
        (1 - (pc.embedding <=> query_embedding))::FLOAT AS similarity
    FROM precedent_chunks pc
    WHERE (1 - (pc.embedding <=> query_embedding)) > match_threshold
    ORDER BY pc.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- 10. 판례 문서별 청크 전체 삭제 함수
CREATE OR REPLACE FUNCTION delete_precedent_doc(target_doc_id TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
    DELETE FROM precedent_chunks WHERE doc_id = target_doc_id;
$$;

-- 11. 저장된 판례 문서 목록 조회 함수
CREATE OR REPLACE FUNCTION list_precedent_docs()
RETURNS TABLE (
    doc_id      TEXT,
    doc_name    TEXT,
    chunk_count BIGINT,
    created_at  TIMESTAMPTZ
)
LANGUAGE sql
AS $$
    SELECT
        doc_id,
        doc_name,
        COUNT(*)        AS chunk_count,
        MIN(created_at) AS created_at
    FROM precedent_chunks
    GROUP BY doc_id, doc_name
    ORDER BY MIN(created_at) DESC;
$$;

-- ══════════════════════════════════════════════════════════════════
-- 완료! 위 SQL 실행 후 Vercel 환경변수에 아래 두 값을 추가하세요:
--   SUPABASE_URL              = https://pelhdyuodnpsmplngypp.supabase.co
--   SUPABASE_SERVICE_ROLE_KEY = (service_role JWT 키)
-- ══════════════════════════════════════════════════════════════════
