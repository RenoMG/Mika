// Hate speech and slurs only. Ordinary profanity is left out on purpose.
// Matching is exact (after normalization), not a substring scan.

const WORDS = [
    'nigger', 'niggers', 'nigga', 'niggas',
    'chink', 'chinks',
    'gook', 'gooks',
    'spic', 'spics',
    'kike', 'kikes',
    'wetback', 'wetbacks',
    'beaner', 'beaners',
    'coon', 'coons',
    'paki', 'pakis',
    'wog', 'wogs',
    'raghead', 'ragheads',
    'towelhead', 'towelheads',
    'darkie', 'darkies',
    'zipperhead', 'zipperheads',
    'faggot', 'faggots',
    'fag', 'fags',
    'tranny', 'trannies',
    'retard', 'retards', 'retarded',
    'dyke', 'dykes',
];

const PHRASES = [
    'white power',
    'heil hitler',
];

module.exports = {
    WORDS: new Set(WORDS),
    PHRASES: new Set(PHRASES),
};
