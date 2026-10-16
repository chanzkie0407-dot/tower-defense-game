# 🏰 Fantasy Tower Defense

A playable fantasy-themed tower defense browser game made with vanilla HTML, CSS, JavaScript, and Canvas. It works on desktop and mobile browsers and can be hosted free with GitHub Pages.

## Play

Once GitHub Pages is enabled, open the published URL shown under **Settings → Pages**.

## Features

- Classic path-based tower defense
- Three tower types: Archer, Mage, and Druid
- Automatic targeting and projectile attacks
- Upgrade towers up to level 4
- Waves get progressively harder
- Tough enemies and a boss every fifth wave
- Gold rewards, wave-clear bonuses, lives, pause, and restart
- Mouse and touchscreen controls
- Optional sound effects
- Remembers your best wave in the browser using local storage
- No Node.js, dependencies, or build process

## Controls

1. Select a tower type below the battlefield.
2. Tap/click an empty grass tile to build it. Towers cannot be placed on the road.
3. Press **Start Wave** to send enemies toward your castle.
4. Select a tower you built to upgrade it or sell it.
5. Keep enemies away from the castle. Each enemy that escapes costs a life; bosses cost more.

## Files

```text
fantasy-tower-defense/
├── index.html
├── style.css
├── game.js
└── README.md
```

## Run locally

Download the repository and open `index.html` in a modern browser. No server or install is required.

## Publish with GitHub Pages

1. Create a **public** GitHub repository named `fantasy-tower-defense`.
2. Add `index.html`, `style.css`, `game.js`, and `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Choose branch `main` and folder `/(root)`, then click **Save**.
6. Wait for the deployment to finish. Open the URL displayed in the Pages section. It normally looks like `https://YOUR-USERNAME.github.io/fantasy-tower-defense/`.

## Customize

- Change tower costs, damage, range, cooldown, and projectile speed in `TOWER_TYPES` inside `game.js`.
- Change the road shape by editing `WAYPOINTS`.
- Change colors in `COLORS` and `style.css`.

## Tech

- HTML5
- CSS3
- JavaScript (no frameworks)
- Canvas 2D API

## License

You may use and modify this starter project for learning and personal projects. Add your own license file if you intend to distribute it under specific terms.
