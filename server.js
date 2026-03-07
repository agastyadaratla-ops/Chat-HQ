const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ─── CONFIG (edit these directly) ────────────────────────────
const MONGO_URI  = 'mongodb+srv://YOUR_USER:YOUR_PASS@cluster.mongodb.net/chathq';
const PORT       = 3000;

// These can be changed live via the admin panel
let GENERAL_PASS = 'chat123';
let ADMIN_PASS   = 'admin999';

// ─── BAD WORD FILTER ──────────────────────────────────────────
// Add or remove words from this list freely
const BAD_WORDS = [
  'fuck', 'shit', 'ass', 'bitch', 'bastard', 'damn', 'crap',
  'piss', 'cock', 'dick', 'pussy', 'cunt', 'whore', 'slut',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'kike', 'spic',
  'chink', 'wetback', 'tranny', 'dyke'
];

// Catches l33t speak and character substitutions e.g. "f*ck", "sh1t", "a$$"
function buildWordRegex(word) {
  const map = { a: '[a@4]', e: '[e3]', i: '[i1!]', o: '[o0]', s: '[s$5]', t: '[t7]', g: '[g9]' };
  const pattern = word.split('').map(c => map[c.toLowerCase()] || c).join('[^a-z0-9]{0,2}');
  return new RegExp(`(?<![a-z])${pattern}(?![a-z])`, 'gi');
}

const BAD_WORD_REGEXES = BAD_WORDS.map(w => ({ word: w, regex: buildWordRegex(w) }));

function filterText(text) {
  if (!text) return text;
  let filtered = text;
  for (const { word, regex } of BAD_WORD_REGEXES) {
    regex.lastIndex = 0;
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  }
  return filtered;
}

function containsBadWord(text) {
  if (!text) return false;
  return BAD_WORD_REGEXES.some(({ regex }) => {
    regex.lastIndex = 0;
    return regex.test(text);
  });
}

// ─── MONGOOSE MODELS ──────────────────────────────────────────
mongoose.connect(MONGO_URI).then(() => console.log('MongoDB connected'));

const messageSchema = new mongoose.Schema({
  room:      { type: String, default: 'general' },
  username:  String,
  text:      String,
  imageData: String,
  imageMime: String,
  timestamp: { type: Date, default: Date.now },
  deleted:   { type: Boolean, default: false }
});
const Message = mongoose.model('Message', messageSchema);

