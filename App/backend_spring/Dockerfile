# 회의록 AI Spring Boot 백엔드 배포용 이미지.
# 빌드 컨텍스트는 backend_spring/ 디렉터리 기준이다 (docker build -f backend_spring/Dockerfile backend_spring).
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY gradlew .
COPY gradle ./gradle
COPY build.gradle settings.gradle .
RUN ./gradlew --no-daemon dependencies
COPY src ./src
RUN ./gradlew --no-daemon clean bootJar -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
