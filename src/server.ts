import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/line-chat';
const jwtSecret = process.env.JWT_SECRET || 'local-development-secret-change-me';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production.');
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' };
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 24 },
  passwordHash: { type: String, required: true },
}, { timestamps: true });
const User = mongoose.model('User', userSchema);
const messageSchema = new mongoose.Schema({
  author: { type: String, required: true, trim: true, maxlength: 32 },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});
messageSchema.index({ createdAt: -1 });
const Message = mongoose.model('Message', messageSchema);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
const tokenFor = (userId: string) => jwt.sign({ sub: userId }, jwtSecret, { expiresIn: '7d' });
async function userFromToken(token: string | undefined) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    return typeof payload.sub === 'string' ? await User.findById(payload.sub).select('_id username').lean() : null;
  } catch { return null; }
}
app.post('/api/auth/register', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Username must be 3 to 24 characters using letters, numbers, or underscores.' });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const user = await User.create({ username, passwordHash: await bcrypt.hash(password, 12) });
    res.cookie('chat_token', tokenFor(user.id), cookieOptions).status(201).json({ id: user.id, username: user.username });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return res.status(409).json({ error: 'That username is already taken.' });
    res.status(500).json({ error: 'Could not create your account.' });
  }
});
app.post('/api/auth/login', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Username or password is incorrect.' });
  res.cookie('chat_token', tokenFor(user.id), cookieOptions).json({ id: user.id, username: user.username });
});
app.post('/api/auth/logout', (_req, res) => res.clearCookie('chat_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }).json({ ok: true }));
app.get('/api/auth/me', async (req, res) => {
  const user = await userFromToken(req.cookies.chat_token);
  if (!user) return res.status(401).json({ error: 'Please log in.' });
  res.json({ id: user._id, username: user.username });
});
app.get('/api/health', (_req, res) => res.json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'connecting' }));
app.get('/api/messages', async (req, res) => {
  if (!(await userFromToken(req.cookies.chat_token))) return res.status(401).json({ error: 'Please log in.' });
  try {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(60).lean();
    res.json(messages.reverse());
  } catch {
    res.status(503).json({ error: 'Messages are temporarily unavailable.' });
  }
});

io.use(async (socket, next) => {
  const cookies = Object.fromEntries((socket.handshake.headers.cookie || '').split(';').map((entry) => {
    const [key, ...value] = entry.trim().split('=');
    return [key, decodeURIComponent(value.join('='))];
  }));
  const user = await userFromToken(cookies.chat_token);
  if (!user) return next(new Error('Authentication required'));
  socket.data.userId = String(user._id);
  socket.data.author = user.username;
  next();
});
io.on('connection', (socket) => {
  socket.broadcast.emit('chat:notice', { text: `${socket.data.author} joined the chat` });
  socket.on('chat:message', async (value: unknown) => {
    const author = socket.data.author as string | undefined;
    const text = typeof value === 'string' ? value.trim() : '';
    if (!author || !text || text.length > 2000) return;
    try {
      const message = await Message.create({ author, text });
      io.emit('chat:message', { id: message.id, author: message.author, text: message.text, createdAt: message.createdAt });
    } catch {
      socket.emit('chat:error', 'Could not save your message. Please try again.');
    }
  });
  socket.on('disconnect', () => {
    if (socket.data.author) socket.broadcast.emit('chat:notice', { text: `${socket.data.author} left the chat` });
  });
});

async function start() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection did not provide a database.');
  for (const collection of ['users', 'messages']) {
    try { await db.createCollection(collection); }
    catch (error) { if ((error as { code?: number }).code !== 48) throw error; }
  }
  await Promise.all([User.createIndexes(), Message.createIndexes()]);
  httpServer.listen(port, () => console.log(`Chat app listening on http://localhost:${port}`));
}
start().catch((error: Error) => {
  console.error('Could not connect to MongoDB:', error.message);
  process.exit(1);
});
