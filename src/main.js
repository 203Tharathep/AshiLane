import { Game } from './game/Game.js';

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window.game = game;

  // Auto-open prefilled Join Room modal if URL has ?room=CODE
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    setTimeout(() => {
      game.ui.openJoinRoomModal(roomParam);
    }, 350);
  }
});

