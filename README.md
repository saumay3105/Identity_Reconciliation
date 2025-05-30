# Identity Reconciliation Service

This is my solution for the Bitespeed Identity Reconciliation backend task. It’s built with Node.js, Express, TypeScript, Prisma, and PostgreSQL.

## Features
- Handles customer identity linking via email and/or phone number.
- Maintains a primary contact and links secondary contacts.
- Prevents duplicate entries and merges multiple primaries if needed.
- Uses BFS to always find and link to the root primary.

## Tech Stack
- Node.js + Express
- TypeScript
- Prisma ORM
- PostgreSQL (I recommend Neon for dev)

## How to Run

1. Clone this repo and install dependencies:
   ```bash
   npm install
   ```
2. Set your `DATABASE_URL` in `.env` (I used Neon, but any Postgres works).
3. Run migrations and generate Prisma client:
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```
4. Start the server:
   ```bash
   npm run dev
   ```


## Deployment
[https://identity-reconciliation-w2rr.onrender.com/api/identify](https://identity-reconciliation-w2rr.onrender.com/api/identify)

