'use strict';

// Product identity is independent of tenant branding. In particular, an office
// named MelamedLaw is still identified by its tenant UUID (or dedicated DB).
module.exports = Object.freeze({
    organization: Object.freeze({ key: 'melamedia', name: 'MelaMedia' }),
    project: Object.freeze({ key: 'melamedlaw', name: 'MelamedLaw' }),
});
