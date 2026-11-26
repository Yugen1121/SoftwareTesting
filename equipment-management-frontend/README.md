# Equiply — Equipment Management Frontend

A responsive React + Vite frontend for the Equipment Inventory and Maintenance Management API.

## Features
- JWT login and public user registration
- Role-aware navigation (admin, manager, technician, user)
- Overview dashboard with inventory, booking and fault metrics
- Equipment register and create-equipment form
- Booking list, create booking and cancel booking
- Fault reporting and technician/manager resolution action
- Maintenance list, scheduling and completion action
- Reports page for admin/manager roles
- Responsive desktop and mobile layouts

## Requirements
- Node.js 20+
- The Equipment Management Express API running (default `http://localhost:3000`)
- PostgreSQL configured and migrated in the backend

## Install and run

```bash
# from this folder
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL shown in the terminal (normally http://localhost:5173).

Set `VITE_API_URL` in `.env` if the backend is hosted elsewhere, for example:

```env
VITE_API_URL=http://localhost:3000/api
```

The browser calls these backend routes: `/auth/login`, `/auth/register`, `/equipment`, `/bookings`, `/faults`, `/maintenance`, and `/reports/*`.

## Connect to the backend

1. Start PostgreSQL using the backend's Docker Compose configuration.
2. In the backend folder, configure `.env`, then run `npm install`, `npm run migrate`, `npm run seed`, and `npm run dev`.
3. In this frontend folder, run `npm install` and `npm run dev`.
4. Sign in using the seeded development admin account if it is still present: `admin@example.com` / `ChangeMe123!`. Change this password immediately and never use seed credentials in production.

## CORS

The backend must allow the Vite development origin (`http://localhost:5173`). If the backend does not already enable CORS, install/configure the Express `cors` middleware, allowing your frontend origin and the `Authorization` and `Content-Type` headers. Do not use wildcard origins with credentials in production.

## API contract notes

The UI expects standard JSON objects or arrays. It tolerates common response wrappers (`data`, `items`, `results`, or `rows`). The backend currently returns the canonical fields from its API implementation. If you rename request fields or response properties in the API, update the corresponding forms/table mappings in `src/App.jsx`.

The frontend deliberately does not invent server-side capabilities: it uses the existing API routes. Equipment edit/delete, user administration, export, notifications and automatic booking lifecycle transitions are not implemented because those workflows need additional UI/API contracts.

## Production build

```bash
npm run build
npm run preview
```

Deploy the generated `dist/` directory to a static host and set `VITE_API_URL` at build time. For production, use HTTPS, restrict CORS, and configure secure token/session handling appropriate to your deployment.
