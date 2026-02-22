/**
 * Simple mustache-style template renderer.
 * Replaces {{variableName}} with corresponding values from the data object.
 *
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {Object} data - Key-value pairs for replacement
 * @returns {string} Rendered string
 */
function renderTemplate(template, data) {
    if (!template || typeof template !== 'string') return '';
    if (!data || typeof data !== 'object') return template;

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const val = data[key];
        return val !== undefined && val !== null ? String(val) : '';
    });
}

module.exports = { renderTemplate };
