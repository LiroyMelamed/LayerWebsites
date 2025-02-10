export function DateDDMMYY(dateString) {
    if (dateString === null || dateString === '') {
        return null;
    }
    const date = new Date(dateString);

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = String(date.getFullYear()).slice(-2); // Get last two digits of the year

    return `${day}.${month}.${year}`;
}
