# Resource Reservation System - Planning

## Project Description

Resource Reservation System is a generic full-stack web application for reserving shared resources.

The project is built with:

- ASP.NET Core Web API
- SQL Server
- React
- TypeScript
- JWT authentication

The system should stay generic and should not be tied to one specific business type such as clinics, salons, hotels, or consultants.

Examples of reservable resources:

- Meeting rooms
- Sports courts
- Equipment
- Vehicles
- Workspaces
- People

## Core Idea

Admins manage resources and decide when they are available.

Users can view available time slots and create reservations.

The backend must prevent overlapping reservations for the same resource.

## MVP Roles

### Admin

An admin can:

- Create, edit, and delete resources
- Manage resource availability
- View and manage all reservations

### User

A user can:

- Register and log in
- View available resources and time slots
- Create reservations
- View their own reservations

## MVP Entities

### User

Represents a person using the system.

Important fields:

- Id
- Name
- Email
- PasswordHash
- Role

### Resource

Represents something that can be reserved.

Important fields:

- Id
- Name
- Description
- Location
- IsActive

### Availability

Represents when a resource can be reserved.

Important fields:

- Id
- ResourceId
- StartTime
- EndTime

### Reservation

Represents a booking made by a user.

Important fields:

- Id
- UserId
- ResourceId
- StartTime
- EndTime
- Status

## Planned MVP Features

- User registration
- User login
- JWT authentication
- Role-based access for Admin and User
- Admin resource management
- Admin availability management
- View available time slots
- Create reservations
- View own reservations
- Admin view of all reservations
- Reservation overlap prevention

## Reservation Overlap Rule

A resource cannot have two active reservations that overlap in time.

Basic overlap logic:

```text
Existing reservation overlaps if:
newStart < existingEnd
and
newEnd > existingStart
```

If an overlap exists, the backend should reject the new reservation.

## Out of Scope for First Version

The first version should not include:

- Payments
- Email notifications
- Calendar sync
- Complex pricing
- Advanced recurring schedules
- Industry-specific workflows
- Multiple organizations or tenants

## Suggested Development Order

1. Create the basic project structure
2. Create the Resource model and controller
3. Connect the backend to SQL Server
4. Store and read resources from the database
5. Add Availability
6. Add Reservation
7. Add overlap prevention
8. Add User registration and login
9. Add JWT authentication
10. Add role-based access
11. Connect the React frontend to the API

## First Practical Backend Goal

The first backend goal is to create a simple Resource API:

```text
GET    /api/resources
GET    /api/resources/{id}
POST   /api/resources
PUT    /api/resources/{id}
DELETE /api/resources/{id}
```

This gives the project a simple and useful starting point before adding reservations and authentication.
