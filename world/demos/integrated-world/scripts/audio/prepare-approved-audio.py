"""Build game masters from the reviewed originals: python3 script.py REVIEW_ROOT.
Requires numpy and ffmpeg. No synthesis, compression, denoising or dynamic normalization.
"""
import hashlib, json, shutil, subprocess, sys, wave
from pathlib import Path
import numpy as np

review = Path(sys.argv[1])
output = Path(__file__).resolve().parents[2] / 'assets/audio'
output.mkdir(parents=True, exist_ok=True)
selected = json.loads((review / 'accepted-round-2-manifest.json').read_text())['assets']
selected = [a for a in selected if not a['categoryId'].startswith('07_')]
selected.append(dict(categoryId='07_grass_wind', label='草随风（已验收短循环）',
    file='grass-body-edit/07_grass_wind_body_loop.wav', model='eleven_text_to_sound_v2',
    historyId='ENzxrXD9ldPx8KvFrqHC',
    sha256='71dfcb7b6bc4b60fe6dc2b529480bc395788eb852e10409c0cf3e26f2f5ffcd6',
    approvalSource='conversation: 可以了，保留这个版本吧，现在把音效落地到我们项目吧'))
# Boundaries selected around isolated contacts, avoiding the next contact. Preserve natural tails.
steps = {2: [(0.04,.68),(1.10,1.81),(1.87,2.47),(2.52,3.16)],
         3: [(.03,.54),(.64,1.23),(1.39,2.02),(2.13,2.68)],
         4: [(.41,1.26),(1.49,2.48),(2.58,3.54),(3.67,4.66)],
         16: [(.02,1.06),(1.22,2.48),(2.66,3.56),(4.38,5.18)]}
names = {1:'leaves',2:'step-grass',3:'step-dirt',4:'step-water',5:'wind',6:'gust',7:'grass',8:'shrub',9:'stream',10:'lake',11:'rain-light',12:'rain-heavy',13:'thunder-near',14:'thunder-far',15:'ocean',16:'step-snow'}
assets=[]
for a in sorted(selected,key=lambda a:a['categoryId']):
    number=int(a['categoryId'][:2]); name=names[number]; src=review/a['file']
    digest=hashlib.sha256(src.read_bytes()).hexdigest()
    if digest != a['sha256']: raise ValueError(f'Source changed: {src}')
    channels=2 if number in (5,6,11,12,7) else 1
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(src),'-f','f32le','-ac',str(channels),'-ar','48000','-'])
    x=np.frombuffer(raw,np.float32).reshape(-1,channels).copy()
    for variant,(start,end) in enumerate(steps.get(number,[(0,len(x)/48000)])):
        y=x[round(start*48000):round(end*48000)].copy()
        is_loop=number not in (2,3,4,13,14,16)
        crossfade=0
        if is_loop and number!=7:
            crossfade=.35; n=round(crossfade*48000)
            t=np.linspace(0,np.pi/2,n,endpoint=True)[:,None]
            y=np.concatenate((y[n:-n], y[-n:]*np.cos(t)+y[:n]*np.sin(t)))
        elif not is_loop:
            fade=min(round(.008*48000),len(y)//2)
            y[:fade]*=np.linspace(0,1,fade)[:,None]
            fade=min(round(.065*48000),len(y)//2)
            y[-fade:]*=np.linspace(1,0,fade)[:,None]
        # A fixed per-file calibration; runtime mixing applies contextual category levels separately.
        rms=float(np.sqrt(np.mean(y.astype(np.float64)**2))); peak=float(np.max(np.abs(y)))
        gain=min(10**(-23/20)/max(rms,1e-9),10**(-3/20)/max(peak,1e-9))
        file=f'{name}{"-"+str(variant+1) if number in steps else ""}.wav'
        destination=output/file
        if number==7:
            shutil.copyfile(src,destination) # Preserve the exact approved loop, including every sample.
        else:
            y*=gain
            with wave.open(str(destination),'wb') as w:
                w.setnchannels(channels);w.setsampwidth(2);w.setframerate(48000)
                w.writeframes((np.clip(y,-1,1)*32767).round().astype('<i2').tobytes())
        assets.append(dict(id=file[:-4],file=file,category=name,loop=is_loop,
            durationSeconds=len(y)/48000,channels=channels,decodeGain=gain if number==7 else 1,
            sourceFile=a['file'],sourceSha256=digest,model=a['model'],historyId=a.get('historyId'),
            approvalSource=a.get('approvalSource','reviews/round-2-user-review.json'),
            sourceRangeSeconds=[start,end],loopCrossfadeSeconds=crossfade,
            calibrationGainDb=20*np.log10(gain),sha256=hashlib.sha256(destination.read_bytes()).hexdigest()))
manifest=dict(schemaVersion=1,status='16 approved source categories prepared for local game integration',
    direction='自然、和谐；无 BGM；安静时留白；动作与场景一致',
    licensing='Generation provenance retained. Local integration does not establish commercial distribution rights; verify the generation account plan and provider terms before commercial release.',
    assets=assets)
(output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'{len(assets)} runtime files / {sum((output/a["file"]).stat().st_size for a in assets)/1024**2:.2f} MiB')
