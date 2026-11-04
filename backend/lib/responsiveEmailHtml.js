'use strict';

/** Normalize legacy desktop-width wrappers at the shared send boundary, preserving template content. */
function responsiveEmailHtml(input) {
    return String(input || '').replace(/<(body|table|td|div|p|a|img)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag, kind) => {
        if (/\bdata-mela-fluid=["']1["']/i.test(tag)) return tag;
        const styleMatch = tag.match(/\sstyle\s*=\s*(["'])(.*?)\1/i);
        const style = styleMatch?.[2] || '';
        const width = style.match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)\s*(px|rem)\b/i);
        const attr = tag.match(/\swidth\s*=\s*["']?(\d+)(?:px)?(?:["'\s>])/i);
        const fixedWidth = width ? Number(width[1]) * (width[2].toLowerCase() === 'rem' ? 16 : 1) : Number(attr?.[1] || 0);
        let additions = '';
        if (kind.toLowerCase() === 'img') additions = 'max-width:100%;height:auto;';
        else if (kind.toLowerCase() === 'body') additions = 'margin:0;width:100%;max-width:100%;';
        else if (kind.toLowerCase() === 'table') {
            additions = 'max-width:100%;';
            if (fixedWidth >= 480) {
                additions = `width:100%;max-width:${fixedWidth}px;table-layout:fixed;`;
                tag = tag.replace(/\swidth\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, ' width="100%"');
            }
        } else additions = 'overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;';
        const newStyle = `${style.trim().replace(/;?$/, ';')}${additions}`;
        if (styleMatch) tag = tag.replace(/\sstyle\s*=\s*(["'])(.*?)\1/i, () => ` style=${styleMatch[1]}${newStyle}${styleMatch[1]}`);
        else tag = tag.replace(/\s*\/?>(?=$)/, ` style="${newStyle}"${/\/>$/.test(tag) ? ' /' : ''}>`);
        return tag.replace(/^<(\w+)/, '<$1 data-mela-fluid="1"');
    });
}
module.exports = { responsiveEmailHtml };
