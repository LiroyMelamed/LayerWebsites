// The caller must pass only spots that the requester is authorized to see.
// Match the signing list's progress: required fields, excluding lawyer stamps.
function signingDetailsSummary(signatureSpots) {
    const spots = Array.isArray(signatureSpots) ? signatureSpots : [];
    const required = spots.filter((spot) => spot.IsRequired === true
        && String(spot.FieldType || 'signature').toLowerCase() !== 'lawyerstamp');
    const names = [...new Set(spots.map((spot) => String(spot.SignerName || '').trim()).filter(Boolean))];
    return {
        TotalSpots: required.length,
        SignedSpots: required.filter((spot) => spot.IsSigned === true).length,
        ClientName: names.join(', ') || null,
    };
}

module.exports = { signingDetailsSummary };
