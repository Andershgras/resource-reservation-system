# Resource Reservation System

A full-stack resource reservation system built with ASP.NET Core Web API, SQL Server, React, TypeScript, and JWT authentication.

## About

Resource Reservation System is a generic booking platform where users can reserve available time slots for different resources.

The project is designed as a portfolio project to demonstrate backend development, database design, authentication, authorization, and frontend integration in a realistic full-stack application.

## Planned Features

- User registration and login
- JWT authentication
- Role-based access for admins and users
- Admins can create and manage resources
- Admins can define resource availability
- Users can view resources and available time slots
- Users can create reservations
- Users can view and cancel their own reservations
- Admins can view and manage reservations
- Reservation overlap prevention

## Tech Stack

### Backend

- ASP.NET Core Web API
- C#
- Entity Framework Core
- SQL Server LocalDB
- JWT authentication
- Swagger / OpenAPI

### Frontend

- React
- TypeScript
- Vite

### Tools

- Visual Studio
- SQL Server Management Studio
- GitHub

## Project Goal

The goal of this project is to build a realistic full-stack web application that shows practical skills with API development, relational databases, authentication, authorization, and frontend development.

## Backend Status

The first backend MVP is implemented.

The backend is located in:

```text
backend/ResourceReservation.Api
```

It contains:

- ASP.NET Core Web API controllers
- Entity Framework Core database access
- SQL Server LocalDB persistence
- JWT login and protected endpoints
- Role-based authorization for Admin and User behavior
- Swagger setup with JWT authorization support
- DTOs for request and response contracts

## Backend Structure

```text
backend/ResourceReservation.Api
├── Controllers
│   ├── AuthController.cs
│   ├── ResourcesController.cs
│   ├── AvailabilitiesController.cs
│   └── ReservationsController.cs
├── Data
│   └── AppDbContext.cs
├── DTOs
│   ├── AuthResponseDto.cs
│   ├── UserResponseDto.cs
│   ├── CreateResourceDto.cs
│   ├── UpdateResourceDto.cs
│   ├── ResourceResponseDto.cs
│   ├── CreateAvailabilityDto.cs
│   ├── UpdateAvailabilityDto.cs
│   ├── AvailabilityResponseDto.cs
│   ├── CreateReservationDto.cs
│   └── ReservationResponseDto.cs
├── Models
│   ├── User.cs
│   ├── Resource.cs
│   ├── Availability.cs
│   ├── Reservation.cs
│   └── ReservationStatuses.cs
└── Migrations
```

## Backend Domain

The backend is built around four main models:

- `User` - a person who can log in and create reservations
- `Resource` - something that can be reserved
- `Availability` - a time window where a resource can be reserved
- `Reservation` - a booking made by a user for a resource

The system uses generic resource-reservation language so it can fit different domains, such as rooms, equipment, vehicles, courts, or workspaces.

## Authentication And Authorization

Users can register and log in through `AuthController`.

Passwords are hashed with `PasswordHasher<User>`. Login returns a JWT containing the user's id, email, name, and role.

Public registration always creates a normal `User`. Admin access is created through development seed configuration, not through the public registration request body.

Admin-only behavior:

- Create, update, and delete resources
- Create, update, and delete availability windows
- View all reservations
- View reservations by resource
- View reservations by user
- Cancel any reservation

User behavior:

- View resources
- View availability windows
- Create reservations for themselves
- View their own reservations through `/api/reservations/me`
- Cancel their own reservations

## Reservation Rules

A reservation can only be created when:

- the resource exists
- the resource is active
- `EndTime` is after `StartTime`
- the requested time is inside an availability window
- no active reservation overlaps the requested time

Overlap prevention uses this rule:

```text
newStart < existingEnd
and
newEnd > existingStart
```

Cancelled reservations do not block new reservations.

Reservation status values are centralized in `ReservationStatuses`:

```text
Active
Cancelled
```

## API Endpoints

### Auth

```text
POST /api/auth/register
POST /api/auth/login
```

### Resources

```text
GET    /api/resources
GET    /api/resources/{id}
POST   /api/resources        Admin only
PUT    /api/resources/{id}   Admin only
DELETE /api/resources/{id}   Admin only
```

### Availabilities

```text
GET    /api/availabilities
GET    /api/availabilities/{id}
POST   /api/availabilities        Admin only
PUT    /api/availabilities/{id}   Admin only
DELETE /api/availabilities/{id}   Admin only
```

### Reservations

```text
GET /api/reservations                    Admin only
GET /api/reservations/{id}               Owner or Admin
GET /api/reservations/me                 Logged-in user
POST /api/reservations                   Logged-in user
PUT /api/reservations/{id}/cancel        Owner or Admin
GET /api/reservations/resource/{id}      Admin only
GET /api/reservations/user/{id}          Admin only
```

## Database

The backend uses SQL Server LocalDB through Entity Framework Core.

Development connection string:

```text
Server=(localdb)\MSSQLLocalDB;Database=ResourceReservationDb;Trusted_Connection=True;TrustServerCertificate=True
```

Database migrations are stored in:

```text
backend/ResourceReservation.Api/Migrations
```

## Development Admin User

The first admin user can be seeded through `appsettings.Development.json`:

```json
"SeedAdmin": {
  "Name": "Admin",
  "Email": "admin@example.com",
  "Password": "Admin1234"
}
```

After starting the API, log in with that email and password through Swagger and use the returned JWT in the Swagger Authorize button.

## Running The Backend

From the repository root:

```bash
dotnet run --project backend/ResourceReservation.Api/ResourceReservation.Api.csproj
```

Swagger is available when running in development:

```text
http://localhost:5052/swagger
```

## Verification

The backend has been checked with:

```bash
dotnet build backend/ResourceReservation.Api/ResourceReservation.Api.csproj
```

The full MVP flow has also been tested manually in Swagger:

```text
Admin creates Resource
Admin creates Availability
User registers and logs in
User views Resource and Availability
User creates Reservation
User views own reservations
User cancels Reservation
User can rebook a cancelled time
User cannot use admin-only endpoints
```

## Frontend Status

The first frontend MVP is in progress.

The frontend is located in:

```text
frontend/resource-reservation-client
```

Implemented frontend behavior:

- Login and registration forms
- JWT session storage after login
- Role-based Admin and User home sections
- Resource listing for Admin and User
- Admin resource create, edit, and delete
- Availability listing for Admin and User
- Admin availability create, edit, and delete
- User reservation creation
- User reservation listing and cancellation
- Admin reservation listing and cancellation

## Frontend API Configuration

The frontend reads the API base URL from:

```text
VITE_API_BASE_URL
```

An example configuration is available in:

```text
frontend/resource-reservation-client/.env.example
```

For local development, the expected value is:

```text
VITE_API_BASE_URL=http://localhost:5052/api
```

If no environment variable is configured, the frontend uses this same local API URL by default.

## Running The Frontend

Start the backend first, then start the frontend.

From the repository root:

```bash
cd frontend/resource-reservation-client
npm install
npm run dev
```

The Vite development server will print the frontend URL in the terminal, usually:

```text
http://localhost:5173
```

Frontend commands must be run from:

```text
frontend/resource-reservation-client
```

Running `npm run build` from the parent `frontend` folder will fail because that folder does not contain `package.json`.

## Status

The backend MVP is working. The frontend MVP is in progress and connected to the API for the core resource, availability, and reservation flows.
