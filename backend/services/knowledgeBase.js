/**
 * Knowledge Base Service
 *
 * Loads structured knowledge from text files and provides
 * keyword-based retrieval for chatbot RAG context injection.
 *
 * Each "chunk" is a topic section from regulatory / firm documents.
 * When the user asks a question, we match keywords to find the most
 * relevant chunks and inject them into the LLM system prompt.
 */

const fs = require('fs');
const path = require('path');

// ── Knowledge chunks ──────────────────────────────────────────────────
// Each chunk: { id, title, keywords[], content }
let _chunks = [];
let _loaded = false;

/**
 * Build keyword-matched chunks from the raw licensing-procedure text.
 * We split by known section headings and assign Hebrew keywords
 * so the retriever can match user queries.
 */
function buildChunksFromText(text) {
    const chunks = [];

    // ── Section splitter: split on known headings ──
    const sections = [
        {
            id: 'general',
            title: 'כללי – נוהל רישוי שירותים פיננסיים מוסדרים',
            keywords: [
                'רישיון', 'רישוי', 'שירותים פיננסיים', 'מוסדרים', 'חוק הפיקוח',
                'מפקח', 'בקשת רישיון', 'הגשת בקשה', 'רשות שוק ההון',
                'license', 'licensing', 'financial services', 'regulated',
                'נוהל', 'הגדרות', 'מערכת מקוונת', 'בסיסי', 'מורחב',
            ],
        },
        {
            id: 'documents_general',
            title: 'דרישת מסמכים לכל מבקשי הרישיונות',
            keywords: [
                'מסמכים', 'תצהיר', 'תעודה מזהה', 'מס הכנסה', 'מס ערך מוסף',
                'ייפוי כוח', 'חשבון בנק', 'רואה חשבון', 'כתב הסכמה',
                'מידע פלילי', 'קורות חיים', 'documents', 'declaration',
                'טופס', 'אקסל', 'נספח',
            ],
        },
        {
            id: 'equity',
            title: 'הון עצמי',
            keywords: [
                'הון עצמי', 'מימון', 'דוחות כספיים', 'מבוקרים', 'רואה חשבון',
                'פיקדון', 'אגרת חוב', 'הצהרת הון', 'שומת מס',
                'equity', 'capital', 'financial statements', 'audited',
                'תוספת הון', 'מכשיר הוני', 'מניות',
            ],
        },
        {
            id: 'org_structure',
            title: 'מבנה ארגוני, דירקטוריון והנהלה בכירה',
            keywords: [
                'מבנה ארגוני', 'דירקטוריון', 'הנהלה', 'נושא משרה', 'מנכ"ל',
                'דירקטור', 'מבקר פנים', 'עובדים', 'תרשים',
                'organizational structure', 'board', 'directors', 'management',
                'יו"ר', 'קצין ניהול סיכונים',
            ],
        },
        {
            id: 'activity_review',
            title: 'סקירת פעילות מבקש הרישיון',
            keywords: [
                'סקירת פעילות', 'מוצרים', 'שירותים', 'לקוחות מהותיים',
                'ספקים', 'הכנסות', 'עסקאות', 'סיכוני סייבר',
                'activity review', 'customers', 'suppliers', 'revenue',
                'תחומי פעילות', 'פעילות עסקית',
            ],
        },
        {
            id: 'fraud_prevention',
            title: 'התמודדות עם מעילות והונאות',
            keywords: [
                'מעילות', 'הונאות', 'בקרה פנימית', 'הפרדת סמכויות',
                'fraud', 'prevention', 'internal control',
            ],
        },
        {
            id: 'privacy_security',
            title: 'שמירה על פרטיות ואבטחת מידע',
            keywords: [
                'פרטיות', 'אבטחת מידע', 'מידע אישי', 'הרשאה', 'גישה',
                'privacy', 'data security', 'information security',
            ],
        },
        {
            id: 'business_continuity',
            title: 'רציפות עסקית',
            keywords: [
                'רציפות עסקית', 'המשכיות', 'התאוששות', 'תכנית יציאה',
                'business continuity', 'disaster recovery',
            ],
        },
        {
            id: 'outsourcing',
            title: 'מיקור חוץ',
            keywords: [
                'מיקור חוץ', 'צד שלישי', 'התקשרות', 'ספקים',
                'outsourcing', 'third party',
            ],
        },
        {
            id: 'customer_treatment',
            title: 'טיפול בלקוחות',
            keywords: [
                'טיפול בלקוחות', 'תלונות', 'שיווק', 'עמלות', 'תעריפים',
                'הסכם', 'תמיכה', 'customer treatment', 'complaints',
                'שירות לקוחות',
            ],
        },
        {
            id: 'aml',
            title: 'ניהול סיכונים למניעת הלבנת הון ומימון טרור',
            keywords: [
                'הלבנת הון', 'מימון טרור', 'ניטור עסקאות', 'דיווח',
                'anti-money laundering', 'AML', 'terrorism financing',
                'חוק איסור הלבנת הון', 'עסקאות חריגות',
            ],
        },
        {
            id: 'stakeholders',
            title: 'מסמכים לבעלי שליטה, בעלי השפעה או בעלי עניין',
            keywords: [
                'בעל שליטה', 'בעל השפעה', 'בעל עניין', 'נושא משרה',
                'stakeholder', 'controlling shareholder', 'officer',
                'שעבודים', 'עיקולים', 'החזקות', 'מניות',
            ],
        },
        {
            id: 'expanded_license',
            title: 'דרישת מסמכים נוספים לבקשת רישיון מורחב',
            keywords: [
                'רישיון מורחב', 'תכנית עסקית', 'אסטרטגיה', 'סיכונים',
                'תחרות', 'expanded license', 'business plan',
                'חוות דעת עורך דין',
            ],
        },
        {
            id: 'credit_license',
            title: 'דרישת מסמכים לרישיון למתן אשראי ומערכת תיווך באשראי',
            keywords: [
                'אשראי', 'תיווך באשראי', 'מדיניות אשראי', 'סיכוני אשראי',
                'הלוואה', 'credit', 'lending', 'loan',
                'בטחונות', 'גביה', 'חשבון נאמנות',
            ],
        },
        {
            id: 'cyber_security',
            title: 'ניהול סיכוני סייבר',
            keywords: [
                'סייבר', 'אבטחת מידע', 'מבדקי חדירה', 'הצפנה', 'ענן',
                'cyber', 'penetration testing', 'encryption', 'cloud',
            ],
        },
        {
            id: 'virtual_currency',
            title: 'רישיון למתן שירות בנכס פיננסי מסוג מטבע וירטואלי',
            keywords: [
                'מטבע וירטואלי', 'קריפטו', 'ביטקוין', 'בלוקצ\'יין',
                'virtual currency', 'crypto', 'bitcoin', 'blockchain',
                'נכס פיננסי', 'stablecoin',
            ],
        },
        {
            id: 'payment_management',
            title: 'רישיון למתן שירות בנכס פיננסי מסוג ניהול תשלום',
            keywords: [
                'ניהול תשלום', 'תשלומים', 'העברת כספים', 'חשבון ייעודי',
                'payment management', 'payment service', 'money transfer',
            ],
        },
        {
            id: 'trust_account',
            title: 'חשבון נאמנות',
            keywords: [
                'חשבון נאמנות', 'נאמן', 'כספי לקוחות', 'מורשי חתימה',
                'trust account', 'escrow', 'client funds',
            ],
        },
    ];

    // For each defined section, search the text for its content
    const textLower = text.toLowerCase();

    for (const section of sections) {
        // Find the best matching portion of text for this section
        const sectionContent = extractSectionContent(text, section.id, section.title);
        if (sectionContent && sectionContent.length > 50) {
            chunks.push({
                id: section.id,
                title: section.title,
                keywords: section.keywords,
                content: sectionContent.slice(0, 4000), // cap each chunk
            });
        }
    }

    // If no sections matched, create one big chunk summary
    if (chunks.length === 0) {
        chunks.push({
            id: 'full_doc',
            title: 'נוהל רישוי שירותים פיננסיים מוסדרים',
            keywords: ['רישיון', 'רישוי', 'שירותים פיננסיים', 'license'],
            content: text.slice(0, 4000),
        });
    }

    return chunks;
}

