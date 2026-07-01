const http = require('http');

const app = require('./app');

const { initSocket } = require('./config/socket');

const server = http.createServer(app);

initSocket(server);

server.listen(process.env.PORT || 3000, () => {
  console.log('Server running...');
});
