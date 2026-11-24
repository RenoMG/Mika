const RESPONSES = {
    movie: ["You're on the right track! Which movie is it?", "Close! I'm looking for the movie's name.", "You've got the series! Can you name the movie?"],
    entry: ["Right series, different entry. Try again!", "You're close! Think of another season or movie.", "Almost! It's a different entry in that series."],
    specific: ["Close! Can you be a little more specific?", "You're on the right track! I need a bit more of the title.", "Almost there! Try a more specific title."],
    wrong: ["Not quite! Give it another shot.", "That's not the one. Try again!", "Nope, keep guessing!"],
};
function feedbackText(kind, previous = '', random = Math.random) {
    const choices = (RESPONSES[kind] || RESPONSES.specific).filter((text) => text !== previous);
    return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))];
}
module.exports = { feedbackText, RESPONSES };