/**
 * Extract a section's content from the full text based on known heading markers.
 */
function extractSectionContent(fullText, sectionId, sectionTitle) {
    // Map section IDs to heading patterns in the text
    const headingMap = {
        general: { start: /כללי\s*\n/i, end: /דרישת מסמכים לכל מבקשי/ },
        documents_general: { start: /דרישת מסמכים לכל מבקשי/, end: /הון עצמי/ },
        equity: { start: /הון עצמי\s*\n/, end: /מבנה ארגוני.*דירקטוריון/ },
        org_structure: { start: /מבנה ארגוני.*דירקטוריון והנהלה בכירה/, end: /סקירת פעילות מבקש הרישיון/ },
        activity_review: { start: /סקירת פעילות מבקש הרישיון/, end: /התמודדות עם מעילות/ },
        fraud_prevention: { start: /התמודדות עם מעילות והונאות/, end: /שמירה על פרטיות/ },
        privacy_security: { start: /שמירה על פרטיות ואבטחת מידע/, end: /רציפות עסקית/ },
        business_continuity: { start: /רציפות עסקית/, end: /מיקור חוץ\s*\n/ },
        outsourcing: { start: /מיקור חוץ\s*\n/, end: /טיפול\s*ב\s*לקוחות/ },
        customer_treatment: { start: /טיפול\s*ב?\s*לקוחות/, end: /ניהול סיכונים למניעת הלבנת הון/ },
        aml: { start: /ניהול סיכונים למניעת הלבנת הון/, end: /מסמכים לבעלי\s*שליטה/ },
        stakeholders: { start: /מסמכים לבעלי\s*שליטה/, end: /דרישת מסמכים נוספים לבקשת רישיון מורחב/ },
        expanded_license: { start: /דרישת מסמכים נוספים לבקשת רישיון מורחב/, end: /דרישת מסמכים\s*נוספים לבקשת\s*רישיון למתן אשראי/ },
        credit_license: { start: /דרישת מסמכים\s*נוספים לבקשת\s*רישיון למתן אשראי/, end: /ניהול סיכוני סייבר/ },
        cyber_security: { start: /ניהול סיכוני סייבר/, end: /חשבון נאמנות/ },
        trust_account: { start: /חשבון נאמנות/, end: /מבנה ארגוני.*דירקטוריון והנהלה בכירה.*\n.*בנוסף/ },
        virtual_currency: { start: /רישיון למתן שירות בנכס פיננסי.*מטבע וירטואלי/, end: /רישיון למתן שירות בנכס פיננסי.*ניהול תשלום/ },
        payment_management: { start: /רישיון למתן שירות בנכס פיננסי.*ניהול תשלום/, end: /נספח/ },
    };

    const mapping = headingMap[sectionId];
    if (!mapping) return '';

    const startMatch = fullText.match(mapping.start);
    if (!startMatch) return '';

    const startIdx = startMatch.index;
    const afterStart = fullText.slice(startIdx);

    if (mapping.end) {
        const endMatch = afterStart.slice(100).match(mapping.end); // skip first 100 chars to avoid matching start
        if (endMatch) {
            return afterStart.slice(0, 100 + endMatch.index).trim();
        }
    }

    // No end found -> take up to 4000 chars
    return afterStart.slice(0, 4000).trim();
}

