#!/usr/bin/env bash
# PR 작성자(실명)를 슬랙 유저 ID로 매핑해 멘션 문자열(<@ID>)을 출력한다.
# git 커밋 작성자 이름(%an)을 인자로 받아, 매핑에 있으면 "<@ID>"를,
# 없으면 빈 문자열을 출력한다. (알림 스텝에서 멘션 접두어로 사용)
name="$1"
case "$name" in
  "허영주") id="U0BFD300C4X" ;;
  "유소은") id="U0BFNK0QXGB" ;;
  "이은주") id="U0BFSRBPVB8" ;;
  "박상준") id="U0BFWNDS9PB" ;;
  "박지수") id="U0BFWCN2JQZ" ;;
  "곽진아") id="U0BFSDLU3D4" ;;
  "고무서") id="U0BFN067PD4" ;;
  *) id="" ;;
esac
[ -n "$id" ] && printf '<@%s>' "$id"
exit 0
