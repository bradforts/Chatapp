# Common Room Chat

A small chat application built with Node.js, TypeScript, Express, MongoDB, and Docker. Accounts are stored in MongoDB with hashed passwords. A signed login token is required for every chat API request.

## Run with Docker

1. Install Docker Desktop and start it.
2. From this folder, run:

   ```sh
   docker compose up --build
   ```

3. Open [http://localhost:3000](http://localhost:3000), create an account, and start chatting. The MongoDB data is kept in a Docker volume across restarts.

For a non-development deployment, set a strong `JWT_SECRET` in a `.env` file before starting Compose. Do not use the sample development secret in production.

## Run locally without Docker

Start MongoDB, copy `.env.example` to `.env`, set a long random `JWT_SECRET`, then run:

```sh
npm install
npm run dev
```

The app uses `mongodb://localhost:27017/chatapp` by default.

## Features

- Account registration and login with bcrypt password hashing
- Seven-day signed login tokens; chat endpoints reject requests without a valid token
- Shared `#general` room with messages stored in MongoDB
- Responsive browser interface, message polling, and logout
