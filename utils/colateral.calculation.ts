export function calculateDaiAmount(euroAmount: number, conversionRate: number): number {
    // Calculate the amount of DAI equivalent to the Euro amount
    let daiAmount = euroAmount / conversionRate;
    // Add the markup
    let markup = 0.005 * daiAmount;
    let daiAmountWithMarkup = daiAmount - markup;

    return daiAmountWithMarkup;
}

//return euro rate
export async function fetchConversionRate(currency: any): Promise<number> {
    const url = `https://api.coinbase.com/v2/exchange-rates?currency=${currency}`;
    try {
        const response = await fetch(url);

        const data: any = await response.json();
        const rates = data.data.rates;
        const conversionRate = Number(rates.EUR);

        if (!isNaN(conversionRate)) {
            return conversionRate;
        } else {
            throw new Error('Conversion rate is not a number');
        }
    } catch (error) {
        console.error('Error fetching conversion rate:', error);
        throw error;
    }
}

export async function conversionRateUSDC(currency: any): Promise<number> {
    const url = `https://api.coinbase.com/v2/exchange-rates?currency=${currency}`;
    try {
        const response = await fetch(url);

        const data: any = await response.json();
        const rates = data.data.rates;
        const conversionRate = Number(rates.USDC);

        if (!isNaN(conversionRate)) {
            return conversionRate;
        } else {
            throw new Error('Conversion rate is not a number');
        }
    } catch (error) {
        console.error('Error fetching conversion rate:', error);
        throw error;
    }
}

export async function fetchConversionDaiRate(currency: any): Promise<number> {
    const url = `https://api.coinbase.com/v2/exchange-rates?currency=${currency}`;
    try {
        const response = await fetch(url);

        const data: any = await response.json();
        const rates = data.data.rates;
        const conversionRate = Number(rates.DAI);

        if (!isNaN(conversionRate)) {
            return conversionRate;
        } else {
            throw new Error('Conversion rate is not a number');
        }
    } catch (error) {
        console.error('Error fetching conversion rate:', error);
        throw error;
    }
}