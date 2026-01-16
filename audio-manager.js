const AudioManager = {
  bgm: null,
  sounds: {},

  init() {
    this.bgm = new Audio('path/to/bgm.mp3');
    this.bgm.loop = true;
    this.sounds.hit = new Audio('path/to/hit.mp3');
    this.sounds.damage = new Audio('path/to/damage.mp3');
  },

  playBGM() { this.bgm.play(); },
  stopBGM() { this.bgm.pause(); },
  playSE(name) { if(this.sounds[name]) this.sounds[name].play(); }
};