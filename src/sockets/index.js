module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);

    require('./chat.socket')(socket, io);
  });
};
