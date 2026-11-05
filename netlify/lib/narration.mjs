import { createEspeak } from '@spelling-creator/spellophone';
import { Mp3Encoder } from '@breezystack/lamejs';

let engine;
export async function narrate({guide, narration}) {
  engine ??= createEspeak().catch(error => { engine = null; throw error; });
  const speech = await engine;
  const primary = guide.language.toLowerCase().split('-')[0];
  speech.setVoice(({zh:'cmn', en:'en-us'})[primary] || primary);
  const sampleRate = speech.sampleRate;
  const encoder = new Mp3Encoder(1,sampleRate,48);
  const frames = [], cueSeconds = [], captions = [];
  const pause = new Int16Array(Math.round(sampleRate * .13));
  let elapsed = 0;

  const append = samples => {
    for (let offset = 0; offset < samples.length; offset += 1152) {
      const frame = encoder.encodeBuffer(samples.subarray(offset,offset+1152));
      if (frame.length) frames.push(Buffer.from(frame));
    }
    elapsed += samples.length;
  };

  narration.forEach((chapter, chapterIndex) => {
    cueSeconds.push(elapsed / sampleRate);
    chapter.forEach(text => {
      const {samples} = speech.synthesize(text,{rate:162});
      if (!samples.length) throw new Error('Speech synthesis produced no audio');
      const start = elapsed / sampleRate;
      append(samples);
      captions.push({chapterIndex,start,end:elapsed/sampleRate,text});
      append(pause);
    });
  });

  frames.push(Buffer.from(encoder.flush()));
  return {
    bytes:Buffer.concat(frames),
    audio:{language:guide.language, duration:elapsed/sampleRate, cueSeconds, captions, narrationProvider:'espeak-ng'}
  };
}