const userSchema = new mongoose.Schema({
  username:  { type: String, unique: true },
  banned:    { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const roomSchema = new mongoose.Schema({
  name:      String,
  code:      { type: String, unique: true },
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});
const Room = mongoose.model('Room', roomSchema);

// ─── IN-MEMORY STATE ──────────────────────────────────────────
const onlineUsers = new Map(); // socketId -> { username, room }
const typingUsers = new Map(); // room -> Set of usernames

function getRoomOnlineList(room) {
  const users = [];
  for (const [, data] of onlineUsers) {
    if (data.room === room) users.push(data.username);
  }
  return [...new Set(users)];
}

function broadcastOnline(room) {
  io.to(room).emit('onlineUsers', getRoomOnlineList(room));
}

// ─── JOIN ─────────────────────────────────────────────────────
app.post('/api/join', async (req, res) => {
  const { username, password } = req.body;

  if (!username || username.trim().length < 2)
    return res.status(400).json({ error: 'Username must be at least 2 characters.' });
  if (username.trim().length > 20)
    return res.status(400).json({ error: 'Username max 20 characters.' });
  if (containsBadWord(username.trim()))
    return res.status(400).json({ error: 'Username contains inappropriate language.' });
  if (password !== GENERAL_PASS)
    return res.status(401).json({ error: 'Wrong password.' });

  let user = await User.findOne({ username: username.trim() });
  if (user && user.banned)
    return res.status(403).json({ error: 'You have been banned.' });
  if (!user)
    user = await User.create({ username: username.trim() });

  res.json({ ok: true, username: user.username });
});

// ─── ROOMS ────────────────────────────────────────────────────
app.post('/api/rooms/create', async (req, res) => {
  const { username, roomName } = req.body;
  if (!roomName || roomName.trim().length < 2)
    return res.status(400).json({ error: 'Room name too short.' });
  if (containsBadWord(roomName.trim()))
    return res.status(400).json({ error: 'Room name contains inappropriate language.' });

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const room = await Room.create({ name: roomName.trim(), code, createdBy: username });
  res.json({ ok: true, room: room.name, code: room.code });
});

app.post('/api/rooms/join', async (req, res) => {
  const { code } = req.body;
  const room = await Room.findOne({ code: code.trim().toUpperCase() });
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  res.json({ ok: true, room: room.name, code: room.code });
});

// ─── MESSAGES ─────────────────────────────────────────────────
app.get('/api/messages/:room', async (req, res) => {
  const messages = await Message.find({
    room: req.params.room,
    deleted: false
  }).sort({ timestamp: 1 }).limit(100);
  res.json(messages);
});

// ─── ADMIN AUTH ───────────────────────────────────────────────
function adminAuth(req, res, next) {
  if (req.headers['x-admin-pass'] !== ADMIN_PASS)
    return res.status(401).json({ error: 'Unauthorized.' });
  next();
}

// ─── ADMIN ROUTES ─────────────────────────────────────────────
app.get('/api/admin/messages', adminAuth, async (req, res) => {
  const { room = 'general' } = req.query;
  const messages = await Message.find({ room, deleted: false }).sort({ timestamp: -1 }).limit(200);
  res.json(messages);
});

app.delete('/api/admin/messages/:id', adminAuth, async (req, res) => {
  await Message.findByIdAndUpdate(req.params.id, { deleted: true });
  io.emit('messageDeleted', req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users);
});

app.delete('/api/admin/users/:username', adminAuth, async (req, res) => {
  await User.findOneAndUpdate({ username: req.params.username }, { banned: true });
  for (const [socketId, data] of onlineUsers) {
    if (data.username === req.params.username) {
      io.to(socketId).emit('kicked', 'You have been banned by an admin.');
      onlineUsers.delete(socketId);
    }
  }
  res.json({ ok: true });
});

// Changes the general chat password live (resets on server restart — edit GENERAL_PASS above to make it permanent)
app.put('/api/admin/password', adminAuth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4)
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  GENERAL_PASS = newPassword;
  console.log(`General password changed to: ${newPassword}`);
  res.json({ ok: true });
});

app.get('/api/admin/rooms', adminAuth, async (req, res) => {
  const rooms = await Room.find().sort({ createdAt: -1 });
  res.json(rooms);
});

// ─── SOCKETS ──────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('joinRoom', ({ username, room }) => {
    const prev = onlineUsers.get(socket.id);
    if (prev) {
      socket.leave(prev.room);
      broadcastOnline(prev.room);
    }
    socket.join(room);
    onlineUsers.set(socket.id, { username, room });
    broadcastOnline(room);
    socket.to(room).emit('systemMessage', { text: `${username} joined the room.` });
  });

  socket.on('sendMessage', async ({ username, room, text, imageData, imageMime }) => {
    if (!onlineUsers.get(socket.id)) return;

    const user = await User.findOne({ username });
    if (user && user.banned) { socket.emit('kicked', 'You have been banned.'); return; }

    if (text && text.length > 1000) { socket.emit('error', 'Message too long (max 1000 characters).'); return; }
    if (!text && !imageData) return;

    // Filter bad words from message text
    const cleanText = filterText(text);

    const msg = await Message.create({ room, username, text: cleanText, imageData, imageMime });
    io.to(room).emit('newMessage', {
      _id: msg._id, room, username,
      text: cleanText, imageData, imageMime,
      timestamp: msg.timestamp
    });
  });

  socket.on('typing', ({ username, room, isTyping }) => {
    if (!typingUsers.has(room)) typingUsers.set(room, new Set());
    const set = typingUsers.get(room);
    isTyping ? set.add(username) : set.delete(username);
    socket.to(room).emit('typingUpdate', [...set]);
  });

  socket.on('disconnect', () => {
    const data = onlineUsers.get(socket.id);
    if (data) {
      const { username, room } = data;
      onlineUsers.delete(socket.id);
      if (typingUsers.has(room)) {
        typingUsers.get(room).delete(username);
        socket.to(room).emit('typingUpdate', [...typingUsers.get(room)]);
      }
      broadcastOnline(room);
      socket.to(room).emit('systemMessage', { text: `${username} left the room.` });
    }
  });
});

server.listen(PORT, () => console.log(`ChatHQ running on port ${PORT}`));
