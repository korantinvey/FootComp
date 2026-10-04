import legal from './legal.json';

export type LegalDoc = 'terms' | 'privacy';

/** Public URLs required by the stores (privacy policy, terms/EULA). Fill once the pages are hosted. */
export const LEGAL_URLS: Record<LegalDoc, string> = {
  terms: 'https://[TON-DOMAINE]/conditions.html',
  privacy: 'https://[TON-DOMAINE]/confidentialite.html',
};

export const SUPPORT_EMAIL = legal.publisher.email;

function fill(text: string) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: keyof typeof legal.publisher) => legal.publisher[key] ?? '');
}

export function legalDoc(doc: LegalDoc) {
  const d = legal[doc];
  return {
    title: d.title,
    updatedAt: legal.updatedAt,
    sections: d.sections.map((s) => ({ heading: s.heading, body: fill(s.body) })),
  };
}
