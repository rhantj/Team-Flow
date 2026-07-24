-- WorkFlow AI - 회원가입 시 이용약관 동의 시각을 저장한다.
--
-- 프론트엔드의 약관 동의 체크박스는 상세 약관 페이지를 실제로 거쳐야만 켜지도록 만들어져
-- 있지만, 그건 UI 수준의 강제일 뿐이다. 버그나 API를 직접 호출하는 우회 경로로 이 화면을
-- 거치지 않고 계정이 만들어질 가능성까지 막으려면, 서버가 회원가입 요청 자체에서 동의
-- 여부를 검증하고 그 결과를 DB에 남겨야 한다(AuthService.signup 참고). null이면 이
-- 컬럼이 생기기 전에 만들어졌거나, 애초에 이 동의 절차를 거치지 않는 경로(Google OAuth,
-- 데모 로그인)로 만들어진 계정이라는 뜻이다.

ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMP;
COMMENT ON COLUMN users.terms_agreed_at IS '이메일/비밀번호 회원가입 시 이용약관에 동의한 시각. Google OAuth/데모 계정은 이 절차를 거치지 않아 NULL';
