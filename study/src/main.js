import { startGame } from './game/startGame.js';
import { startCubePreview } from './game/cubePreview.js';

const view = new URLSearchParams(window.location.search).get('view');
if (view === 'cube') {
  startCubePreview();
} else {
  startGame();
}