"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const argon2 = require("argon2");
const bcrypt = require("bcrypt");
const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
};
async function hashPassword(password) {
    return argon2.hash(password, ARGON2_OPTIONS);
}
async function verifyPassword(password, storedHash) {
    if (!storedHash)
        return false;
    if (storedHash.startsWith('$argon2')) {
        return argon2.verify(storedHash, password, ARGON2_OPTIONS);
    }
    return bcrypt.compare(password, storedHash);
}
//# sourceMappingURL=password.util.js.map