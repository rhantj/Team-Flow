#!/bin/sh
set -eu

validate_password() {
  variable_name="$1"
  value="$2"

  if [ "${#value}" -lt 32 ] || [ "${#value}" -gt 128 ]; then
    printf '%s\n' "${variable_name} must contain 32 to 128 characters" >&2
    exit 1
  fi

  case "${value}" in
    *[!A-Za-z0-9_-]*)
      printf '%s\n' "${variable_name} contains unsupported characters" >&2
      exit 1
      ;;
  esac
}

: "${REDIS_ADMIN_PASSWORD:?REDIS_ADMIN_PASSWORD is required}"
: "${REDIS_SPRING_PASSWORD:?REDIS_SPRING_PASSWORD is required}"
: "${REDIS_FASTAPI_PASSWORD:?REDIS_FASTAPI_PASSWORD is required}"

validate_password REDIS_ADMIN_PASSWORD "${REDIS_ADMIN_PASSWORD}"
validate_password REDIS_SPRING_PASSWORD "${REDIS_SPRING_PASSWORD}"
validate_password REDIS_FASTAPI_PASSWORD "${REDIS_FASTAPI_PASSWORD}"

if [ "${REDIS_ADMIN_PASSWORD}" = "${REDIS_SPRING_PASSWORD}" ] \
  || [ "${REDIS_ADMIN_PASSWORD}" = "${REDIS_FASTAPI_PASSWORD}" ] \
  || [ "${REDIS_SPRING_PASSWORD}" = "${REDIS_FASTAPI_PASSWORD}" ]; then
  printf '%s\n' "Redis ACL passwords must be distinct" >&2
  exit 1
fi

acl_dir=/run/workflow-redis
acl_file="${acl_dir}/users.acl"
acl_tmp="${acl_dir}/users.acl.tmp"
template=/usr/local/etc/redis/users.acl.template

umask 077
mkdir -p "${acl_dir}"
chmod 700 "${acl_dir}"

awk '
  {
    gsub(/__ADMIN_PASSWORD__/, ENVIRON["REDIS_ADMIN_PASSWORD"])
    gsub(/__SPRING_PASSWORD__/, ENVIRON["REDIS_SPRING_PASSWORD"])
    gsub(/__FASTAPI_PASSWORD__/, ENVIRON["REDIS_FASTAPI_PASSWORD"])
    print
  }
' "${template}" >"${acl_tmp}"

if grep -Eq '__[A-Z_]+PASSWORD__' "${acl_tmp}"; then
  printf '%s\n' "Redis ACL template contains an unresolved placeholder" >&2
  exit 1
fi

chown redis:redis "${acl_dir}" "${acl_tmp}"
chmod 600 "${acl_tmp}"
mv "${acl_tmp}" "${acl_file}"

exec /usr/local/bin/docker-entrypoint.sh "$@" --aclfile "${acl_file}"
