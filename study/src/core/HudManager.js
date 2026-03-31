export class HudManager {
  constructor() {
    this.elements = null;
    this.miniMapCtx = null;
  }

  init() {
    const miniMap = document.getElementById('miniMap');
    this.elements = {
      topPlayersList: document.getElementById('topPlayersList'),
      eventFeed: document.getElementById('eventFeed'),
      miniMap
    };
    this.miniMapCtx = miniMap ? miniMap.getContext('2d') : null;
  }

  renderTopPlayers(players) {
    if (!this.elements) return;
    if (!this.elements.topPlayersList) return;

    this.elements.topPlayersList.innerHTML = '';
    const top = Array.isArray(players) ? players.slice(0, 10) : [];
    for (const p of top) {
      const li = document.createElement('li');
      li.textContent = `${p.rank}. ${p.name}`;
      if (p.isPlayer) li.className = 'me';

      const score = document.createElement('strong');
      score.textContent = `${p.value}`;
      li.appendChild(score);

      this.elements.topPlayersList.appendChild(li);
    }
  }

  pushEatEvent(text) {
    if (!this.elements || !this.elements.eventFeed || !text) return;
    const toast = document.createElement('div');
    toast.className = 'event-toast';
    toast.textContent = text;
    this.elements.eventFeed.appendChild(toast);

    window.setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2600);
  }

  renderMiniMap(miniMapData) {
    if (!this.miniMapCtx || !this.elements || !this.elements.miniMap) return;
    const ctx = this.miniMapCtx;
    const canvas = this.elements.miniMap;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, w, h);

    if (!miniMapData || !Array.isArray(miniMapData.items)) return;

    const half = Math.max(1, miniMapData.playAreaHalf || 1);
    const scaleX = w / (half * 2);
    const scaleY = h / (half * 2);
    for (const item of miniMapData.items) {
      const x = Math.floor((item.x + half) * scaleX);
      const y = Math.floor((item.z + half) * scaleY);
      ctx.fillStyle = item.color || '#fff';
      const s = item.size || 3;
      ctx.fillRect(x, y, s, s);
    }
  }

  render(players, miniMapData = null) {
    this.renderMiniMap(miniMapData);
    this.renderTopPlayers(players);
    if (this.elements && this.elements.topPlayersList && this.elements.topPlayersList.children.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No players';
      this.elements.topPlayersList.appendChild(li);
    }
  }
}
