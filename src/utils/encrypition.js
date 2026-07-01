// const CryptoJS = require('crypto-js');

// const SECRET_KEY = process.env.AES_SECRET_KEY;

// if (!SECRET_KEY) {
//   throw new Error('AES_SECRET_KEY is not defined in environment variables');
// }

// /**
//  * Mã hóa tin nhắn trước khi lưu vào DB (AES)
//  */
// function encryptMessage(plainText) {
//   return CryptoJS.AES.encrypt(plainText, SECRET_KEY).toString();
// }

// /**
//  * Giải mã tin nhắn khi đọc từ DB
//  */
// function decryptMessage(cipherText) {
//   const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
//   return bytes.toString(CryptoJS.enc.Utf8);
// }

// // Export các hàm theo chuẩn CommonJS để các repository sử dụng
// module.exports = {
//   encryptMessage,
//   decryptMessage,
// };
