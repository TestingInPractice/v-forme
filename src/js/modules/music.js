/**
 * OPFS-based music library.
 * Stores audio files in OPFS for offline persistence.
 * Plays via a single <audio> element. Supports ducking.
 */

const TRACKS_DIR = 'tracks';   // dir name inside OPFS root
const TRACKS_INDEX = 'tracks-index'; // key for IndexedDB index of {name, opfsName}[]

let _dir = null;
let _audio = null;
let _tracks = [];       // [{name, opfsName, objectUrl}]
let _currentIndex = -1;
let _normalVolume = 1.0;
let _duckPercent = 90;   // default: duck to 10%
let _playing = false;

function getAudio() {
  if (!_audio) {
    _audio = new Audio();
    _audio.addEventListener('ended', () => _playNext());
    _audio.addEventListener('error', () => _playNext());
  }
  return _audio;
}

async function getDir() {
  if (_dir) return _dir;
  const root = await navigator.storage.getDirectory();
  _dir = await root.getDirectoryHandle(TRACKS_DIR, { create: true });
  return _dir;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Import audio files into OPFS and rebuild track list. */
export async function importFiles(fileList) {
  const dir = await getDir();
  for (const file of fileList) {
    const name = generateId() + '_' + file.name.replace(/[^a-zA-Zа-яА-Я0-9._-]/g, '_');
    const fh = await dir.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(file);
    await writable.close();
  }
  await _refreshList();
}

async function _refreshList() {
  const dir = await getDir();
  _tracks = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      const objectUrl = URL.createObjectURL(file);
      const displayName = name.replace(/^[^_]+_/, '').replace(/\.[^.]+$/, '');
      _tracks.push({ name, opfsName: name, objectUrl, displayName });
    }
  }
  _tracks.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
}

export async function getTracks() {
  if (_tracks.length === 0) await _refreshList();
  return _tracks.map(t => ({ name: t.opfsName, displayName: t.displayName, objectUrl: t.objectUrl }));
}

export async function removeTrack(opfsName) {
  const dir = await getDir();
  await dir.removeEntry(opfsName);
  const wasPlaying = _playing;
  const wasIndex = _currentIndex;
  stop();
  await _refreshList();
  // if the removed track was playing, try to continue
  if (wasPlaying && _tracks.length > 0) {
    const idx = Math.min(wasIndex, _tracks.length - 1);
    await playIndex(idx);
  }
}

export function setDuckPercent(percent) {
  _duckPercent = percent; // e.g. 90 means duck to 10%
  if (_playing) _applyVolume();
}

export function setNormalVolume(vol) {
  _normalVolume = Math.max(0, Math.min(1, vol));
  if (_playing && !_isDucked) _applyVolume();
}

let _isDucked = false;

export function duck() {
  _isDucked = true;
  _applyVolume();
}

export function unduck() {
  _isDucked = false;
  _applyVolume();
}

function _applyVolume() {
  const audio = getAudio();
  if (_isDucked) {
    audio.volume = _normalVolume * (1 - _duckPercent / 100);
  } else {
    audio.volume = _normalVolume;
  }
}

export async function playIndex(index) {
  if (_tracks.length === 0) return;
  index = ((index % _tracks.length) + _tracks.length) % _tracks.length;
  _currentIndex = index;
  const audio = getAudio();
  audio.src = _tracks[index].objectUrl;
  _applyVolume();
  try {
    await audio.play();
    _playing = true;
  } catch {
    // autoplay blocked — user needs interaction
    _playing = false;
  }
}

export async function play() {
  const audio = getAudio();
  if (audio.src && audio.paused) {
    _applyVolume();
    await audio.play();
    _playing = true;
  } else if (_tracks.length > 0) {
    await playIndex(_currentIndex >= 0 ? _currentIndex : 0);
  }
}

export function pause() {
  const audio = getAudio();
  audio.pause();
  _playing = false;
}

export function stop() {
  const audio = getAudio();
  audio.pause();
  audio.currentTime = 0;
  audio.removeAttribute('src');
  _playing = false;
  _currentIndex = -1;
  _isDucked = false;
}

function _playNext() {
  if (_tracks.length === 0) return;
  playIndex(_currentIndex + 1);
}

export function next() { _playNext(); }

export function prev() {
  if (_tracks.length === 0) return;
  const audio = getAudio();
  // if >3s into track, restart it; otherwise go to previous
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else {
    playIndex(_currentIndex - 1);
  }
}

export function isPlaying() { return _playing; }
export function currentIndex() { return _currentIndex; }

export function getAudioElement() { return getAudio(); }

export function reorder(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const [item] = _tracks.splice(fromIdx, 1);
  _tracks.splice(toIdx, 0, item);
  // fix current index
  if (_currentIndex === fromIdx) _currentIndex = toIdx;
  else if (fromIdx < _currentIndex && toIdx >= _currentIndex) _currentIndex--;
  else if (fromIdx > _currentIndex && toIdx <= _currentIndex) _currentIndex++;
}
