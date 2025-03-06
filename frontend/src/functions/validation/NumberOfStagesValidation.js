export function NumberOfStagesValidation(numberOfStages) {

    if (!numberOfStages) return null;

    if (!/^\d+$/.test(numberOfStages)) return "הכנס מספרים בלבד";

    if (Number(numberOfStages) > 15) return "עד 15 שלבים";

    return null;

}