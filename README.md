# ChatHQ v2

A real-time chat app with MongoDB persistence, private rooms, image sharing, and an admin panel.

## Features

- ✅ Online presence — only users actively on the site show as online
- ✅ Chat saves — all messages stored in MongoDB
- ✅ Better UI — dark theme, avatars, smooth animations
- ✅ Image sharing — send pictures (base64, stored in MongoDB, max 5MB)
- ✅ Tab notification dot — `(3) 🔴 ChatHQ` when you have unread messages
- ✅ Letter limit — 1000 character max with live counter
- ✅ Private rooms + room codes — create a room, get a 6-char code, share with friends
- ✅ Typing indicator — see when others are typing in real time
- ✅ Admin panel — delete messages, ban users, change the general chat password

---

## Setup

### 1. Backend (Chat-HQ repo)

```bash
npm install
cp .env.example .env
# Edit .env with your MongoDB URI and passwords
npm start
```

The backend serves the frontend too — put `index.html` inside a `public/` folder next to `server.js`.

### 2. Frontend (Chat-fronted repo)

Just drop `index.html` into the `public/` folder of your backend. No build step needed.

### 3. MongoDB

Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas) and paste the connection string into `MONGO_URI` in your `.env`.

---

## Deployment (Render)

1. Push both files to your repos
2. On Render, set environment variables:
   - `MONGO_URI` = your Atlas connection string
   - `GENERAL_PASS` = your chat password
   - `ADMIN_PASS` = your secret admin password
3. Start command: `node server.js`

---

## Admin Panel

Click the 🔑 icon in the top-right corner, enter your `ADMIN_PASS`, and you can:
- **Delete messages** from any room
- **Ban users** (they get kicked and can't rejoin)
- **Change the general chat password** live

---

## File Structure

```
Chat-HQ/
├── server.js        ← backend (Node + Express + Socket.io + Mongoose)
├── package.json
├── .env.example
└── public/
    └── index.html   ← frontend (single HTML file)
```
