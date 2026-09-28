/**
 * Pre-recorded TTS voice prompts (Silero-generated OGG files).
 * Exact phrase → file match. If the phrase is unknown or playback
 * fails, play() resolves false so the caller can fall back to
 * speechSynthesis.
 */
const VOICE_FILES = new Map([
  ['Подтягивания. 5 повторов.', './assets/sounds/voice/speak_pullup_5.ogg'],
  ['Отжимания. 10 повторов.', './assets/sounds/voice/speak_pushup_10.ogg'],
  ['Приседания. 15 повторов.', './assets/sounds/voice/speak_squat_15.ogg'],
  ['Отдых. Далее: Отжимания.', './assets/sounds/voice/speak_rest_next_pushup.ogg'],
  ['Отдых. Далее: Приседания.', './assets/sounds/voice/speak_rest_next_squat.ogg'],
  ['Круг завершён. Отдых.', './assets/sounds/voice/speak_round_done.ogg'],
  ['Круг 2. Подтягивания. 5 повторов.', './assets/sounds/voice/speak_round2_pullup_5.ogg'],
  ['Круг 2. Отжимания. 10 повторов.', './assets/sounds/voice/speak_round2_pushup_10.ogg'],
  ['Круг 2. Приседания. 15 повторов.', './assets/sounds/voice/speak_round2_squat_15.ogg'],
  ['Круг 3. Подтягивания. 5 повторов.', './assets/sounds/voice/speak_round3_pullup_5.ogg'],
  ['Круг 3. Отжимания. 10 повторов.', './assets/sounds/voice/speak_round3_pushup_10.ogg'],
  ['Круг 3. Приседания. 15 повторов.', './assets/sounds/voice/speak_round3_squat_15.ogg'],
  ['Тренировка завершена!', './assets/sounds/voice/speak_workout_done.ogg'],
]);

let _audio = null;

export function has(text) {
  return VOICE_FILES.has(text);
}

/**
 * Play a pre-recorded phrase. Resolves true when the file played
 * to completion, false when the phrase is unknown or playback failed.
 */
export function play(text) {
  return new Promise((resolve) => {
    const src = VOICE_FILES.get(text);
    if (!src) {
      resolve(false);
      return;
    }
    if (!_audio) _audio = new Audio();
    _audio.src = src;
    _audio.onended = () => resolve(true);
    _audio.onerror = () => resolve(false);
    _audio.play().catch(() => resolve(false));
  });
}