# ADR 0005: Database Migrations As A Separate Deployment Step

- **Status:** Accepted
- **Date:** 2026-10-12
- **Related findings:** M1 in the [initial audit](../audit/2026-10-initial-audit.md)

## Context

Migrations were applied only by hand, with `dotnet ef database update`. A deployment needs a repeatable way to bring the database schema up to date before a new API version starts.

There were two options:

1. The API applies pending migrations when it starts (`Database.MigrateAsync()`).
2. Migrations are applied by a separate step before the new API version starts.

## Decision

Migrations run as a separate deployment step, from an **EF Core migration bundle**, a single executable that applies the pending migrations. The API never applies migrations itself.

CI builds a self-contained Linux bundle on every push. It applies the bundle twice to an empty SQL Server, which checks both a full run and an up-to-date run, then uploads it as an artifact. `docs/deployment.md` describes how to run it.

The EF tools and the bundle create the `DbContext` through `AppDbContextDesignTimeFactory`, not by starting the API. Without it, they would run `Program.cs` up to `Build()`. That needs the API's settings, and it made the bundle's `--connection` option unusable without them.

Migrating at startup was rejected for three reasons:

- **Several instances starting together** would all try to migrate. EF Core now takes a lock, but a slow migration would still delay or fail the health checks of every instance.
- **The API's database login would need schema-change rights.** With a separate step, only the deployment holds those rights.
- **A failing migration would stop the API from starting**, rather than failing one clearly logged deployment step before any traffic moves.

## Consequences

- **Deployment order:** each deployment must run the bundle before starting the new API version.
- **Old and new versions overlap:** a migration must keep working with the API version that is still running while it applies. Breaking changes are split over two releases.
- **Local development is unchanged.** `dotnet ef database update` still reads `appsettings.Development.json`, now through the factory.
- **Pinned tool version:** `dotnet-ef` is now a local tool in `dotnet-tools.json`, so CI and developers use the same version.
