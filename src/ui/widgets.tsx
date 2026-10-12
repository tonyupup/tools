import { ComponentChildren } from 'preact';

export function Slider(p: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onLive: (v: number) => void; onDone: () => void }) {
  return (
    <div class="field">
      <label>{p.label}<span class="val">{p.value}{p.unit ?? ''}</span></label>
      <input type="range" min={p.min} max={p.max} step={p.step ?? 1} value={p.value}
        onInput={e => p.onLive(Number((e.target as HTMLInputElement).value))} onChange={p.onDone}
        onDblClick={() => { p.onLive(p.label.match(/亮度|对比度|饱和度/) ? 100 : 0); p.onDone(); }} />
    </div>
  );
}

export function Section(p: { title: string; children: ComponentChildren; open?: boolean; advanced?: boolean }) {
  return (
    <details class={'sec' + (p.advanced ? ' adv' : '')} open={p.open ?? true}>
      <summary>{p.title}{p.advanced && <em>高级</em>}</summary>
      <div class="sec-body">{p.children}</div>
    </details>
  );
}

export function Chips<T extends string | number>(p: { value: T; options: { v: T; label: string; title?: string }[]; onPick: (v: T) => void }) {
  return (
    <div class="chips">
      {p.options.map(o => (
        <button type="button" key={String(o.v)} title={o.title} class={'chip' + (o.v === p.value ? ' on' : '')} onClick={() => p.onPick(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}
