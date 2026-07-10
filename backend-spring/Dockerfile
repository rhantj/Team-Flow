# 회의록 AI Spring Boot 백엔드 배포용 이미지.
# 빌드 컨텍스트는 backend-spring/ 디렉터리 기준이다 (docker build -f backend-spring/Dockerfile backend-spring).
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
