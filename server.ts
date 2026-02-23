import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure database directory exists
const dbPath = process.env.DATABASE_URL || 'void.db';
const dbDir = path.dirname(dbPath);
if (dbDir !== '.' && !fs.existsSync(dbDir)) {
  console.log(`Creating database directory: ${dbDir}`);
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`Opening database at: ${dbPath}`);
const db = new Database(dbPath);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    FOREIGN KEY(server_id) REFERENCES servers(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(channel_id) REFERENCES channels(id)
  );

  -- Seed initial data if empty
  INSERT OR IGNORE INTO servers (id, name) VALUES ('main', 'GOY_MAIN');
  INSERT OR IGNORE INTO channels (id, server_id, name, type) VALUES ('general', 'main', 'general', 'text');
  INSERT OR IGNORE INTO channels (id, server_id, name, type) VALUES ('dev', 'main', 'development', 'text');
  INSERT OR IGNORE INTO channels (id, server_id, name, type) VALUES ('voice-1', 'main', 'COMM_LINK_01', 'voice');
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(express.json());

  // Health check for Fly.io
  app.get('/health', (req, res) => res.status(200).send('OK'));

  // API Routes
  app.get('/api/servers', (req, res) => {
    const servers = db.prepare('SELECT * FROM servers').all();
    res.json(servers);
  });

  app.get('/api/servers/:serverId/channels', (req, res) => {
    const channels = db.prepare('SELECT * FROM channels WHERE server_id = ?').all(req.params.serverId);
    res.json(channels);
  });

  app.get('/api/channels/:channelId/messages', (req, res) => {
    const messages = db.prepare('SELECT * FROM messages WHERE channel_id = ? ORDER BY timestamp ASC').all(req.params.channelId);
    res.json(messages);
  });

  // Socket.io logic
  const voiceParticipants: Record<string, any[]> = {};
  const typingUsers: Record<string, Set<string>> = {};

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-channel', (channelId) => {
      socket.join(channelId);
    });

    socket.on('typing-start', ({ channelId, userName }) => {
      if (!typingUsers[channelId]) typingUsers[channelId] = new Set();
      typingUsers[channelId].add(userName);
      socket.to(channelId).emit('typing-update', Array.from(typingUsers[channelId]));
    });

    socket.on('typing-stop', ({ channelId, userName }) => {
      if (typingUsers[channelId]) {
        typingUsers[channelId].delete(userName);
        socket.to(channelId).emit('typing-update', Array.from(typingUsers[channelId]));
      }
    });

    socket.on('join-voice', ({ channelId, userId, userName }) => {
      socket.join(channelId);
      if (!voiceParticipants[channelId]) voiceParticipants[channelId] = [];
      
      const participant = { socketId: socket.id, userId, userName };
      voiceParticipants[channelId].push(participant);
      
      io.to(channelId).emit('user-joined-voice', participant);
      socket.emit('voice-users-list', voiceParticipants[channelId].filter(p => p.socketId !== socket.id));
    });

    socket.on('leave-voice', (channelId) => {
      socket.leave(channelId);
      if (voiceParticipants[channelId]) {
        voiceParticipants[channelId] = voiceParticipants[channelId].filter(p => p.socketId !== socket.id);
        io.to(channelId).emit('user-left-voice', socket.id);
      }
    });

    socket.on('send-message', ({ channelId, userId, userName, content }) => {
      const id = Math.random().toString(36).substr(2, 9);
      const timestamp = new Date().toISOString();
      
      db.prepare('INSERT INTO messages (id, channel_id, user_id, user_name, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
        id, channelId, userId, userName, content, timestamp
      );

      const message = {
        id,
        channel_id: channelId,
        user_id: userId,
        user_name: userName,
        content,
        timestamp
      };

      io.to(channelId).emit('new-message', message);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      Object.keys(voiceParticipants).forEach(channelId => {
        voiceParticipants[channelId] = voiceParticipants[channelId].filter(p => p.socketId !== socket.id);
        io.to(channelId).emit('user-left-voice', socket.id);
      });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
