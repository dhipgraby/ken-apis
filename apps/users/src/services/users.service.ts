import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from 'lib/common/database/prisma.service';
import { HDNodeWallet, HDNodeVoidWallet, Wallet } from 'ethers';
import { encryptPrivateKey, decryptPrivateKey, formatToFourDigits } from 'utils/crypto';
import { decryptEnvValue } from 'lib/utils/crypto.utils';

@Injectable()
export class UsersService {
  private readonly xpriv: string;
  constructor(
    private readonly prisma: PrismaService,
  ) {
    const masterKey = process.env.MASTER_KEY;
    if (!masterKey) throw new Error('Missing MASTER_KEY in env');

    if (!process.env.WALLET_XPRIV_ENC) throw new Error('Missing WALLET_XPRIV_ENC in env');
    if (!process.env.WALLET_XPUB_ENC) throw new Error('Missing WALLET_XPUB_ENC in env');

    this.xpriv = decryptEnvValue(process.env.WALLET_XPRIV_ENC, masterKey);
  }

  getHello(): string {
    return 'Users Api is status 200!';
  }

  private getXPrivWallet(): HDNodeWallet | HDNodeVoidWallet {
    return HDNodeWallet.fromExtendedKey(this.xpriv);
  }

  getWalletByIndex(index: number) {
    const wallet = this.getXPrivWallet();
    return wallet.deriveChild(index);
  }

  async getUserEthAddress(userId: number) {
    try {
      const existing = await this.prisma.userEthAddresses.findFirst({
        where: { userId, is_active: true },
        select: { address: true, id: true },
      });

      if (!existing) {
        return this.generateUserEthAddress(userId);
      }

      const signedMessage = await this.signMessage(userId, formatToFourDigits(existing.id));

      return { address: existing.address, addressCode: existing.id, hash: signedMessage.signedMessage };
    } catch (error) {
      console.error('Error retrieving user wallet:', error);
      if (error instanceof HttpException) {
        throw error;
      } else {
        throw new HttpException(
          'Internal server error',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async regenerateWallet(userId: number) {
    try {
      const existing = await this.prisma.userEthAddresses.findFirst({
        where: { userId, is_active: true },
      });

      if (existing) {
        const now = new Date();
        const createdAt = new Date(existing.created_at);
        const secondsSinceCreation = (now.getTime() - createdAt.getTime()) / 1000;

        if (secondsSinceCreation < 10) {
          throw new HttpException(
            `Please wait ${Math.ceil(10 - secondsSinceCreation)} seconds before regenerating your wallet.`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        await this.prisma.userEthAddresses.update({
          where: { id: existing.id },
          data: { is_active: false },
        });
      }

      return await this.generateUserEthAddress(userId);
    } catch (error) {
      console.error('Error updating user configuration:', error);
      if (error instanceof HttpException) {
        throw error;
      } else {
        throw new HttpException(
          'Internal server error',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async generateUserEthAddress(userId: number) {
    const existing = await this.prisma.userEthAddresses.findFirst({
      where: { userId, is_active: true },
    });

    if (existing) {
      throw new Error('User already has an ETH address');
    }

    const maxResult = await this.prisma.userEthAddresses.aggregate({
      _max: { index: true },
    });

    const nextIndex = maxResult._max.index !== null ? maxResult._max.index + 1 : 0;
    const hdWallet = this.getXPrivWallet();
    const childWallet = hdWallet.deriveChild(nextIndex) as HDNodeWallet;
    const address = childWallet.address;

    const { encryptedData, iv, authTag } = encryptPrivateKey(childWallet.privateKey);

    const encryption_key = JSON.stringify({ encryptedData, iv, authTag });

    const created = await this.prisma.userEthAddresses.create({
      data: {
        address,
        index: nextIndex,
        userId,
        encryption_key: encryption_key,
        is_active: true,
      },
    });

    const signedMessage = await this.signMessage(userId, formatToFourDigits(created.id));

    return { address, addressCode: created.id, hash: signedMessage.signedMessage, status: 200, message: 'Wallet created successfully' };
  }

  async signMessage(userId: number, message: string) {
    const record = await this.prisma.userEthAddresses.findFirst({
      where: { userId, is_active: true },
    });

    if (!record) {
      throw new HttpException('Wallet not found', HttpStatus.NOT_FOUND);
    }

    const { encryptedData, iv, authTag } = JSON.parse(record.encryption_key);
    const privateKey = decryptPrivateKey(encryptedData, iv, authTag);
    const wallet = new Wallet(privateKey);

    const toSign = `MtPelerin-${message}`;
    const rawSignature = await wallet.signMessage(toSign);

    const base64Signature = Buffer.from(rawSignature.slice(2), 'hex').toString('base64');

    return {
      signedMessage: base64Signature,
      address: wallet.address,
    };
  }

  generateHDWallet() {
    const hdWallet = HDNodeWallet.createRandom();
    const mnemonic = hdWallet.mnemonic?.phrase;
    const xpriv = hdWallet.extendedKey;
    const xpub = hdWallet.neuter().extendedKey;
    const address = hdWallet.address;

    console.log('Mnemonic:', mnemonic);
    console.log('xpriv:', xpriv);
    console.log('xpub:', xpub);
    console.log('Address:', address);

    return { mnemonic, xpriv, xpub, address };
  }

}
