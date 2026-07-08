#!/usr/bin/env bash
# PR 작성자(GitHub 아이디)를 슬랙 유저 ID로 매핑해 멘션 문자열(<@ID>)을 출력한다.
# GitHub Actions에서 확실히 얻을 수 있는 GITHUB_ACTOR(=PR 작성자 아이디)를
# 인자로 받아, 매핑에 있으면 "<@ID>"를, 없으면 빈 문자열을 출력한다.
# (한글 실명은 러너 환경에 따라 인코딩이 어긋나 매칭이 깨질 수 있어 아이디로 매핑)
handle="$1"
case "$handle" in
  "rhantj")            id="U0BFN067PD4" ;;  # 고무서
  "dldmswn0293-stack") id="U0BFSRBPVB8" ;;  # 이은주
  "jjssspark")         id="U0BFWCN2JQZ" ;;  # 박지수
  "youngzoogit")       id="U0BFD300C4X" ;;  # 허영주
  "Plain-aube")        id="U0BFNK0QXGB" ;;  # 유소은
  "JinAh Kwak")        id="U0BFSDLU3D4" ;;  # 곽진아 (실제 GitHub 로그인 아이디 확인 필요)
  # TODO: 박상준 GitHub 아이디 매핑 추가 -> U0BFWNDS9PB
  *) id="" ;;
esac
[ -n "$id" ] && printf '<@%s>' "$id"
exit 0
