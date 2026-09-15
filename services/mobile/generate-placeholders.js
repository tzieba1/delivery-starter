#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Minimal 1x1 blue PNG (base64 decoded)
const bluePNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Minimal 1x1 transparent PNG
const transparentPNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';

// Blue PNG for icon/splash (larger, solid color)
const solidBluePNG = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEfSURBVHic7ZoxDoJAEEVnSSwsbGxsbGxs9AzeQC/gCTyBN/AEnsAbeAJPoI2FjY2NjY0JBQkJS8JCwu4M8F/1Jt/ZJJt5AIwxZrfb7Xa73W632+12u93+f/u/AQAA';

const assetsDir = path.join(__dirname, 'assets');

// Create assets directory if it doesn't exist
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Create placeholder images
const icon = Buffer.from(solidBluePNG, 'base64');
const splash = Buffer.from(solidBluePNG, 'base64');
const adaptiveIcon = Buffer.from(solidBluePNG, 'base64');

fs.writeFileSync(path.join(assetsDir, 'icon.png'), icon);
fs.writeFileSync(path.join(assetsDir, 'splash.png'), splash);
fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.png'), adaptiveIcon);

console.log('✅ Created placeholder assets:');
console.log('   - assets/icon.png');
console.log('   - assets/splash.png');
console.log('   - assets/adaptive-icon.png');
console.log('');
console.log('⚠️  These are minimal placeholders. Replace with proper images later!');
