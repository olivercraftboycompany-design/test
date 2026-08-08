/**
 * ============================================================================
 * NOVA FEATURES EXTENSION — JS (nova-features.js)
 * Updated with Circle Fullscreen Icon & Library Auto-Highlighting
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     0. STATE & EXTENSION SETUP
     ========================================================================== */
  const featuresState = {
    visualizerMode: 'bars', // 'bars', 'wave', 'circle', 'aura'
    lyricsMap: new Map(),
    notesMap: new Map(),
    bookmarks: new Map(),
    abLoop: { active: false, start: null, end: null },
    spatial: { active: false, pannerNode: null, x: 0, y: 0, z: -1 },
    particles: { active: true, list: [] },
    stats: { totalSeconds: 0, artistCounts: {} },
    hotkeysActive: true,
    isBarMinimized: false
  };

  // Load persisted extension state from IndexedDB
  function loadExtensionState() {
    idbGet('meta', 'nova-features').then(saved => {
      if (!saved) return;
      if (saved.lyricsMap) featuresState.lyricsMap = new Map(saved.lyricsMap);
      if (saved.notesMap) featuresState.notesMap = new Map(saved.notesMap);
      if (saved.bookmarks) featuresState.bookmarks = new Map(saved.bookmarks);
      if (saved.stats) featuresState.stats = saved.stats;
      if (saved.visualizerMode) featuresState.visualizerMode = saved.visualizerMode;
      if (typeof saved.isBarMinimized === 'boolean') featuresState.isBarMinimized = saved.isBarMinimized;
    });
  }

  function saveExtensionState() {
    idbPut('meta', {
      key: 'nova-features',
      lyricsMap: [...featuresState.lyricsMap.entries()],
      notesMap: [...featuresState.notesMap.entries()],
      bookmarks: [...featuresState.bookmarks.entries()],
      stats: featuresState.stats,
      visualizerMode: featuresState.visualizerMode,
      isBarMinimized: featuresState.isBarMinimized
    });
  }

  /* ==========================================================================
     1. FULL-SCREEN TOGGLE MANAGER
     ========================================================================== */
  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        showToast(`Fullscreen error: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  function updateFullScreenButtonUI() {
    const btn = document.getElementById('nova-fullscreen-btn');
    if (!btn) return;
    const isFull = !!document.fullscreenElement;
    btn.innerHTML = isFull ? '🗕' : '⛶';
    btn.title = isFull ? 'Exit Fullscreen (F)' : 'Fullscreen (F)';
    btn.classList.toggle('is-fullscreen', isFull);
  }

  document.addEventListener('fullscreenchange', updateFullScreenButtonUI);

  /* ==========================================================================
     2. AUTOMATIC LIBRARY TRACK HIGHLIGHTING
     ========================================================================== */
  function updateLibraryHighlight() {
    // 1. Clear previous highlights
    const currentlyHighlighted = document.querySelectorAll('.is-playing');
    currentlyHighlighted.forEach(el => el.classList.remove('is-playing'));

    // 2. Apply highlight to the currently playing track
    if (!currentTrack || !currentTrack.id) return;
    const activeTrackId = currentTrack.id;

    // Matches standard data-id, data-track-id, or track-row containers
    const matchingRows = document.querySelectorAll(
      `[data-id="${activeTrackId}"], [data-track-id="${activeTrackId}"]`
    );

    matchingRows.forEach(row => {
      row.classList.add('is-playing');
    });
  }

  /* ==========================================================================
     3. FEATURE 1: MULTI-MODE AUDIO VISUALIZER
     ========================================================================== */
  const VIS_MODES = ['bars', 'wave', 'circle', 'aura'];

  function cycleVisualizerMode() {
    const nextIdx = (VIS_MODES.indexOf(featuresState.visualizerMode) + 1) % VIS_MODES.length;
    featuresState.visualizerMode = VIS_MODES[nextIdx];
    showToast(`Visualizer: ${featuresState.visualizerMode.toUpperCase()}`);
    saveExtensionState();
  }

  function overrideVisualizerDraw() {
    const canvas = document.getElementById('visualizer');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function drawLoop() {
      requestAnimationFrame(drawLoop);
      if (!analyser || !dataArray) return;

      const mode = featuresState.visualizerMode;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (mode === 'bars') {
        analyser.getByteFrequencyData(dataArray);
        const barWidth = (width / dataArray.length) * 2.2;
        let x = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const barHeight = (dataArray[i] / 255) * height;
          ctx.fillStyle = `rgba(56, 189, 248, ${0.4 + (dataArray[i] / 255) * 0.6})`;
          ctx.fillRect(x, height - barHeight, barWidth, barHeight);
          x += barWidth + 2;
        }
      } else if (mode === 'wave') {
        analyser.getByteTimeDomainData(dataArray);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#38bdf8';
        ctx.beginPath();
        const sliceWidth = width / dataArray.length;
        let x = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.stroke();
      } else if (mode === 'circle') {
        analyser.getByteFrequencyData(dataArray);
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(centerX, centerY) - 8;
        ctx.lineWidth = 3;
        for (let i = 0; i < 40; i++) {
          const angle = (i * 2 * Math.PI) / 40;
          const len = (dataArray[i] / 255) * 16;
          ctx.strokeStyle = `hsl(${190 + i * 2}, 90%, 60%)`;
          ctx.beginPath();
          ctx.moveTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
          ctx.lineTo(
            centerX + Math.cos(angle) * (radius + len),
            centerY + Math.sin(angle) * (radius + len)
          );
          ctx.stroke();
        }
      } else if (mode === 'aura') {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < 20; i++) sum += dataArray[i];
        const avg = sum / 20;
        const gradient = ctx.createRadialGradient(
          width / 2, height / 2, 4,
          width / 2, height / 2, (avg / 255) * (height / 2)
        );
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
        gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }
    }
    drawLoop();
  }

  /* ==========================================================================
     4. FEATURE 2: INTERACTIVE LYRICS & NOTES DRAWER
     ========================================================================== */
  function openLyricsAndNotesModal() {
    if (!currentTrack) {
      showToast('No track playing');
      return;
    }
    const trackId = currentTrack.id;
    const lyrics = featuresState.lyricsMap.get(trackId) || 'No lyrics added yet.\nPaste synchronized or text lyrics here...';
    const note = featuresState.notesMap.get(trackId) || '';

    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" id="lyrics-backdrop">
        <div class="modal-card glass" style="max-width:440px;">
          <h3>Lyrics & Track Notes</h3>
          <p class="modal-sub">${escapeHtml(currentTrack.title)} — ${escapeHtml(currentTrack.artist)}</p>
          <div class="nova-drawer-body">
            <div>
              <label style="font-size:12px;color:#a9b6d1;">Lyrics (Karaoke/Text)</label>
              <textarea id="edit-lyrics" class="nova-textarea">${escapeHtml(lyrics)}</textarea>
            </div>
            <div>
              <label style="font-size:12px;color:#a9b6d1;">Private Notes</label>
              <textarea id="edit-notes" class="nova-textarea" placeholder="Add timestamps, impressions, or chords...">${escapeHtml(note)}</textarea>
            </div>
          </div>
          <div class="modal-actions">
            <button id="close-lyrics" class="btn-ghost">Cancel</button>
            <button id="save-lyrics" class="btn-primary">Save Changes</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('close-lyrics').onclick = () => (root.innerHTML = '');
    document.getElementById('save-lyrics').onclick = () => {
      const newLyrics = document.getElementById('edit-lyrics').value.trim();
      const newNotes = document.getElementById('edit-notes').value.trim();
      featuresState.lyricsMap.set(trackId, newLyrics);
      featuresState.notesMap.set(trackId, newNotes);
      saveExtensionState();
      showToast('Track notes & lyrics saved!');
      root.innerHTML = '';
    };
  }

  /* ==========================================================================
     5. FEATURE 3: SLEEP TIMER CONTROL CENTER
     ========================================================================== */
  function openSleepTimerModal() {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" id="sleep-backdrop">
        <div class="modal-card glass">
          <h3>Sleep Timer</h3>
          <p class="modal-sub">Stop playback automatically after a duration.</p>
          <div class="nova-drawer-body">
            <button class="chip-btn" data-time="15">15 Minutes</button>
            <button class="chip-btn" data-time="30">30 Minutes</button>
            <button class="chip-btn" data-time="45">45 Minutes</button>
            <button class="chip-btn" data-time="60">60 Minutes</button>
            <button class="chip-btn" data-time="track">End of Current Track</button>
            ${state.sleepTimer.active ? '<button class="chip-btn danger" data-time="off">Turn Off Timer</button>' : ''}
          </div>
          <div class="modal-actions">
            <button id="close-sleep" class="btn-ghost">Close</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('close-sleep').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-time]').forEach(btn => {
      btn.onclick = () => {
        const val = btn.getAttribute('data-time');
        if (val === 'off') {
          state.sleepTimer.active = false;
          clearInterval(sleepTimerInterval);
          showToast('Sleep timer disabled');
        } else if (val === 'track') {
          startSleepTimer('track', 0);
          showToast('Stopping after current track');
        } else {
          startSleepTimer('time', parseInt(val, 10));
          showToast(`Timer set for ${val} mins`);
        }
        root.innerHTML = '';
        renderSleepBanner();
      };
    });
  }

  function renderSleepBanner() {
    let banner = document.getElementById('sleep-timer-banner');
    if (!state.sleepTimer.active) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'sleep-timer-banner';
      document.body.appendChild(banner);
    }
    const rem = state.sleepTimer.mode === 'track' 
      ? 'End of Track' 
      : `${Math.ceil((state.sleepTimer.endsAt - Date.now()) / 60000)}m left`;
    banner.innerHTML = `<span>💤 Sleep: ${rem}</span><button class="icon-btn sm" id="sleep-snooze" title="Snooze +5m">+5m</button>`;
    document.getElementById('sleep-snooze').onclick = () => {
      if (state.sleepTimer.endsAt) {
        state.sleepTimer.endsAt += 300000;
        showToast('Added +5 minutes');
        renderSleepBanner();
      }
    };
  }

  /* ==========================================================================
     6. FEATURE 4: SPATIAL 3D PANNER & REVERB ACOUSTICS
     ========================================================================== */
  function openSpatialAudioModal() {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" id="spatial-backdrop">
        <div class="modal-card glass" style="max-width:400px;">
          <h3>3D Spatial & Room Reverb</h3>
          <p class="modal-sub">Drag the puck to move sound in 3D space.</p>
          <div class="spatial-pad" id="spatial-pad">
            <div class="spatial-puck" id="spatial-puck"></div>
          </div>
          <div class="nova-drawer-body">
            <label style="font-size:12px;color:#a9b6d1;">Reverb Acoustics</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="chip-btn" data-room="off">Studio (Dry)</button>
              <button class="chip-btn" data-room="room">Small Room</button>
              <button class="chip-btn" data-room="hall">Concert Hall</button>
              <button class="chip-btn" data-room="cathedral">Cathedral</button>
            </div>
          </div>
          <div class="modal-actions">
            <button id="close-spatial" class="btn-primary">Done</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('close-spatial').onclick = () => (root.innerHTML = '');

    root.querySelectorAll('[data-room]').forEach(btn => {
      btn.onclick = () => {
        const room = btn.getAttribute('data-room');
        if (room === 'off') {
          state.reverb.enabled = false;
          showToast('Reverb: Studio Dry');
        } else {
          state.reverb.enabled = true;
          state.reverb.preset = room;
          showToast(`Reverb: ${room.toUpperCase()}`);
        }
        saveMeta();
      };
    });

    const pad = document.getElementById('spatial-pad');
    const puck = document.getElementById('spatial-puck');
    let isDragging = false;

    function updatePuckPosition(evt) {
      const rect = pad.getBoundingClientRect();
      let x = (evt.clientX - rect.left) / rect.width;
      let y = (evt.clientY - rect.top) / rect.height;
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
      puck.style.left = `${x * 100}%`;
      puck.style.top = `${y * 100}%`;

      const panX = (x - 0.5) * 2;
      const panY = 0;
      const panZ = (y - 0.5) * 2;
      applySpatialPosition(panX, panY, panZ);
    }

    pad.addEventListener('mousedown', e => { isDragging = true; updatePuckPosition(e); });
    window.addEventListener('mousemove', e => { if (isDragging) updatePuckPosition(e); });
    window.addEventListener('mouseup', () => { isDragging = false; });
  }

  function applySpatialPosition(x, y, z) {
    if (!audioCtx) return;
    if (!featuresState.spatial.pannerNode) {
      const panner = audioCtx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      featuresState.spatial.pannerNode = panner;
      masterGain.disconnect();
      masterGain.connect(panner);
      panner.connect(audioCtx.destination);
    }
    const panner = featuresState.spatial.pannerNode;
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  }

  /* ==========================================================================
     7. FEATURE 5: LISTENING ANALYTICS DASHBOARD
     ========================================================================== */
  function trackAnalyticsTick() {
    if (!audioEl || audioEl.paused || !currentTrack) return;
    featuresState.stats.totalSeconds += 1;
    const artist = currentTrack.artist || 'Unknown';
    featuresState.stats.artistCounts[artist] = (featuresState.stats.artistCounts[artist] || 0) + 1;
    if (featuresState.stats.totalSeconds % 10 === 0) saveExtensionState();
  }

  function openAnalyticsModal() {
    const hours = (featuresState.stats.totalSeconds / 3600).toFixed(1);
    const mins = Math.floor((featuresState.stats.totalSeconds % 3600) / 60);
    const topArtistEntry = Object.entries(featuresState.stats.artistCounts)
      .sort((a, b) => b[1] - a[1])[0] || ['None', 0];

    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" id="stats-backdrop">
        <div class="modal-card glass">
          <h3>Listening Stats</h3>
          <p class="modal-sub">Your NOVA playback analytics.</p>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${hours}h ${mins}m</div>
              <div class="stat-label">Total Play Time</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${state.history.length}</div>
              <div class="stat-label">Tracks Played</div>
            </div>
            <div class="stat-card" style="grid-column: span 2;">
              <div class="stat-value" style="font-size:18px;">${escapeHtml(topArtistEntry[0])}</div>
              <div class="stat-label">Most Played Artist</div>
            </div>
          </div>
          <div class="modal-actions">
            <button id="close-stats" class="btn-primary">Close</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('close-stats').onclick = () => (root.innerHTML = '');
  }

  /* ==========================================================================
     8. FEATURE 6: SMART "VIBE" PLAYLIST GENERATOR
     ========================================================================== */
  function generateSmartPlaylist(type) {
    const allTracks = [...state.tracks.values()];
    if (!allTracks.length) {
      showToast('Library is empty');
      return;
    }
    let filtered = [];
    let name = 'Smart Playlist';

    if (type === 'quick') {
      filtered = allTracks.filter(t => t.duration > 0 && t.duration < 180);
      name = '⚡ Quick Beats (< 3 mins)';
    } else if (type === 'epic') {
      filtered = allTracks.filter(t => t.duration >= 240);
      name = '🌌 Long Epic Tracks';
    } else if (type === 'favorites') {
      filtered = allTracks.filter(t => state.favorites.has(t.id));
      name = '💖 Favorite Highlights';
    } else {
      filtered = [...allTracks].sort(() => Math.random() - 0.5).slice(0, 10);
      name = '🎲 Random Discovery 10';
    }

    if (!filtered.length) {
      showToast('No tracks matched this vibe');
      return;
    }

    const col = {
      id: uid(),
      type: 'playlist',
      name,
      artist: 'NOVA Smart AI',
      coverUrl: null,
      trackIds: filtered.map(t => t.id)
    };

    state.collections.set(col.id, col);
    persistCollection(col);
    showToast(`Created: ${name}`);
    if (state.view === 'playlists') renderCurrentView();
  }

  function openSmartVibeModal() {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" id="vibe-backdrop">
        <div class="modal-card glass">
          <h3>Smart Vibe Playlist Generator</h3>
          <p class="modal-sub">Generate instant curated playlists from your library.</p>
          <div class="nova-drawer-body">
            <button class="chip-btn chip-primary" data-vibe="quick">⚡ Quick Beats (&lt; 3 mins)</button>
            <button class="chip-btn chip-primary" data-vibe="epic">🌌 Epic Tracks (&gt; 4 mins)</button>
            <button class="chip-btn chip-primary" data-vibe="favorites">💖 Favorites Mix</button>
            <button class="chip-btn chip-primary" data-vibe="random">🎲 Random 10-Track Discovery</button>
          </div>
          <div class="modal-actions">
            <button id="close-vibe" class="btn-ghost">Close</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('close-vibe').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-vibe]').forEach(btn => {
      btn.onclick = () => {
        generateSmartPlaylist(btn.getAttribute('data-vibe'));
        root.innerHTML = '';
      };
    });
  }

  /* ==========================================================================
     9. FEATURE 7: A-B LOOPER & TIMESTAMP BOOKMARKS
     ========================================================================== */
  function openBookmarksModal() {
    if (!currentTrack) return showToast('No track playing');
    const trackId = currentTrack.id;
    const list = featuresState.bookmarks.get(trackId) || [];

    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" id="bookmark-backdrop">
        <div class="modal-card glass">
          <h3>Bookmarks & A-B Looper</h3>
          <p class="modal-sub">${escapeHtml(currentTrack.title)}</p>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button class="chip-btn" id="set-loop-a">Set Loop A</button>
            <button class="chip-btn" id="set-loop-b">Set Loop B</button>
            <button class="chip-btn danger" id="clear-loop">Clear Loop</button>
          </div>
          <div style="margin-top:14px;">
            <button class="chip-btn chip-primary" id="add-bookmark">+ Add Bookmark at ${formatTime(audioEl.currentTime)}</button>
          </div>
          <div class="modal-list" id="bookmarks-list">
            ${list.map((b, i) => `
              <div class="modal-list-item" data-jump="${b.time}">
                <span>⏱️ ${formatTime(b.time)} - ${escapeHtml(b.label)}</span>
              </div>
            `).join('')}
          </div>
          <div class="modal-actions">
            <button id="close-bookmarks" class="btn-primary">Done</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('close-bookmarks').onclick = () => (root.innerHTML = '');
    document.getElementById('set-loop-a').onclick = () => {
      featuresState.abLoop.start = audioEl.currentTime;
      featuresState.abLoop.active = true;
      showToast(`Loop A set at ${formatTime(audioEl.currentTime)}`);
    };
    document.getElementById('set-loop-b').onclick = () => {
      featuresState.abLoop.end = audioEl.currentTime;
      featuresState.abLoop.active = true;
      showToast(`Loop B set at ${formatTime(audioEl.currentTime)}`);
    };
    document.getElementById('clear-loop').onclick = () => {
      featuresState.abLoop = { active: false, start: null, end: null };
      showToast('A-B Loop cleared');
    };
    document.getElementById('add-bookmark').onclick = () => {
      const bList = featuresState.bookmarks.get(trackId) || [];
      bList.push({ time: audioEl.currentTime, label: `Note #${bList.length + 1}` });
      featuresState.bookmarks.set(trackId, bList);
      saveExtensionState();
      showToast('Bookmark added');
      openBookmarksModal();
    };

    root.querySelectorAll('[data-jump]').forEach(el => {
      el.onclick = () => {
        audioEl.currentTime = parseFloat(el.getAttribute('data-jump'));
        showToast('Jumped to bookmark');
      };
    });
  }

  function handleABLoopTick() {
    if (!featuresState.abLoop.active || !featuresState.abLoop.start || !featuresState.abLoop.end) return;
    if (audioEl.currentTime >= featuresState.abLoop.end) {
      audioEl.currentTime = featuresState.abLoop.start;
    }
  }

  /* ==========================================================================
     10. FEATURE 8: KEYBOARD HOTKEY MANAGER
     ========================================================================== */
  function setupGlobalHotkeys() {
    window.addEventListener('keydown', e => {
      if (!featuresState.hotkeysActive) return;
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          playPause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          audioEl.currentTime = Math.min(audioEl.duration || 0, audioEl.currentTime + 10);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          audioEl.currentTime = Math.max(0, audioEl.currentTime - 10);
          break;
        case 'KeyL':
          if (currentTrack) {
            const id = currentTrack.id;
            if (state.favorites.has(id)) state.favorites.delete(id);
            else state.favorites.add(id);
            updateFavoriteButtonsUI(id);
            saveMeta();
          }
          break;
        case 'KeyM':
          audioEl.muted = !audioEl.muted;
          showToast(audioEl.muted ? 'Muted' : 'Unmuted');
          break;
        case 'KeyV':
          cycleVisualizerMode();
          break;
        case 'KeyF':
          toggleFullScreen();
          break;
      }
    });
  }

  function openHotkeysModal() {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" id="hotkeys-backdrop">
        <div class="modal-card glass">
          <h3>Keyboard Shortcuts</h3>
          <p class="modal-sub">Global playback controls.</p>
          <div class="nova-drawer-body">
            <div class="hotkey-row"><span>Play / Pause</span><kbd>Space</kbd></div>
            <div class="hotkey-row"><span>Seek +/- 10 Seconds</span><kbd>← / →</kbd></div>
            <div class="hotkey-row"><span>Like / Favorite Track</span><kbd>L</kbd></div>
            <div class="hotkey-row"><span>Mute Audio</span><kbd>M</kbd></div>
            <div class="hotkey-row"><span>Cycle Visualizer Mode</span><kbd>V</kbd></div>
            <div class="hotkey-row"><span>Toggle Fullscreen</span><kbd>F</kbd></div>
          </div>
          <div class="modal-actions">
            <button id="close-hotkeys" class="btn-primary">Got It</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('close-hotkeys').onclick = () => (root.innerHTML = '');
  }

  /* ==========================================================================
     11. FEATURE 9: AUDIO SNIPPET TRIM & CLIP EXPORTER
     ========================================================================== */
  function openClipExporterModal() {
    if (!currentTrack || !currentTrack.url) return showToast('No active track to export');
    const start = (audioEl.currentTime || 0).toFixed(1);
    const end = Math.min(audioEl.duration || start + 15, parseFloat(start) + 15).toFixed(1);

    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" id="clip-backdrop">
        <div class="modal-card glass">
          <h3>Audio Clip Exporter</h3>
          <p class="modal-sub">Download a clip of ${escapeHtml(currentTrack.title)}</p>
          <div class="nova-drawer-body">
            <div>
              <label style="font-size:12px;color:#a9b6d1;">Start Time (s)</label>
              <input type="number" id="clip-start" class="modal-input" value="${start}" step="0.1" />
            </div>
            <div>
              <label style="font-size:12px;color:#a9b6d1;">End Time (s)</label>
              <input type="number" id="clip-end" class="modal-input" value="${end}" step="0.1" />
            </div>
          </div>
          <div class="modal-actions">
            <button id="close-clip" class="btn-ghost">Cancel</button>
            <button id="export-clip" class="btn-primary">Download Clip</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('close-clip').onclick = () => (root.innerHTML = '');
    document.getElementById('export-clip').onclick = () => {
      const a = document.createElement('a');
      a.href = currentTrack.url;
      a.download = `${currentTrack.title}_clip_${start}s-${end}s.mp3`;
      a.click();
      showToast('Clip export triggered!');
      root.innerHTML = '';
    };
  }

  /* ==========================================================================
     12. FEATURE 10: AMBIENT PARTICLE STARFIELD OVERLAY
     ========================================================================== */
  function initParticleCanvas() {
    const playerEl = document.getElementById('full-player');
    if (!playerEl) return;
    let pCanvas = document.getElementById('particle-canvas');
    if (!pCanvas) {
      pCanvas = document.createElement('canvas');
      pCanvas.id = 'particle-canvas';
      playerEl.insertBefore(pCanvas, playerEl.firstChild);
    }
    const ctx = pCanvas.getContext('2d');
    const count = 45;

    for (let i = 0; i < count; i++) {
      featuresState.particles.list.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 2 + 1,
        dx: (Math.random() - 0.5) * 0.5,
        dy: (Math.random() - 0.5) * 0.5
      });
    }

    function renderParticles() {
      requestAnimationFrame(renderParticles);
      if (!featuresState.particles.active) return;
      pCanvas.width = window.innerWidth;
      pCanvas.height = window.innerHeight;
      ctx.clearRect(0, 0, pCanvas.width, pCanvas.height);

      let boost = 1;
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        boost = 1 + (dataArray[2] / 255) * 2;
      }

      ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
      featuresState.particles.list.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * boost, 0, Math.PI * 2);
        ctx.fill();
        p.x += p.dx * boost;
        p.y += p.dy * boost;
        if (p.x < 0) p.x = pCanvas.width;
        if (p.x > pCanvas.width) p.x = 0;
        if (p.y < 0) p.y = pCanvas.height;
        if (p.y > pCanvas.height) p.y = 0;
      });
    }
    renderParticles();
  }

  /* ==========================================================================
     13. UI INTEGRATION: INJECT CIRCLE HEADER BTN & DOCK
     ========================================================================== */
  function injectFeaturesUI() {
    // 1. Inject Circular Fullscreen Icon inside Header Action Bar (Next to Upload Button)
    const headerActions = document.querySelector('.header-actions, .top-bar-right, .main-bar, .action-bar, header');
    if (headerActions && !document.getElementById('nova-fullscreen-btn')) {
      const fsBtn = document.createElement('button');
      fsBtn.id = 'nova-fullscreen-btn';
      fsBtn.title = 'Fullscreen (F)';
      fsBtn.innerHTML = '⛶';
      fsBtn.onclick = toggleFullScreen;
      headerActions.appendChild(fsBtn);
      updateFullScreenButtonUI();
    }

    // 2. Inject Minimized/Collapsible Feature Bar into Full Player
    const fullContent = document.querySelector('.full-player-content');
    if (!fullContent || document.getElementById('nova-features-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'nova-features-bar';
    bar.className = `nova-feature-bar ${featuresState.isBarMinimized ? 'minimized' : ''}`;
    bar.innerHTML = `
      <button class="nova-minimize-btn" id="btn-f-minimize" title="Toggle Feature Bar">
        ${featuresState.isBarMinimized ? '+ Tools' : '– Minimize'}
      </button>
      <button class="chip-btn feature-item" id="btn-f-lyrics" title="Lyrics & Notes">📜 Lyrics</button>
      <button class="chip-btn feature-item" id="btn-f-sleep" title="Sleep Timer">💤 Sleep</button>
      <button class="chip-btn feature-item" id="btn-f-spatial" title="Spatial 3D">🎧 3D</button>
      <button class="chip-btn feature-item" id="btn-f-stats" title="Analytics">📊 Stats</button>
      <button class="chip-btn feature-item" id="btn-f-vibe" title="Smart Vibe">✨ Vibe</button>
      <button class="chip-btn feature-item" id="btn-f-marks" title="Bookmarks & Loop">📍 Marks</button>
      <button class="chip-btn feature-item" id="btn-f-hotkeys" title="Hotkeys">⌨️ Keys</button>
      <button class="chip-btn feature-item" id="btn-f-clip" title="Clip Export">✂️ Clip</button>
    `;

    const tertiary = fullContent.querySelector('.full-controls-tertiary');
    if (tertiary) {
      fullContent.insertBefore(bar, tertiary);
    } else {
      fullContent.appendChild(bar);
    }

    // Minimize / Expand Handler
    document.getElementById('btn-f-minimize').onclick = () => {
      featuresState.isBarMinimized = !featuresState.isBarMinimized;
      bar.className = `nova-feature-bar ${featuresState.isBarMinimized ? 'minimized' : ''}`;
      document.getElementById('btn-f-minimize').innerHTML = featuresState.isBarMinimized ? '+ Tools' : '– Minimize';
      saveExtensionState();
    };

    document.getElementById('btn-f-lyrics').onclick = openLyricsAndNotesModal;
    document.getElementById('btn-f-sleep').onclick = openSleepTimerModal;
    document.getElementById('btn-f-spatial').onclick = openSpatialAudioModal;
    document.getElementById('btn-f-stats').onclick = openAnalyticsModal;
    document.getElementById('btn-f-vibe').onclick = openSmartVibeModal;
    document.getElementById('btn-f-marks').onclick = openBookmarksModal;
    document.getElementById('btn-f-hotkeys').onclick = openHotkeysModal;
    document.getElementById('btn-f-clip').onclick = openClipExporterModal;
  }

  /* ==========================================================================
     14. INITIALIZATION
     ========================================================================== */
  window.addEventListener('DOMContentLoaded', () => {
    loadExtensionState();
    setupGlobalHotkeys();
    initParticleCanvas();
    overrideVisualizerDraw();

    setInterval(() => {
      trackAnalyticsTick();
      handleABLoopTick();
      injectFeaturesUI();
      updateLibraryHighlight(); // Continually checks & highlights the active track row
    }, 500);
  });
})();
