# Генератор встроенной библиотеки Vesna: оригинальная музыка и звуковые эффекты (синтез, без чужих семплов).
# Запуск: python3 promo/library_gen.py library  →  WAV-файлы, затем ffmpeg кодирует их в MP3.
import numpy as np, wave, sys, os
SR = 44100
OUT = sys.argv[1]
rng = np.random.default_rng(7)
mid = lambda m: 440 * 2 ** ((m - 69) / 12)

def save(name, L, R=None):
    R = L if R is None else R
    mx = max(np.abs(L).max(), np.abs(R).max(), 1e-9)
    L = L / mx * 0.88; R = R / mx * 0.88
    data = (np.stack([L, R], 1) * 32767).astype('<i2').tobytes()
    with wave.open(name, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data)

def env(n, a=0.005, d=0.3, s=0.0):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * (s + (1 - s) * np.exp(-t / d))

class Song:
    def __init__(self, T): self.n = int(T * SR); self.L = np.zeros(self.n); self.R = np.zeros(self.n)
    def add(self, sig, t, pan=0.0, g=1.0):
        i = int(t * SR); j = min(self.n, i + len(sig))
        if i >= self.n or j <= i: return
        s = sig[:j - i] * g
        self.L[i:j] += s * (1 - max(0, pan)); self.R[i:j] += s * (1 + min(0, pan))

def tone(f, dur, kind='pluck', d=0.25):
    n = int(dur * SR); t = np.arange(n) / SR
    if kind == 'pluck': return (np.sin(2*np.pi*f*t) + .4*np.sin(4*np.pi*f*t) + .15*np.sin(6*np.pi*f*t)) * env(n, .003, d) * .3
    if kind == 'bell': return (np.sin(2*np.pi*f*t) + .3*np.sin(2*np.pi*f*2.76*t)) * env(n, .002, d*2) * .25
    if kind == 'bass': return (np.sin(2*np.pi*f*t) + .3*np.sign(np.sin(2*np.pi*f*t))) * env(n, .005, d, .35) * .35
    if kind == 'pad':
        e = np.minimum(1, t / .5) * np.minimum(1, (dur - t) / .6)
        return sum(np.sin(2*np.pi*f*(1+k)*t) for k in (-.004, 0, .005)) / 3 * e * .12
    if kind == 'saw':
        x = 2 * ((f * t) % 1) - 1
        return x * env(n, .01, d, .3) * .12
def kick():
    n = int(.4*SR); t = np.arange(n)/SR; f = 50 + 110*np.exp(-t*30)
    return np.sin(2*np.pi*np.cumsum(f)/SR) * env(n, .001, .12)
def noise(dur, d): n = int(dur*SR); x = rng.standard_normal(n); return np.diff(np.concatenate([[0], x])) * env(n, .001, d)
def hat(): return noise(.06, .015) * .22
def snare():
    a = noise(.25, .07) * .35; b = tone(190, .15, 'pluck', .05) * .5
    a[:len(b)] += b
    return a

def make_song(name, bpm, bars, chords, bassline, melody, style):
    beat = 60 / bpm; T = bars * 4 * beat + 1.5; s = Song(T)
    for bar in range(bars):
        t0 = bar * 4 * beat; ch = chords[bar % len(chords)]
        intro = bar < 2 and style != 'calm'; outro = bar == bars - 1
        for c in ch: s.add(tone(mid(c), 4*beat, 'pad'), t0, pan=.2*((c % 3)-1))
        if style in ('pop', 'energy') and not intro:
            for b in range(4):
                s.add(kick(), t0 + b*beat, g=.9)
                if style == 'energy': s.add(kick(), t0 + b*beat + beat/2, g=.4)
                s.add(hat(), t0 + b*beat + beat/2, pan=.3)
                if b in (1, 3): s.add(snare(), t0 + b*beat, pan=-.1)
        if style == 'hiphop' and not intro:
            for b, k in enumerate([1, 0, 0, 1, 0, 1, 0, 0]): 
                if k: s.add(kick(), t0 + b*beat/2, g=.9)
            for b in (1, 3): s.add(snare(), t0 + b*beat, g=.9)
            for e in range(8): s.add(hat(), t0 + e*beat/2, pan=.3, g=.8)
        if style != 'calm' and not intro:
            for e in range(8 if style != 'hiphop' else 4):
                step = beat/2 if style != 'hiphop' else beat
                s.add(tone(mid(bassline[bar % len(bassline)]), step*.9, 'bass'), t0 + e*step)
        if not outro and bar >= (1 if style == 'calm' else 2):
            kind = {'calm': 'bell', 'pop': 'pluck', 'energy': 'saw', 'hiphop': 'pluck', 'happy': 'pluck'}[style]
            ph = melody[(bar % 4)]
            for i, m in enumerate(ph):
                if m: s.add(tone(mid(m), beat*.55, kind, .3 if kind != 'bell' else .5), t0 + i*beat/2, pan=.25*(1 if i % 2 else -1), g=.9)
    s.add(tone(mid(chords[0][0]), 2.5, 'pad')*2, bars*4*beat)
    for buf in (s.L, s.R):
        d = int(beat*.75*SR); buf[d:] += buf[:-d]*.16
    f = int(1.2*SR); s.L[-f:] *= np.linspace(1, 0, f); s.R[-f:] *= np.linspace(1, 0, f)
    save(f'{OUT}/music/{name}.wav', s.L, s.R)

