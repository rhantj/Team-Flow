package com.workflowai;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class DatabaseUrlPropertyMapper {
    private static final String SPRING_DATASOURCE_URL = "spring.datasource.url";
    private static final String SPRING_DATASOURCE_USERNAME = "spring.datasource.username";
    private static final String SPRING_DATASOURCE_PASSWORD = "spring.datasource.password";
    private static final List<String> DATABASE_URL_KEYS = List.of(
        "DATABASE_PRIVATE_URL",
        "RAILWAY_DATABASE_URL",
        "DATABASE_URL",
        "POSTGRES_URL",
        "POSTGRESQL_URL",
        "DATABASE_PUBLIC_URL"
    );

    private DatabaseUrlPropertyMapper() {
    }

    static void apply() {
        Map<String, String> properties = toSpringProperties(System.getenv());
        properties.forEach((key, value) -> {
            if (!hasText(System.getProperty(key))) {
                System.setProperty(key, value);
            }
        });
    }

    static Map<String, String> toSpringProperties(Map<String, String> env) {
        Map<String, String> springDatasourceProperties = fromDatabaseUrl(env.get("SPRING_DATASOURCE_URL"));
        if (isRemotePostgresProperties(springDatasourceProperties)) {
            return env.get("SPRING_DATASOURCE_URL").startsWith("jdbc:postgresql://")
                ? Map.of()
                : springDatasourceProperties;
        }

        List<Map<String, String>> databaseUrlCandidates = databaseUrlCandidates(env);
        Map<String, String> remoteDatabaseUrl = firstRemotePostgresProperties(databaseUrlCandidates);
        if (!remoteDatabaseUrl.isEmpty()) {
            return remoteDatabaseUrl;
        }

        Map<String, String> pgProperties = fromPgVariables(env);
        if (isRemotePostgresProperties(pgProperties)) {
            return pgProperties;
        }

        if (!springDatasourceProperties.isEmpty()) {
            return springDatasourceProperties;
        }
        if (!databaseUrlCandidates.isEmpty()) {
            return databaseUrlCandidates.get(0);
        }
        return pgProperties;
    }

    private static List<Map<String, String>> databaseUrlCandidates(Map<String, String> env) {
        List<Map<String, String>> candidates = new ArrayList<>();
        for (String key : DATABASE_URL_KEYS) {
            Map<String, String> candidate = fromDatabaseUrl(env.get(key));
            if (!candidate.isEmpty()) {
                candidates.add(candidate);
            }
        }
        return candidates;
    }

    private static Map<String, String> firstRemotePostgresProperties(List<Map<String, String>> candidates) {
        for (Map<String, String> candidate : candidates) {
            if (isRemotePostgresProperties(candidate)) {
                return candidate;
            }
        }
        return Map.of();
    }

    private static boolean isRemotePostgresProperties(Map<String, String> properties) {
        return !properties.isEmpty() && !isLocalPostgresUrl(properties.get(SPRING_DATASOURCE_URL));
    }

    private static Map<String, String> fromDatabaseUrl(String databaseUrl) {
        Map<String, String> properties = new LinkedHashMap<>();
        if (!hasText(databaseUrl)) {
            return properties;
        }
        if (databaseUrl.startsWith("jdbc:postgresql://")) {
            properties.put(SPRING_DATASOURCE_URL, databaseUrl);
            return properties;
        }

        URI uri;
        try {
            uri = URI.create(databaseUrl);
        } catch (IllegalArgumentException ignored) {
            return properties;
        }

        String scheme = uri.getScheme();
        if (!"postgres".equals(scheme) && !"postgresql".equals(scheme)) {
            return properties;
        }

        String host = uri.getHost();
        if (!hasText(host)) {
            return properties;
        }

        int port = uri.getPort() < 0 ? 5432 : uri.getPort();
        String path = hasText(uri.getRawPath()) ? uri.getRawPath() : "/postgres";
        String query = hasText(uri.getRawQuery()) ? "?" + uri.getRawQuery() : "";
        properties.put(SPRING_DATASOURCE_URL, "jdbc:postgresql://" + host + ":" + port + path + query);

        String rawUserInfo = uri.getRawUserInfo();
        if (hasText(rawUserInfo)) {
            int separator = rawUserInfo.indexOf(':');
            String username = separator < 0 ? rawUserInfo : rawUserInfo.substring(0, separator);
            String password = separator < 0 ? "" : rawUserInfo.substring(separator + 1);
            putIfHasText(properties, SPRING_DATASOURCE_USERNAME, decode(username));
            putIfHasText(properties, SPRING_DATASOURCE_PASSWORD, decode(password));
        }

        return properties;
    }

    private static boolean isLocalPostgresUrl(String url) {
        if (!hasText(url)) {
            return false;
        }
        String normalized = url.replace("jdbc:", "");
        URI uri;
        try {
            uri = URI.create(normalized);
        } catch (IllegalArgumentException ignored) {
            return false;
        }

        String host = uri.getHost();
        return "localhost".equalsIgnoreCase(host)
            || "127.0.0.1".equals(host)
            || "0.0.0.0".equals(host)
            || "::1".equals(host);
    }

    private static Map<String, String> fromPgVariables(Map<String, String> env) {
        Map<String, String> properties = new LinkedHashMap<>();
        String host = firstText(env.get("PGHOST"), env.get("POSTGRES_HOST"), env.get("POSTGRESQL_HOST"));
        String database = firstText(env.get("PGDATABASE"), env.get("POSTGRES_DB"), env.get("POSTGRES_DATABASE"), env.get("POSTGRESQL_DATABASE"));
        if (!hasText(host) || !hasText(database)) {
            return properties;
        }

        String port = firstText(env.get("PGPORT"), env.get("POSTGRES_PORT"), env.get("POSTGRESQL_PORT"), "5432");
        String sslMode = hasText(env.get("PGSSLMODE")) ? "?sslmode=" + env.get("PGSSLMODE") : "";
        properties.put(SPRING_DATASOURCE_URL, "jdbc:postgresql://" + host + ":" + port + "/" + database + sslMode);
        putIfHasText(properties, SPRING_DATASOURCE_USERNAME, firstText(env.get("PGUSER"), env.get("POSTGRES_USER"), env.get("POSTGRESQL_USER")));
        putIfHasText(properties, SPRING_DATASOURCE_PASSWORD, firstText(env.get("PGPASSWORD"), env.get("POSTGRES_PASSWORD"), env.get("POSTGRESQL_PASSWORD")));
        return properties;
    }

    private static void putIfHasText(Map<String, String> properties, String propertyKey, String value) {
        if (hasText(value)) {
            properties.put(propertyKey, value);
        }
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (hasText(value)) {
                return value;
            }
        }
        return null;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
