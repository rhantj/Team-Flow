package com.workflowai.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * application.yml의 spring.flyway.baseline-version은 Flyway 도입 시점(20260721_1)에 한 번
 * 고정하고 이후로는 절대 올리면 안 된다. 예전에는 "새 마이그레이션을 추가할 때마다 이 값을
 * 그 버전으로 올려라"고 안내했는데, 그렇게 하면 baseline-on-migrate가 그 새 마이그레이션까지
 * "baseline 이하 = 이미 적용됨"으로 오분류해 건너뛰어 버린다 — Flyway를 그 시점 이후에 처음
 * 켜는(baseline을 새로 잡는) DB에서는 그 마이그레이션이 실제로 한 번도 실행되지 않아 스키마가
 * 누락되고, JPA ddl-auto=validate가 그 컬럼/테이블을 찾지 못해 애플리케이션이 기동 실패한다
 * (코드 리뷰 지적사항). 이 테스트는 운영에서 쓰는 Postgres 전용 SQL이 아니라 Flyway의 실제
 * baseline-on-migrate 로직만, 두 시나리오(고정 baseline / 잘못 올린 baseline)로 직접 재현해
 * 검증한다.
 */
class FlywayBaselineStrategyTest {

    @TempDir
    Path migrationsDir;

    private String newDatabaseUrl() {
        return "jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1";
    }

    /** Flyway 도입 이전에 이미 존재했던 스키마(legacy_marker)를 흉내낸, 이력 테이블이 없는 DB. */
    private void seedPreFlywaySchema(String url) throws Exception {
        try (Connection conn = DriverManager.getConnection(url, "sa", "");
             Statement st = conn.createStatement()) {
            st.execute("CREATE TABLE legacy_marker (id INT PRIMARY KEY)");
        }
    }

    /** V20260721_1(baseline 대상, 이미 적용된 것으로 취급)과 그 이후 새 마이그레이션 하나를 준비한다. */
    private void writeMigrationFiles() throws Exception {
        Files.writeString(
            migrationsDir.resolve("V20260721_1__legacy_baseline.sql"),
            "CREATE TABLE IF NOT EXISTS legacy_marker (id INT PRIMARY KEY);\n"
        );
        Files.writeString(
            migrationsDir.resolve("V20260722_1__new_feature_table.sql"),
            "CREATE TABLE new_feature (id INT PRIMARY KEY);\n"
        );
    }

    private boolean tableExists(String url, String tableName) throws Exception {
        try (Connection conn = DriverManager.getConnection(url, "sa", "");
             Statement st = conn.createStatement()) {
            ResultSet rs = st.executeQuery(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '" + tableName + "'"
            );
            rs.next();
            return rs.getInt(1) == 1;
        }
    }

    @Test
    void fixedBaselineVersionStillAppliesMigrationsAddedAfterIt() throws Exception {
        String url = newDatabaseUrl();
        seedPreFlywaySchema(url);
        writeMigrationFiles();

        // application.yml과 동일한 전략: baseline-version을 Flyway 도입 시점 버전으로 고정한다.
        Flyway flyway = Flyway.configure()
            .dataSource(url, "sa", "")
            .locations("filesystem:" + migrationsDir)
            .baselineOnMigrate(true)
            .baselineVersion("20260721_1")
            .load();

        flyway.migrate();

        assertThat(tableExists(url, "NEW_FEATURE"))
            .as("baseline 이후에 추가된 마이그레이션은 baseline을 뒤늦게 잡는 DB에서도 반드시 적용돼야 한다")
            .isTrue();
    }

    @Test
    void bumpingBaselineVersionToMatchNewMigrationIncorrectlySkipsIt() throws Exception {
        String url = newDatabaseUrl();
        seedPreFlywaySchema(url);
        writeMigrationFiles();

        // 예전에 안내했던(잘못된) 절차: "새 마이그레이션을 추가했으니 baseline-version도 그
        // 버전으로 올린다".
        Flyway flyway = Flyway.configure()
            .dataSource(url, "sa", "")
            .locations("filesystem:" + migrationsDir)
            .baselineOnMigrate(true)
            .baselineVersion("20260722_1")
            .load();

        flyway.migrate();

        assertThat(tableExists(url, "NEW_FEATURE"))
            .as("이게 바로 리뷰가 지적한 버그다 — baseline-version을 새 마이그레이션 버전으로 "
                + "올리면 그 마이그레이션 자체가 '이미 적용됨'으로 오분류돼 건너뛰어지고, "
                + "스키마가 누락된 채로 애플리케이션이 기동한다.")
            .isFalse();
    }
}
