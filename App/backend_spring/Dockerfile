# 1단계(build): Gradle + JDK 21로 jar 파일만 만든다
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
# Windows에서 체크아웃하면 gradlew가 CRLF로 바뀌어 셔뱅(#!/bin/sh)이 깨짐 → 줄바꿈 정규화 후 실행권한 부여
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew
COPY src src
RUN ./gradlew bootJar --no-daemon -x test

# 2단계(runtime): 빌드 결과(jar)만 가져와서 실행 — JDK가 아니라 더 가벼운 JRE 사용
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
