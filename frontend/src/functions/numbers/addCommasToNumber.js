export default function addCommasToNumber(number, currencySign, percentageSign) {
    if (typeof number !== "number") {
        return null;
    }

    // Determine if the number is negative
    const isNegative = number < 0;

    // Get the absolute value and format it with commas
    const formattedNumber = Math.abs(number)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    // Add currency or percentage sign
    let result = formattedNumber;
    if (currencySign) {
        result = `${currencySign} ${result}`;
    } else if (percentageSign) {
        result = `${result}${percentageSign}`;
    }

    // Add the negative sign back if the number is negative
    if (isNegative) {
        result = `-${result}`;
    }


    return result;
}
