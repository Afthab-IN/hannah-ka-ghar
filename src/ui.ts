// Start screen, clock and time controls, places menu, prompts and toasts.

export interface Place { name: string; x: number; z: number; yaw: number; y?: number }

export interface UIHooks {
  start: () => void;
  getHour: () => number;
  setHour: (h: number) => void;
  cycle: { on: boolean; speed: number };
  setSound: (on: boolean) => void;
  setRain: (on: boolean) => void;
  travel: (p: Place) => void;
  places: Place[];
  use: () => void;
  jump: () => void;
}

const el = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export function fmtHour(h: number) {
  h = ((h % 24) + 24) % 24;
  let hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ap = hh >= 12 ? 'pm' : 'am';
  hh = hh % 12 || 12;
  return `${hh}:${String(mm).padStart(2, '0')} ${ap}`;
}

export class UI {
  root = el('div', 'ui');
  prompt = el('div', 'prompt');
  useBtn = el('button', 'tbtn use');
  toastEl = el('div', 'toast');
  clock = el('button', 'chip clock');
  private timePanel = el('div', 'panel time');
  private placesPanel = el('div', 'panel places');
  private overlay = el('div', 'start');
  private pause = el('div', 'pausehint', 'Click to keep walking');
  private slider!: HTMLInputElement;
  private cycleBtn!: HTMLButtonElement;
  private toastTimer = 0;
  private rainBtn!: HTMLButtonElement;
  raining = false;
  toggleRain() {
    this.raining = !this.raining;
    this.rainBtn.textContent = this.raining ? 'Gentle rain' : 'Clear sky';
    this.h.setRain(this.raining);
  }
  started = false;
  isTouch: boolean;

  constructor(private h: UIHooks, isTouch: boolean) {
    this.isTouch = isTouch;
    document.body.classList.toggle('touch', isTouch);
    this.buildStart();
    this.buildHud();
    document.body.append(this.root);
  }

  private buildStart() {
    const o = this.overlay;
    const how = this.isTouch
      ? `<li><b>Left thumb</b> walk (push further to run)</li><li><b>Right thumb</b> drag to look around</li><li><b>Tap</b> doors, horses, bread, chairs to use them</li>`
      : `<li><b>W A S D</b> walk, <b>Shift</b> run, <b>Space</b> jump</li><li><b>Mouse</b> look around</li><li><b>E</b> or <b>click</b> use doors, chairs, horses, bread</li><li><b>Esc</b> frees the mouse</li>`;
    o.innerHTML = `
      <div class="card">
        <div class="eyebrow">A small farm at sundown</div>
        <h1>Hannah ka Ghar</h1>
        <p class="lede">A white farmhouse on a gentle hill, horses in the paddock, bread in the oven at Crumb &amp; Clover. Walk in, sit by the fire, stay till the stars come out.</p>
        <ul class="how">${how}</ul>
        <button class="go">${this.isTouch ? 'Tap to walk in' : 'Click to walk in'}</button>
        <div class="fine">Sound on for birdsong. Best on a laptop or iPad.</div>
      </div>`;
    o.querySelector('.go')!.addEventListener('click', () => {
      o.classList.add('gone');
      this.started = true;
      this.h.start();
    });
    document.body.append(o);
    this.pause.addEventListener('click', () => this.h.start());
    this.root.append(this.pause);
  }

  showPause(on: boolean) { this.pause.classList.toggle('on', on && this.started && !this.isTouch); }

