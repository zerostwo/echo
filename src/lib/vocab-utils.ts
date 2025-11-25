
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

