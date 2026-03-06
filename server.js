const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const Filter = require("bad-words");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const filter = new Filter();

const adminUser = "Admin";
let adminPassword = "supersecret"; 
let chatPassword = "thermodynamics";

let activeUsers = {};
let lockedUsernames = new Set();
let hardBlockWords = ["verybadword1", "verybadword2"];
let currentSessions = new Set();

/* HARD BLOCK CHECK */
function containsHardBlock(msg) {
  return hardBlockWords.some(word => msg.toLowerCase().includes(word));
}

/* BROADCAST USER LIST */
function updateUserList() {
  io.emit("user list", Object.values(activeUsers));
}

io.on("connection", (socket) => {

  /* PASSWORD CHECK */

  socket.on("enter password", (password, callback) => {

    if (password === chatPassword || password === adminPassword) {

      currentSessions.add(socket.id);

      const isAdmin = (password === adminPassword);

      callback({ success: true, isAdmin });

    } else {

      callback({ success: false });

    }

  });

  /* USERNAME SET */

  socket.on("set username", (username, callback) => {

    if (!currentSessions.has(socket.id))
      return callback({ success: false, message: "Not authorized" });

    if (!username || username.length < 2)
      return callback({ success: false, message: "Invalid username" });

    if (filter.isProfane(username))
      return callback({ success: false, message: "Profane username not allowed" });

    if (lockedUsernames.has(username))
      return callback({ success: false, message: "Username already taken" });

    lockedUsernames.add(username);
    activeUsers[socket.id] = username;

    updateUserList();

    callback({ success: true });

  });

  /* CHAT MESSAGE */

  socket.on("chat message", (msg) => {

    if (!currentSessions.has(socket.id)) return;

    const username = activeUsers[socket.id];
    if (!username) return;

    if (containsHardBlock(msg)) {

      socket.emit("message blocked", "Message blocked due to prohibited language.");
      return;

    }

    msg = filter.clean(msg);

    io.emit("chat message", { username, message: msg });

  });

  /* ADMIN PASSWORD CHANGE */

  socket.on("change chat password", (newPassword, adminSocketId, callback) => {

    if (adminSocketId !== socket.id)
      return callback({ success: false, message: "Not authorized" });

    if (!newPassword || newPassword.length < 4)
      return callback({ success: false, message: "Password too short" });

    chatPassword = newPassword;

    callback({ success: true, message: "Chat password updated" });

  });

  /* USER DISCONNECT */

  socket.on("disconnect", () => {

    const username = activeUsers[socket.id];

    if (username) {
      lockedUsernames.delete(username);
    }

    delete activeUsers[socket.id];
    currentSessions.delete(socket.id);

    updateUserList();

  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log("Server running on port " + PORT));
