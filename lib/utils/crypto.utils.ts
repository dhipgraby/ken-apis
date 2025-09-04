import * as crypto from 'crypto';
import { HDNodeWallet } from 'ethers';

const ALGORITHM = 'aes-256-ecb'; // Changed to ECB mode
const SECRET_KEY = process.env.APP_SECRET_KEY; // Ensure this is 32 characters

export const encrypt = (text: string): string => {
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY), null); // No IV needed for ECB mode
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
};

export const decrypt = (encryptedText: string): string => {
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(SECRET_KEY), null); // No IV needed for ECB mode
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

export const generateHmac = (text: string): string => {
    return crypto.createHmac('sha256', SECRET_KEY).update(text).digest('hex');
};

export const verifyHmac = (text: string, hmac: string): boolean => {
    const generatedHmac = generateHmac(text);
    return crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmac));
};

export function decryptEnvValue(encryptedJson: string, password: string): string {
    try {
        const { encryptedData, iv, authTag } = JSON.parse(encryptedJson);
        const key = crypto.scryptSync(password, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
        decipher.setAuthTag(Buffer.from(authTag, 'base64'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encryptedData, 'base64')),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.log('error decryting', error);
    }

}

export function encryptWallet(text: string, password: string) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return JSON.stringify({
        encryptedData: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
    });
}

export function verifyAddressOwnership(address: string, index: number, xpubKey: string): boolean {
    const hdWallet = HDNodeWallet.fromExtendedKey(xpubKey);
    const childWallet = hdWallet.deriveChild(index) as HDNodeWallet;
    const childAddress = childWallet.address;
    return address.toLowerCase() === childAddress.toLowerCase();
}

export function parseAmount(amount?: string | bigint | 0): bigint {
    if (!amount) return 0n;
    if (typeof amount === 'bigint') return amount;
    if (typeof amount === 'string') {
        return BigInt(amount.replace(/n$/, '')); // strip trailing "n"
    }
    return 0n;
}