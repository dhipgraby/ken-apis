import { IsNumber, IsString } from 'class-validator';

export class CreateDepositDto {
    @IsNumber()
    eurAmount: number;
}

export class DepositMessageDto {

    @IsNumber()
    id: number;

    @IsString()
    message: string;
}


export enum CryptoEnum {
    BTC = 'BTC',
    ETH = 'ETH',
    DAI = 'DAI',
    MATIC = 'MATIC',
    POL = 'POL',
    USDT = 'USDT',
    USDC = 'USDC'
}
