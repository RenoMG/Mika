// One root command, /guess, with subcommands. Discord will not run a parent
// that has subcommands, so a round starts with /guess play.

const GUESS_CACHE_TARGET = 200;
const GUESS_FRESH_CHANCE = 0.12;
const GUESS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GUESS_RECENT_LIMIT = 50;
const GUESS_PLAYER_RECENT_LIMIT = 20;
const GUESS_BATCH_ATTEMPTS = 12;
const GUESS_BATCH_ADDITIONS = 4;
const GUESS_SHOWN_CAP = 60;
const GUESS_ATTEMPTS = 6;
const GUESS_ROUND_MS = 30 * 1000;
const GUESS_HINT_BONUS_MS = 10 * 1000;
const GUESS_CRYSTALS = 50;
const GUESS_PLAY_LIMIT = 10;
// Rolling hour: the 11th play waits until the oldest of those 10 is 60 minutes old.
const GUESS_PLAY_WINDOW_MS = 60 * 60 * 1000;
const GUESS_INTERVAL_MIN = 10;
const GUESS_INTERVAL_MAX = 1440;
const GUESS_INTERVAL_DEFAULT = 10;
const GUESS_BOARD_LIMIT = 50;
const GUESS_PAGE_SIZE = 10;
const GUESS_BOARD_TIMEOUT_MS = 120000;
const SHIKIMORI_MIN_INTERVAL_MS = 200;
const SHIKIMORI_MAX_PER_MINUTE = 90;
const SHIKIMORI_TIMEOUT_MS = 8000;
const SHIKIMORI_USER_AGENT = 'Mika-DiscordBot/1.0 (+https://github.com/RenoMG/Mika)';
const MIN_FUZZY_LENGTH = 5;

const SHIKIMORI_DOWN = 'Shikimori is unavailable right now. Try again in a minute.';
const NO_SCREENSHOT = "Couldn't find a screenshot right now. Try again in a minute.";
const NO_VARIETY = "I'm getting some different anime ready. Try again in a minute. This didn't use a play.";
const ROUND_BUSY = 'You already have a round running in this channel.';
const INTENT_MISSING = 'Guess That Anime needs the Message Content intent. In the Discord Developer Portal, open Applications, then Mika, then Bot, then Privileged Gateway Intents. Enable MESSAGE CONTENT INTENT, click Save Changes, and restart Mika.';

module.exports = {
    GUESS_CACHE_TARGET,
    GUESS_FRESH_CHANCE,
    GUESS_CACHE_TTL_MS,
    GUESS_RECENT_LIMIT,
    GUESS_PLAYER_RECENT_LIMIT,
    GUESS_BATCH_ATTEMPTS,
    GUESS_BATCH_ADDITIONS,
    GUESS_SHOWN_CAP,
    GUESS_ATTEMPTS,
    GUESS_ROUND_MS,
    GUESS_HINT_BONUS_MS,
    GUESS_CRYSTALS,
    GUESS_PLAY_LIMIT,
    GUESS_PLAY_WINDOW_MS,
    GUESS_INTERVAL_MIN,
    GUESS_INTERVAL_MAX,
    GUESS_INTERVAL_DEFAULT,
    GUESS_BOARD_LIMIT,
    GUESS_PAGE_SIZE,
    GUESS_BOARD_TIMEOUT_MS,
    SHIKIMORI_MIN_INTERVAL_MS,
    SHIKIMORI_MAX_PER_MINUTE,
    SHIKIMORI_TIMEOUT_MS,
    SHIKIMORI_USER_AGENT,
    MIN_FUZZY_LENGTH,
    SHIKIMORI_DOWN,
    NO_SCREENSHOT,
    NO_VARIETY,
    ROUND_BUSY,
    INTENT_MISSING,
};
