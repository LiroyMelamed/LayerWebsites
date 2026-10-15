'use strict';
// Display-only QA proposal. This does not create a subscription or authorize a charge.
// Cost assumptions and sources: docs/office-integrations/README.md.
module.exports = Object.freeze({
    version: 'qa-proposal-2026-10-15', currency: 'ILS', monthlyAmount: 99,
    setupAmount: 0, vatMode: 'exempt', includedNumbers: 1, metaChargesIncluded: false,
    billingActive: false,
});
