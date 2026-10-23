'use strict';

class WordTemplateError extends Error {
    constructor(code, details = {}) {
        super(code);
        this.name = 'WordTemplateError';
        this.code = code;
        this.details = details;
    }
}

function reject(code, details) { throw new WordTemplateError(code, details); }

module.exports = { WordTemplateError, reject };