// ── Load from files ───────────────────────────────────────────────────

function loadKnowledgeBase() {
    if (_loaded) return;

    const kbDir = path.join(__dirname, '..');
    const licensingFile = path.join(kbDir, 'knowledge_base_licensing.txt');

    try {
        if (fs.existsSync(licensingFile)) {
            const text = fs.readFileSync(licensingFile, 'utf-8');
            const chunks = buildChunksFromText(text);
            _chunks.push(...chunks);
            console.log(`[knowledgeBase] Loaded ${chunks.length} chunks from licensing knowledge base (${text.length} chars)`);
        }
    } catch (err) {
        console.error('[knowledgeBase] Failed to load licensing KB:', err?.message);
    }

    // Load additional .txt knowledge base files from assets/knowledge/
    const kbAssetsDir = path.join(kbDir, 'assets', 'knowledge');
    try {
        if (fs.existsSync(kbAssetsDir)) {
            const files = fs.readdirSync(kbAssetsDir).filter(f => f.endsWith('.txt'));
            for (const file of files) {
                const content = fs.readFileSync(path.join(kbAssetsDir, file), 'utf-8');
                if (content.trim().length > 0) {
                    _chunks.push({
                        id: `kb_${path.basename(file, '.txt')}`,
                        title: path.basename(file, '.txt').replace(/_/g, ' '),
                        keywords: extractKeywordsFromContent(content),
                        content: content.slice(0, 4000),
                    });
                    console.log(`[knowledgeBase] Loaded additional KB: ${file}`);
                }
            }
        }
    } catch (err) {
        console.error('[knowledgeBase] Failed to load additional KB files:', err?.message);
    }

    _loaded = true;
}

