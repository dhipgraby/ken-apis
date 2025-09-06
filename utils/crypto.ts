import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// process.env.WALLET_ENCRYPTION_SECRET!
const KEY = crypto.scryptSync('asdasdasd', 'salt', 32); // 32 bytes for AES-256

export function encryptPrivateKey(privateKey: string) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([
        cipher.update(privateKey, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
        encryptedData: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
    };
}

export function decryptPrivateKey(encrypted: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'hex')),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

export function formatToFourDigits(id: number): string {
    if (typeof id !== 'number' || id < 0 || !Number.isInteger(id)) {
        throw new Error('Invalid input: id must be a positive integer.');
    }

    const code = 1000 + id;

    if (code > 9999) {
        throw new Error('Code limit exceeded. Maximum allowed id is 8999.');
    }

    return code.toString();
}
