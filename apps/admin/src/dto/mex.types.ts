export const CryptoTradePairs = {
  ETH: { pair: 'ETHUSDC', steps: 1, network: 'ETH' },
  USDT: { pair: 'USDCUSDT', steps: 1, network: 'ETH' },
  BTC: { pair: 'BTCUSDT', steps: 2, intermediate: 'USDCUSDT', network: 'BTC' },
  DAI: { pair: 'DAIUSDT', steps: 2, intermediate: 'USDCUSDT', network: 'ETH' },
  POL: {
    pair: 'POLUSDT',
    steps: 2,
    intermediate: 'USDCUSDT',
    network: 'MATIC',
  },
  MATIC: {
    pair: 'POLUSDT',
    steps: 2,
    intermediate: 'USDCUSDT',
    network: 'MATIC',
  },
  USDC: { pair: null, steps: 0, network: 'ETH' },
} as const;

export type CryptoPairKey = keyof typeof Crypto;

export const BlockExporers = {
  ETH: 'https://etherscan.io/tx/',
  DAI: 'https://etherscan.io/tx/',
  USDC: 'https://etherscan.io/tx/',
  MATIC: 'https://polygonscan.com/tx/',
  POL: 'https://polygonscan.com/tx/',
  BTC: 'https://www.blockchain.com/btc/tx/',
};
