require('dotenv/config');
const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const path = require('path');
const conversationRoutes = require('./src/controllers/conversation.controller');
const internalRoutes = require('./src/controllers/internal.controller');
const uploadRoutes = require('./src/controllers/upload.controller');
const memberRoutes = require('./src/controllers/member.controller');
const { initSocketIO } = require('./src/services/socket.service');

const app = express();
const PORT = Number(process.env.PORT || 8006); // đồng bộ với API Gateway config
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const NODE_ENV = process.env.NODE_ENV || 'development';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3000'
];

// ─── CORS — Dùng thư viện cors thay vì set header thủ công ─────────────────
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }),
);

// ─── REST Routes ────────────────────────────────────────────────────────────
// Path đồng bộ với API Gateway: /api/v1/chatbox/conversations
app.use('/api/v1/chatbox/conversations', conversationRoutes);

// Upload file đính kèm: /api/v1/chatbox/conversations/:conversationId/attachments
app.use('/api/v1/chatbox/conversations/:conversationId/attachments', uploadRoutes);

// Quản lý thành viên: /api/v1/chatbox/conversations/:conversationId/members
app.use('/api/v1/chatbox/conversations/:conversationId/members', memberRoutes);

// Internal API — chỉ dành cho service-to-service calls (ThesisService)
// Bảo vệ bằng INTERNAL_API_KEY, KHÔNG dùng JWT
app.use('/api/v1/chatbox/internal', internalRoutes);

// ─── Serve static files cho uploads ─────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (_, res) =>
  res.json({ status: 'ok', env: NODE_ENV, timestamp: new Date().toISOString() }),
);

function startSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  app.locals.io = io;
  initSocketIO(io);
}

function startServerWithFallback(appInstance, initialPort, successMessage, httpsOptions = null) {
  const tryListen = (port) => {
    const server = httpsOptions
      ? https.createServer(httpsOptions, appInstance)
      : http.createServer(appInstance);

    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(`[Server] Port ${port} is busy, trying ${port + 1}...`);
        tryListen(port + 1);
        return;
      }
      throw error;
    });

    server.listen(port, () => {
      console.log(successMessage.replace('{port}', port));
      startSocketServer(server);
    });
  };

  tryListen(initialPort);
}

if (fs.existsSync('./certs/key.pem') && fs.existsSync('./certs/cert.pem')) {
  const credentials = {
    key: fs.readFileSync('./certs/key.pem'),
    cert: fs.readFileSync('./certs/cert.pem'),
  };
  console.log('[Server] Running with HTTPS/WSS');
  startServerWithFallback(
    app,
    PORT,
    '[Server] HTTPS/WSS running on port {port}',
    credentials,
  );
} else {
  startServerWithFallback(app, PORT, '[Server] HTTP running on port {port}');
}

module.exports = app;
