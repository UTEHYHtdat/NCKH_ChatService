const { Server } = require('socket.io');

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
    },
  });

  require('../sockets')(io);
}

function getIO() {
  return io;
}

module.exports = {
  initSocket,
  getIO,
};
