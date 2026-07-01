require('dotenv/config'); // Dùng require thay cho import
const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const { Server } = require('socket.io');

// Đảm bảo các file controller và service này cũng đã được chuyển sang .js hoặc export dạng CommonJS
const conversationRoutes = require('./src/controllers/conversation.controller');
const { initSocketIO } = require('./src/services/socker.service');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const cors = require('cors');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS cho HTTP
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', FRONTEND_URL);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// REST Routes
app.use('/conversations', conversationRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ─── HTTPS + WSS ────────────────────────────────────────────────────────────
function startServerWithFallback(
  appInstance,
  initialPort,
  successMessage,
  httpsOptions = null,
) {
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

function startSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: FRONTEND_URL,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  app.locals.io = io;
  initSocketIO(io);
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

// Export mặc định kiểu Node.js CommonJS
module.exports = app;
