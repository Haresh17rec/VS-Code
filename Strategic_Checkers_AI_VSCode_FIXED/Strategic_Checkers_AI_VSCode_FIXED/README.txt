STRATEGIC CHECKERS AI — FINAL
American / English Checkers + Minimax + Alpha-Beta Pruning

HOW TO RUN
1. Extract the ZIP.
2. Double-click RUN_CHECKERS.bat on Windows, or open index.html in Chrome, Edge, or Firefox.
3. The project home screen appears first. Use Play the Game, Rules & How to Play, or How the AI Works.
4. No Python, npm, server, login, internet connection, or installation is required.

FRONT UI / REVIEW MODE
- Project home screen with one-click Play the Game button.
- Developer credits: Auxin Sam (241901012) and Haresh (241901031).
- Dedicated Rules & How to Play page.
- Dedicated How the AI Works page explaining the real runtime AI pipeline.
- In-game Rules / help modal, Quick Rules card and AI Proof card.

FINAL RULE SET
- 8x8 American / English checkers board with 12 pieces per side.
- Red is the human and moves first; black is the AI.
- Captures are mandatory.
- If the same piece can capture again after a jump, it MUST continue.
- A full multi-jump capture chain is ONE turn, even though each jump is animated separately.
- Men move and capture diagonally forward.
- Kings move/capture one diagonal square/jump in both directions; there are no flying kings.
- Reaching the king row promotes the man and ends that capture turn.
- When more than one legal capture chain is available, the player may choose among the legal chains.
- A player with no pieces or legal moves loses.
- Draw safeguards: threefold position repetition or 80 quiet turns.

IMPORTANT DOUBLE-TURN FIX
The AI is protected by a single-owner turn controller:
- only one AI job can own a reply;
- the board has one AI commit point;
- duplicate/late worker messages cannot create another move;
- fallback search cannot race a worker result;
- rapid clicks cannot queue a second AI turn;
- New Game and Undo cancel all pending AI work and animations.

A forced multi-jump is NOT a second AI turn. Example:
    b6 x d4 x f2
is shown as two jump animations, but it is one legal move, one history entry, and one AI turn.

AI FEATURES
- Minimax adversarial search
- Alpha-beta pruning
- Iterative deepening
- Move ordering
- Transposition cache
- Material / kings / mobility / advancement / center / safety heuristic
- Background Web Worker when available
- Safe local fallback if Worker is unavailable
- Easy / Medium / Hard difficulty
- Visible AI thinking and movement pacing
- Top candidate moves and evaluation statistics

MOVE COACH
After your completed turn, the coach compares it with the best move found by the search and displays:
- 0–100 score when a reliable comparison is available
- Best / Great / Good / Inaccuracy / Mistake / Blunder style feedback
- evaluation loss
- coach search depth

CONTROLS
- AI difficulty: Easy, Medium, Hard
- AI pace: Steady or Slow
- Undo turn: restores the position before your previous human+AI round, or cancels an unfinished human capture chain
- New game: resets the board and all analysis

VALIDATION
The included deterministic test suite checks the actual shipped JavaScript rules engine, minimax search, controller, worker behavior, cancellation behavior, capture chains, king loops, promotion, draw handling, undo, and strict human/AI alternation.

Final validation result: 49 / 49 tests passed.
Stress simulation: 300 seeded games, 20,666 plies, 5,715 captures, 956 promotions.

Optional developer check (Node.js 18+; no npm install needed):
    node qa/run-tests.cjs

FILES
- index.html          Complete standalone game
- RUN_CHECKERS.bat    Windows launcher
- START_HERE.txt      Quick instructions
- PROJECT_NOTES.txt   Technical design notes
- TEST_RESULTS.txt    Human-readable test summary
- TEST_RESULTS.json   Machine-readable test report
- qa/                 Repeatable test harness