  private buildHud() {
    const top = el('div', 'topbar');
    this.clock.innerHTML = '<span class="ico"></span><span class="t"></span>';
    this.clock.addEventListener('click', () => this.togglePanel(this.timePanel));
    const placesBtn = el('button', 'chip', 'Places');
    placesBtn.addEventListener('click', () => this.togglePanel(this.placesPanel));
    let soundOn = true;
    const soundBtn = el('button', 'chip', 'Sound on') as HTMLButtonElement;
    soundBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
      this.h.setSound(soundOn);
    });
    const rainBtn = el('button', 'chip', 'Clear sky') as HTMLButtonElement;
    this.rainBtn = rainBtn;
    rainBtn.addEventListener('click', () => this.toggleRain());
    top.append(this.clock, placesBtn, rainBtn, soundBtn);
    this.root.append(top);

    // time panel
    const tp = this.timePanel;
    tp.innerHTML = '<div class="ph">Time of day</div>';
    const row = el('div', 'row');
    this.slider = document.createElement('input');
    this.slider.type = 'range'; this.slider.min = '0'; this.slider.max = '24'; this.slider.step = '0.01';
    this.slider.addEventListener('input', () => { this.h.cycle.on = false; this.syncCycle(); this.h.setHour(parseFloat(this.slider.value)); });
    row.append(this.slider);
    tp.append(row);
    const presets = el('div', 'presets');
    for (const [n, hr] of [['Sunrise', 6.4], ['Morning', 9], ['Noon', 12.5], ['Golden hour', 18.6], ['Sunset', 19.15], ['Starry night', 23]] as [string, number][]) {
      const b = el('button', 'pbtn', n);
      b.addEventListener('click', () => { this.h.setHour(hr); });
      presets.append(b);
    }
    tp.append(presets);
    this.cycleBtn = el('button', 'pbtn wide') as HTMLButtonElement;
    this.cycleBtn.addEventListener('click', () => { this.h.cycle.on = !this.h.cycle.on; this.syncCycle(); });
    tp.append(this.cycleBtn);
    this.syncCycle();
    this.root.append(tp);

    // places
    const pp = this.placesPanel;
    pp.innerHTML = '<div class="ph">Go to</div>';
    const list = el('div', 'plist');
    for (const p of this.h.places) {
      const b = el('button', 'pbtn', p.name);
      b.addEventListener('click', () => { this.h.travel(p); this.togglePanel(null); });
      list.append(b);
    }
    pp.append(list);
    this.root.append(pp);

    // crosshair + prompt
    this.root.append(el('div', 'cross'));
    this.root.append(this.prompt);
    // touch buttons
    this.useBtn.addEventListener('click', (e) => { e.stopPropagation(); this.h.use(); });
    const jump = el('button', 'tbtn jump', 'Jump');
    jump.addEventListener('click', (e) => { e.stopPropagation(); this.h.jump(); });
    this.root.append(this.useBtn, jump, this.toastEl);
  }

  private syncCycle() {
    this.cycleBtn.textContent = this.h.cycle.on ? 'Pause the clock' : 'Let time run';
  }

  private togglePanel(p: HTMLElement | null) {
    for (const q of [this.timePanel, this.placesPanel]) q.classList.toggle('on', q === p && !q.classList.contains('on'));
    if (p && document.pointerLockElement) document.exitPointerLock();
  }

  panelOpen() { return this.timePanel.classList.contains('on') || this.placesPanel.classList.contains('on'); }
  closePanels() { this.togglePanel(null); }

  setTarget(label: string | null) {
    if (label) {
      this.prompt.innerHTML = this.isTouch ? '' : `<span class="key">E</span>${label}`;
      this.prompt.classList.toggle('on', !this.isTouch);
      this.useBtn.textContent = label;
      this.useBtn.classList.add('on');
    } else {
      this.prompt.classList.remove('on');
      this.useBtn.classList.remove('on');
    }
  }

  toast(msg: string, ms = 2600) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  tick(hour: number, night: number) {
    (this.clock.querySelector('.t') as HTMLElement).textContent = fmtHour(hour);
    (this.clock.querySelector('.ico') as HTMLElement).className = 'ico ' + (night > 0.5 ? 'moon' : 'sun');
    if (document.activeElement !== this.slider) this.slider.value = String(hour);
  }
}
