# Builds the API and migrator images. Run from the repository root:
#
#   docker build -f backend/Dockerfile --target api .
#   docker build -f backend/Dockerfile --target migrator .
#
# Neither image contains secrets: settings come from environment variables
# when the container starts. See docs/deployment.md.

ARG DOTNET_VERSION=10.0

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS build
WORKDIR /src

# Restore first, so the dependency layer is reused until a project file changes.
COPY dotnet-tools.json ./
COPY backend/ResourceReservation.Api/ResourceReservation.Api.csproj backend/ResourceReservation.Api/
RUN dotnet tool restore \
    && dotnet restore backend/ResourceReservation.Api/ResourceReservation.Api.csproj

COPY backend/ResourceReservation.Api/ backend/ResourceReservation.Api/

FROM build AS publish-api
RUN dotnet publish backend/ResourceReservation.Api/ResourceReservation.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /out/api \
    /p:UseAppHost=false

# The same migration bundle that CI builds and checks (ADR 0005).
FROM build AS publish-migrator
RUN dotnet ef migrations bundle \
    --project backend/ResourceReservation.Api \
    --startup-project backend/ResourceReservation.Api \
    --configuration Release \
    --self-contained \
    --target-runtime linux-x64 \
    --output /out/migrator/efbundle

# The API listens on plain HTTP port 8080, behind the nginx reverse proxy.
FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION} AS api
WORKDIR /app

# Where the PickupDirectory sender writes emails and the Data Protection keys
# are kept, owned by the non-root user so named volumes mounted here are
# writable.
RUN mkdir -p /var/lib/resource-reservation/emails /var/lib/resource-reservation/keys \
    && chown -R "$APP_UID" /var/lib/resource-reservation

COPY --from=publish-api /out/api ./

ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "ResourceReservation.Api.dll"]

# A one-shot container that applies pending migrations, then exits. The
# connection string comes from ConnectionStrings__DefaultConnection.
FROM mcr.microsoft.com/dotnet/runtime-deps:${DOTNET_VERSION} AS migrator
WORKDIR /app

COPY --from=publish-migrator /out/migrator/efbundle ./efbundle

# The design-time factory reads appsettings.{environment}.json, and defaults
# to Development. No settings files are in this image either way.
ENV ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_BUNDLE_EXTRACT_BASE_DIR=/tmp
USER $APP_UID
ENTRYPOINT ["./efbundle"]