/**
 * Extract basic keywords from Hebrew content.
 */
function extractKeywordsFromContent(content) {
    // Take first 500 chars and extract Hebrew word sequences
    const sample = content.slice(0, 500);
    const words = sample.match(/[\u0590-\u05FF]{2,}/g) || [];
    // Return unique words of length >= 3
    return [...new Set(words.filter(w => w.length >= 3))].slice(0, 20);
}

// ── Retrieval ─────────────────────────────────────────────────────────

/**
 * Retrieve the most relevant knowledge chunks for a user query.
 * Returns up to `maxChunks` chunks, scored by keyword overlap.
 *
 * @param {string} query - The user's message
 * @param {number} maxChunks - Max chunks to return (default 3)
 * @returns {{ id: string, title: string, content: string }[]}
 */
function retrieveRelevantChunks(query, maxChunks = 3) {
    loadKnowledgeBase();

    if (_chunks.length === 0 || !query) return [];

    const queryLower = query.toLowerCase();

    // Score each chunk by keyword matches
    const scored = _chunks.map(chunk => {
        let score = 0;
        for (const kw of chunk.keywords) {
            if (queryLower.includes(kw.toLowerCase())) {
                // Longer keywords get higher scores
                score += kw.length;
            }
        }
        // Also check if query words appear in the chunk title
        const titleLower = chunk.title.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length >= 2);
        for (const word of queryWords) {
            if (titleLower.includes(word)) {
                score += 3;
            }
        }
        return { ...chunk, score };
    });

    // Sort by score descending, return top matches with score > 0
    return scored
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxChunks)
        .map(({ id, title, content }) => ({ id, title, content }));
}

/**
 * Format retrieved chunks as context string for the LLM prompt.
 * @param {{ title: string, content: string }[]} chunks
 * @returns {string}
 */
function formatKnowledgeContext(chunks) {
    if (!chunks || chunks.length === 0) return '';

    const parts = ['\n\nמידע מקצועי רלוונטי (מתוך מאגר הידע):'];
    for (const chunk of chunks) {
        parts.push(`\n--- ${chunk.title} ---`);
        parts.push(chunk.content);
    }
    return parts.join('\n');
}

module.exports = {
    loadKnowledgeBase,
    retrieveRelevantChunks,
    formatKnowledgeContext,
};
