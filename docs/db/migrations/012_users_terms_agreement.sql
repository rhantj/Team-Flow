-- 회원가입 시 이용약관 동의 시각을 저장하기 위해 users에 컬럼 추가.
-- 서버가 회원가입 요청 자체에서 동의 여부를 검증하고(AuthService.signup 참고) 그 결과를
-- 여기에 남긴다. Google OAuth/데모 로그인 계정은 이 절차를 거치지 않아 NULL로 남는다.
-- 적용 대상: 현재 Supabase PostgreSQL (추후 OCI 자체 호스팅 이전 시 동일 스크립트 재실행)

ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMP;
COMMENT ON COLUMN users.terms_agreed_at IS '이메일/비밀번호 회원가입 시 이용약관에 동의한 시각. Google OAuth/데모 계정은 이 절차를 거치지 않아 NULL';
