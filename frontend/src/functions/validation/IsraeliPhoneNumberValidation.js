export default function IsraeliPhoneNumberValidation(phoneNumber) {
    if (!phoneNumber) return null

    if (phoneNumber?.length !== 10) {
        return 'נא להכניס מספר פלאפון תקין';
    }

    return null;
}