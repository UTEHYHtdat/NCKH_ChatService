const CryptoJS = require('crypto-js');

const SECRET_KEY = process.env.AES_SECRET_KEY;

if (!SECRET_KEY) {
  throw new Error('AES_SECRET_KEY chưa được cấu hình trong file .env');
}

/**
 * Mã hóa tin nhắn trước khi lưu vào DB (AES-256)
 * @param {string} plainText - Nội dung tin nhắn gốc
 * @returns {string} Chuỗi đã mã hóa (ciphertext)
 */
function encryptMessage(plainText) {
  if (!plainText) return plainText;
  return CryptoJS.AES.encrypt(plainText, SECRET_KEY).toString();
}

/**
 * Giải mã tin nhắn khi đọc từ DB
 * @param {string} cipherText - Chuỗi đã mã hóa từ DB
 * @returns {string} Nội dung tin nhắn gốc
 */
function decryptMessage(cipherText) {
  if (!cipherText) return cipherText;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    // Nếu decrypt ra chuỗi rỗng → có thể là tin nhắn cũ chưa được mã hóa
    if (!decrypted) return cipherText;
    return decrypted;
  } catch {
    // Fallback: trả về nguyên bản nếu không decrypt được (tin nhắn cũ plain text)
    return cipherText;
  }
}

module.exports = { encryptMessage, decryptMessage };
