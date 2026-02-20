import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  if (storedHash.startsWith('$argon2')) {
    return argon2.verify(storedHash, password, ARGON2_OPTIONS);
  }
  return bcrypt.compare(password, storedHash);
}

