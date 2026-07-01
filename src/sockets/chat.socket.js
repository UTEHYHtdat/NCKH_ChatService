module.exports = (socket, io) => {
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
};
