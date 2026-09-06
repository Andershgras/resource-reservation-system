# Resource Reservation Client

React + TypeScript frontend for the Resource Reservation System.

## Setup

Run frontend commands from this folder:

```bash
cd frontend/resource-reservation-client
npm install
```

## API URL

The frontend uses this local backend API URL by default:

```text
http://localhost:5052/api
```

To override it, create a local environment file based on `.env.example`:

```text
VITE_API_BASE_URL=http://localhost:5052/api
```

## Development

Start the backend first, then run:

```bash
npm run dev
```

## Build

```bash
npm run build
```
