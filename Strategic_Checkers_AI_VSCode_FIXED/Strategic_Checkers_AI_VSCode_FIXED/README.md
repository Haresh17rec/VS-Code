# Strategic Checkers AI — VS Code Edition

A standalone American/English checkers game with a Minimax + Alpha-Beta AI opponent.

## Run in VS Code (Windows)
1. Extract this ZIP to a normal folder (do not run it from inside the ZIP preview).
2. Open VS Code → **File → Open Folder** → select `Strategic_Checkers_AI_VSCode_FIXED`.
3. Open `index.html`.
4. Either double-click `index.html` in File Explorer to open it in Chrome/Edge, or install the recommended **Live Server** extension and click **Go Live** in VS Code.
5. Click **Play the Game**.

No Node.js, npm, React, Python, or internet connection is needed to play. The AI now runs locally in the page instead of depending on a browser Web Worker, avoiding common worker-loading problems with local VS Code previews. AI difficulty still changes its search budget/depth.

## Developer names
The supplied project currently displays **Auxin Sam (241901012)** and **Haresh (241901031)** on the home screen and game screen. If a different friend name should appear, replace those names in `index.html` (search for `Auxin Sam` and `Haresh`).

## Optional automated tests
The original QA harness is retained in `qa/`. It tests the original worker-based AI implementation; the VS Code edition uses a local AI execution path for compatibility, so the old worker-specific test report is historical and should not be treated as a test report for this modified edition.
