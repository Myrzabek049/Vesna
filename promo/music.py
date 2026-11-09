# Оригинальная фоновая музыка для промо (синтез): 112 BPM, ~31 с
import numpy as np, wave, sys
SR = 44100; BPM = 112; beat = 60 / BPM; bars = 14; T = bars * 4 * beat + 1.5
n = int(SR * T); L = np.zeros(n); R = np.zeros(n)
t_all = np.arange(n) / SR
def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR); j = min(n, i + len(sig))
    if i >= n: return
    s = sig[:j - i] * gain
    L[i:j] += s * (1 - max(0, pan)); R[i:j] += s * (1 + min(0, pan))
def env(length, a=0.005, d=0.3, s=0.0):
    t = np.arange(int(length * SR)) / SR
    e = np.minimum(1, t / a) * (s + (1 - s) * np.exp(-t / d))
    return t, e
def kick():
    t, e = env(0.45, 0.001, 0.12)
    f = 50 + 120 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * e
def hat(open_=False):
    t, e = env(0.25 if open_ else 0.06, 0.001, 0.08 if open_ else 0.015)
    x = np.random.default_rng(1).standard_normal(len(t))
    x = np.diff(np.concatenate([[0], x]))  # высокие частоты
    return x * e * 0.25
def clap():
    t, e = env(0.3, 0.002, 0.07)
    x = np.random.default_rng(2).standard_normal(len(t))
    return x * e * 0.35
def note(freq, length, kind='pluck'):
    if kind == 'pluck':
        t, e = env(length, 0.003, 0.25)
        return (np.sin(2*np.pi*freq*t) + 0.5*np.sin(2*np.pi*2*freq*t) + 0.2*np.sin(2*np.pi*3*freq*t)) * e * 0.3
    if kind == 'bass':
        t, e = env(length, 0.005, 0.35, 0.4)
        sq = np.sign(np.sin(2*np.pi*freq*t)) * 0.3 + np.sin(2*np.pi*freq*t)
        return sq * e * 0.35
    if kind == 'pad':
        t = np.arange(int(length * SR)) / SR
        e = np.minimum(1, t / 0.4) * np.minimum(1, (length - t) / 0.5)
        x = sum(np.sin(2*np.pi*freq*(1+dt)*t) for dt in (-0.004, 0, 0.005)) / 3
        return x * e * 0.12
mid = lambda m: 440 * 2 ** ((m - 69) / 12)
# Аккорды (Am–F–C–G), своя мелодия
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
bassn = [45, 41, 36, 43]
melody = [76, 74, 72, 74, 76, 79, 76, 72,  72, 74, 76, 72, 69, 72, 74, 76,
          79, 76, 74, 72, 74, 76, 74, 72,  71, 72, 74, 79, 76, 74, 72, 71]
for bar in range(bars):
    t0 = bar * 4 * beat
    ch = chords[bar % 4]
    intro = bar < 2; outro = bar >= bars - 1
    for c in ch: add(note(mid(c), 4 * beat, 'pad'), t0, pan=0.2 * (c % 3 - 1))
    if not intro:
        for b in range(4):
            add(kick(), t0 + b * beat, gain=0.9)
            add(hat(), t0 + b * beat + beat / 2, pan=0.3)
            if b in (1, 3): add(clap(), t0 + b * beat, pan=-0.1)
        for e8 in range(8):
            add(note(mid(bassn[bar % 4]), beat / 2 * 0.9, 'bass'), t0 + e8 * beat / 2)
    if bar >= 4 and not outro:
        for i in range(8):
            m = melody[((bar - 4) % 4) * 8 + i]
            add(note(mid(m), beat * 0.6), t0 + i * beat / 2, pan=0.25 * (1 if i % 2 else -1))
    else:
        for i, c in enumerate(ch * 2 + ch[:2]):
            if i < 8: add(note(mid(c + 12), beat * 0.5), t0 + i * beat / 2, gain=0.6, pan=-0.3)
add(note(mid(57), 2.5, 'pad') * 2, bars * 4 * beat)
# простое эхо и нормализация
for buf in (L, R):
    d = int(beat * 0.75 * SR); buf[d:] += buf[:-d] * 0.18
mx = max(np.abs(L).max(), np.abs(R).max()); L /= mx / 0.85; R /= mx / 0.85
fade = int(1.5 * SR); L[-fade:] *= np.linspace(1, 0, fade); R[-fade:] *= np.linspace(1, 0, fade)
data = (np.stack([L, R], 1) * 32767).astype('<i2').tobytes()
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data)
print('ok', round(T, 2))
