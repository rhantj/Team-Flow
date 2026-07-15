package com.workflowai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.Map;
import org.junit.jupiter.api.Test;

class DatabaseUrlPropertyMapperTest {

    @Test
    void convertsDatabaseUrlToSpringDatasourceProperties() {
        Map<String, String> properties = DatabaseUrlPropertyMapper.toSpringProperties(Map.of(
            "DATABASE_URL",
            "postgresql://postgres.zzfcnbbzmbxzxptxghhq:p%40ssword@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
        ));

        assertEquals(
            "jdbc:postgresql://aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require",
            properties.get("spring.datasource.url")
        );
        assertEquals("postgres.zzfcnbbzmbxzxptxghhq", properties.get("spring.datasource.username"));
        assertEquals("p@ssword", properties.get("spring.datasource.password"));
    }

    @Test
    void convertsPgVariablesToSpringDatasourceProperties() {
        Map<String, String> properties = DatabaseUrlPropertyMapper.toSpringProperties(Map.of(
            "PGHOST", "postgres.internal",
            "PGPORT", "5432",
            "PGDATABASE", "workflow",
            "PGUSER", "postgres",
            "PGPASSWORD", "root"
        ));

        assertEquals("jdbc:postgresql://postgres.internal:5432/workflow", properties.get("spring.datasource.url"));
        assertEquals("postgres", properties.get("spring.datasource.username"));
        assertEquals("root", properties.get("spring.datasource.password"));
    }

    @Test
    void keepsExplicitSpringDatasourceUrlUntouched() {
        Map<String, String> properties = DatabaseUrlPropertyMapper.toSpringProperties(Map.of(
            "SPRING_DATASOURCE_URL", "jdbc:postgresql://db:5432/workflow",
            "DATABASE_URL", "postgresql://ignored:ignored@localhost:5432/ignored"
        ));

        assertFalse(properties.containsKey("spring.datasource.url"));
    }

    @Test
    void prefersPrivateDatabaseUrlOverPublicCandidates() {
        Map<String, String> properties = DatabaseUrlPropertyMapper.toSpringProperties(Map.of(
            "DATABASE_URL", "postgresql://public:secret@containers-us-west.railway.app:5432/railway",
            "DATABASE_PRIVATE_URL", "postgresql://private:secret@postgres.railway.internal:5432/railway"
        ));

        assertEquals(
            "jdbc:postgresql://postgres.railway.internal:5432/railway",
            properties.get("spring.datasource.url")
        );
        assertEquals("private", properties.get("spring.datasource.username"));
    }

    @Test
    void replacesLocalhostSpringDatasourceUrlWithRailwayDatabaseUrl() {
        Map<String, String> properties = DatabaseUrlPropertyMapper.toSpringProperties(Map.of(
            "SPRING_DATASOURCE_URL", "jdbc:postgresql://localhost:5432/workflow",
            "DATABASE_PRIVATE_URL", "postgresql://railway:secret@postgres.railway.internal:5432/railway"
        ));

        assertEquals(
            "jdbc:postgresql://postgres.railway.internal:5432/railway",
            properties.get("spring.datasource.url")
        );
        assertEquals("railway", properties.get("spring.datasource.username"));
        assertEquals("secret", properties.get("spring.datasource.password"));
    }

    @Test
    void convertsRailwayPostgresVariablesToSpringDatasourceProperties() {
        Map<String, String> properties = DatabaseUrlPropertyMapper.toSpringProperties(Map.of(
            "SPRING_DATASOURCE_URL", "jdbc:postgresql://localhost:5432/workflow",
            "POSTGRES_HOST", "postgres.railway.internal",
            "POSTGRES_PORT", "5432",
            "POSTGRES_DATABASE", "railway",
            "POSTGRES_USER", "railway",
            "POSTGRES_PASSWORD", "secret"
        ));

        assertEquals("jdbc:postgresql://postgres.railway.internal:5432/railway", properties.get("spring.datasource.url"));
        assertEquals("railway", properties.get("spring.datasource.username"));
        assertEquals("secret", properties.get("spring.datasource.password"));
    }
}
