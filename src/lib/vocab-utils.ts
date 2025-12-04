
export const POS_MAP: Record<string, string> = {
    n: "Noun",
    v: "Verb",
    adj: "Adjective",
    adv: "Adverb",
    prep: "Preposition",
    conj: "Conjunction",
    pron: "Pronoun",
    art: "Article",
    num: "Number",
    int: "Interjection",
    x: "Other",
};

export const EXCHANGE_MAP: Record<string, string> = {
    p: "Past Tense",
    d: "Past Participle",
    i: "Present Participle",
    3: "3rd Person Singular",
    r: "Comparative",
    t: "Superlative",
    s: "Plural",
    0: "Lemma",
    1: "Lemma Transform",
};

export const TAG_MAP: Record<string, string> = {
    zk: "Middle School",
    gk: "High School",
    cet4: "CET-4",
    cet6: "CET-6",
    toefl: "TOEFL",
    ielts: "IELTS",
    gre: "GRE",
    ky: "Postgrad",
};

export function parsePos(posString: string | null | undefined) {
    if (!posString) return [];
    // Format: n:46/v:54
    return posString.split('/').map(part => {
        const [code, percentage] = part.split(':');
        return {
            code,
            label: POS_MAP[code] || code,
            percentage: percentage ? `${percentage}%` : ''
        };
    });
}

export function parseExchange(exchangeString: string | null | undefined) {
    if (!exchangeString) return [];
    // Format: d:perceived/p:perceived/3:perceives/i:perceiving
    return exchangeString.split('/').map(part => {
        const [code, word] = part.split(':');
        return {
            code,
            label: EXCHANGE_MAP[code] || code,
            word
        };
    });
}

export function parseTags(tagString: string | null | undefined) {
    if (!tagString) return [];
    // Format: zk gk cet4
    return tagString.split(' ').map(tag => ({
        code: tag,
        label: TAG_MAP[tag] || tag
    }));
}

/**
 * Get all word forms from exchange string including the lemma itself.
 * This is useful for highlighting any form of the word in context sentences.
 * 
 * @param lemma The base/lemma form of the word (e.g., "spend")
 * @param exchangeString The exchange field from dictionary (e.g., "d:spent/p:spent/i:spending/3:spends/s:spends")
 * @returns Array of all word forms including the lemma
 */
export function getAllWordForms(lemma: string, exchangeString: string | null | undefined): string[] {
    const forms = new Set<string>();
    
    // Always include the lemma
    if (lemma) {
        forms.add(lemma.toLowerCase());
    }
    
    if (exchangeString) {
        // Format: d:perceived/p:perceived/3:perceives/i:perceiving
        const parts = exchangeString.split('/');
        for (const part of parts) {
            const colonIndex = part.indexOf(':');
            if (colonIndex > 0) {
                const word = part.substring(colonIndex + 1).trim();
                if (word && word.length > 0) {
                    forms.add(word.toLowerCase());
                }
            }
        }
    }
    
    return Array.from(forms);
}

/**
 * Create a regex pattern that matches any form of the word.
 * Uses word boundaries and case-insensitive matching.
 * 
 * @param wordForms Array of word forms to match
 * @returns RegExp that matches any of the word forms
 */
export function createWordFormsRegex(wordForms: string[]): RegExp {
    if (wordForms.length === 0) return /(?!)/; // Never matches
    
    // Sort by length descending to match longer forms first (e.g., "spending" before "spend")
    const sortedForms = [...wordForms].sort((a, b) => b.length - a.length);
    
    // Escape special regex characters and join with |
    const pattern = sortedForms
        .map(form => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    
    return new RegExp(`\\b(${pattern})\\b`, 'gi');
}