# Пять оригинальных треков
make_song('vesna-pop', 112, 16, [[57,60,64],[53,57,60],[48,52,55],[55,59,62]], [45,41,36,43],
  [[76,0,74,72,74,0,76,79],[76,74,72,0,69,72,74,0],[79,76,74,72,74,76,0,72],[71,72,74,0,79,76,74,0]], 'pop')
make_song('spokoyno', 80, 12, [[60,64,67],[57,60,64],[53,57,60],[55,59,62]], [48,45,41,43],
  [[72,0,76,0,79,0,76,0],[74,0,72,0,69,0,0,0],[72,0,74,0,76,0,77,0],[79,0,0,74,0,0,72,0]], 'calm')
make_song('energiya', 128, 16, [[52,55,59],[48,52,55],[50,53,57],[47,50,54]], [40,36,38,35],
  [[64,64,67,64,71,69,67,64],[67,67,71,67,72,71,67,0],[69,69,72,69,74,72,69,67],[66,67,69,71,74,0,71,0]], 'energy')
make_song('ulitsa', 90, 12, [[57,60,64],[50,53,57],[52,55,59],[45,48,52]], [33,38,40,33],
  [[69,0,72,0,0,74,72,0],[0,69,0,67,0,65,0,0],[71,0,74,0,76,0,74,71],[0,72,0,69,0,0,0,0]], 'hiphop')
make_song('solnce', 120, 12, [[60,64,67],[55,59,62],[57,60,64],[53,57,60]], [48,43,45,41],
  [[79,76,79,84,79,76,72,0],[74,71,74,79,74,71,67,0],[76,72,76,81,76,72,69,0],[77,76,74,72,74,76,79,0]], 'pop')

# Звуковые эффекты
def sfx(name, sig): save(f'{OUT}/sfx/{name}.wav', sig)
t = lambda d: np.arange(int(d*SR))/SR
x = t(.45); sw = rng.standard_normal(len(x)); 
from numpy.fft import rfft, irfft
def band(sig, lo, hi):
    F = rfft(sig); fr = np.fft.rfftfreq(len(sig), 1/SR); F[(fr < lo) | (fr > hi)] = 0; return irfft(F, len(sig))
w = band(sw, 300, 4000) * np.sin(np.pi * x / x[-1]) ** 2
sfx('whoosh', w)
x = t(.18); sfx('pop', np.sin(2*np.pi*np.cumsum(300 + 900*np.exp(-x*40))/SR) * env(len(x), .001, .05))
x = t(.08); sfx('click', np.sin(2*np.pi*1800*x) * env(len(x), .0005, .01) + noise(.08, .006)*.3)
x = t(1.2); sfx('ding', (np.sin(2*np.pi*1318*x) + .5*np.sin(2*np.pi*2637*x) + .2*np.sin(2*np.pi*3951*x)) * env(len(x), .002, .35))
sfx('tada', np.concatenate([tone(mid(72), .12, 'pluck', .1), tone(mid(76), .12, 'pluck', .1), tone(mid(79), .9, 'bell', .4)]))
x = t(.6); sfx('fail', np.sin(2*np.pi*np.cumsum(420 - 220*x/x[-1])/SR) * env(len(x), .01, .25, .4) * np.sign(np.sin(2*np.pi*8*x)).clip(0, 1) * .8 + np.sin(2*np.pi*np.cumsum(420 - 220*x/x[-1])/SR) * env(len(x), .01, .25, .4) * .3)
x = t(1.4); ap = np.zeros(len(x))
for o in rng.uniform(0, 1.2, 90):
    c = noise(.05, .012); k = int(o*SR); ap[k:k+len(c)] += c[:len(ap)-k] * rng.uniform(.4, 1)
sfx('aplodismenty', ap * np.minimum(1, (x[-1]-x)/.4))
x = t(.7); sfx('boom', (np.sin(2*np.pi*np.cumsum(40 + 80*np.exp(-x*8))/SR) * env(len(x), .002, .3) + band(rng.standard_normal(len(x)), 40, 600) * env(len(x), .002, .15) * .5))
x = t(.35); sfx('boop', np.sin(2*np.pi*np.cumsum(500 + 500*(x/x[-1]))/SR) * env(len(x), .005, .12) )
print('ok')
