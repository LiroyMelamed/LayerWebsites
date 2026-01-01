export function NumberOfStagesValidation(numberOfStages) {

    if (!numberOfStages) return null;

    if (typeof numberOfStages != 'number') return "מספרים בלבד";

    if (Number(numberOfStages) > 15) return "עד 15 שלבים";

    return null;

}