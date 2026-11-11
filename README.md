# LINE Chat

A small LINE-inspired public chat room built with Node.js, TypeScript, Express, Socket.IO and MongoDB. Users can register and log in with a username and password; passwords are hashed before they are saved. Login uses a signed, HTTP-only cookie.

## Run with Docker

Install Docker Desktop, then from this folder run:

```sh
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Create an account, then start chatting. The first start builds the app image and creates a MongoDB data volume. Stop it with `Ctrl+C`; run `docker compose down` to remove the containers. Accounts and chat history remain in the `mongo_data` volume. To remove all saved data, run `docker compose down -v`.

For deployments, set a private random `JWT_SECRET` in a `.env` file before starting Docker Compose.

## Run locally

Install Node.js 22+ and MongoDB, copy `.env.example` to `.env`, set `MONGODB_URI` to your database URL, then run:

```sh
npm install
npm run dev
```

For a MongoDB server running directly on your computer, set `MONGODB_URI` to `mongodb://127.0.0.1:27017/line-chat`.

## What’s included

- Live messages and join/leave notices over Socket.IO
- Username and password registration and login
- Password hashes stored in MongoDB; signed HTTP-only login cookie
- MongoDB message history (the latest 60 messages load when you open the room)
- Responsive chat layout with account-based display names
- Health endpoint at `/api/health`

This starter has a single public room; private conversations are not included.
