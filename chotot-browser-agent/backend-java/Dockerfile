# Use the official maven/Java image to build the app
# with maven image
FROM jelastic/maven:3.9.5-openjdk-21 AS build
WORKDIR /app
COPY src /app/src
COPY pom.xml /app
RUN mvn clean package -DskipTests

# Start a new stage from scratch
FROM eclipse-temurin:21-jdk-jammy
WORKDIR /app
COPY --from=build /app/target/chotot-browser-agent-backend-0.0.1-SNAPSHOT.jar /app/chotot-browser-agent-backend-0.0.1-SNAPSHOT.jar
EXPOSE 8095
ENTRYPOINT ["java","-jar","/app/chotot-browser-agent-backend-0.0.1-SNAPSHOT.jar"]