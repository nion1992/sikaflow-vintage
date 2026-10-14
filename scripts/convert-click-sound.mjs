// One-off converter: public/sounds/click.ogg (Vorbis) → public/sounds/click.wav
// Safari/iOS cannot decode Ogg Vorbis, so the UI click sound is shipped as WAV.
// To re-run: bun add -d @wasm-audio-decoders/ogg-vorbis && bun scripts/convert-click-sound.mjs
// (the decoder is removed afterwards to keep the app dependency tree lean).
import { readFile, writeFile } from "node:fs/promises";
import { OggVorbisDecoder } from "@wasm-audio-decoders/ogg-vorbis";

const input = await readFile("public/sounds/click.ogg");
const decoder = new OggVorbisDecoder();
await decoder.ready;
const { channelData, samplesDecoded, sampleRate } = await decoder.decodeFile(
  new Uint8Array(input),
);
decoder.free();

if (!samplesDecoded || !channelData?.length) {
  throw new Error("Decoding produced no samples.");
}

// Downmix to mono (a UI click does not need stereo) and trim trailing silence.
const left = channelData[0];
const right = channelData[1] ?? channelData[0];
let mono = new Float32Array(samplesDecoded);
for (let i = 0; i < samplesDecoded; i++) {
  mono[i] = (left[i] + right[i]) / (channelData[1] ? 2 : 1);
}

// Trim leading/trailing samples below -60 dBFS so the click fires instantly.
const threshold = 0.001;
let start = 0;
let end = mono.length - 1;
while (start < end && Math.abs(mono[start]) < threshold) start++;
while (end > start && Math.abs(mono[end]) < threshold) end--;
mono = mono.slice(start, end + 1);

// Normalise to a comfortable UI level (peak ≈ 0.7) for a soft, unobtrusive click.
let peak = 0;
for (const sample of mono) peak = Math.max(peak, Math.abs(sample));
const gain = peak > 0 ? 0.7 / peak : 1;

const numChannels = 1;
const bytesPerSample = 2;
const dataBytes = mono.length * numChannels * bytesPerSample;
const buffer = new ArrayBuffer(44 + dataBytes);
const view = new DataView(buffer);

function writeString(offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

writeString(0, "RIFF");
view.setUint32(4, 36 + dataBytes, true);
writeString(8, "WAVE");
writeString(12, "fmt ");
view.setUint32(16, 16, true); // PCM chunk size
view.setUint16(20, 1, true); // PCM format
view.setUint16(22, numChannels, true);
view.setUint32(24, sampleRate, true);
view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
view.setUint16(32, numChannels * bytesPerSample, true); // block align
view.setUint16(34, 16, true); // bits per sample
writeString(36, "data");
view.setUint32(40, dataBytes, true);

let offset = 44;
for (const sample of mono) {
  const clamped = Math.max(-1, Math.min(1, sample * gain));
  view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  offset += 2;
}

await writeFile("public/sounds/click.wav", Buffer.from(buffer));
console.log(
  `Wrote public/sounds/click.wav — ${sampleRate} Hz, mono, ` +
    `${(mono.length / sampleRate).toFixed(3)}s, ${(buffer.byteLength / 1024).toFixed(1)} KB`,
);
