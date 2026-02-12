<script lang="ts">
	let {
		src = $bindable(''),
		fileName = '',
		onTimecodeCapture,
		onMarkerClick,
		onBack,
		commentMarkers = []
	}: {
		src?: string;
		fileName?: string;
		onTimecodeCapture?: (timecode: string, seconds: number) => void;
		onMarkerClick?: (markerId: number) => void;
		onBack?: () => void;
		commentMarkers?: Array<{ id: number; timeSeconds: number }>;
	} = $props();

	// Elements
	let videoElement: HTMLVideoElement | undefined = $state();
	let audioElement: HTMLAudioElement | undefined = $state();
	let activePlayer: HTMLVideoElement | HTMLAudioElement | null = $state(null);

	// State
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(100);
	let isVideo = $state(true);

	// Derived
	const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);

	// Format seconds to HH:MM:SS
	function formatTime(seconds: number): string {
		if (isNaN(seconds) || seconds < 0) return '00:00:00';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	// Toggle play/pause
	function togglePlay() {
		if (!activePlayer) return;
		if (activePlayer.paused) {
			activePlayer.play();
		} else {
			activePlayer.pause();
		}
	}

	// Seek to position
	function seek(percent: number) {
		if (!activePlayer) return;
		activePlayer.currentTime = (percent / 100) * duration;
	}

	// Skip forward/backward
	function skip(seconds: number) {
		if (!activePlayer) return;
		activePlayer.currentTime = Math.max(0, Math.min(duration, activePlayer.currentTime + seconds));
	}

	// Start over
	function startOver() {
		if (!activePlayer) return;
		activePlayer.currentTime = 0;
	}

	// Set volume
	function setVolume(value: number) {
		if (!activePlayer) return;
		volume = value;
		activePlayer.volume = value / 100;
	}

	// Toggle fullscreen
	function toggleFullscreen() {
		const container = document.querySelector('.video-panel');
		if (!container) return;

		if (!document.fullscreenElement) {
			container.requestFullscreen();
		} else {
			document.exitFullscreen();
		}
	}

	// Seek to specific time in seconds (exposed for external use)
	export function seekTo(seconds: number) {
		if (!activePlayer) return;
		activePlayer.currentTime = Math.max(0, Math.min(duration, seconds));
	}

	// Pause playback (exposed for external use)
	export function pause() {
		if (!activePlayer || activePlayer.paused) return;
		activePlayer.pause();
	}

	// Resume playback (exposed for external use)
	export function play() {
		if (!activePlayer || !activePlayer.paused) return;
		activePlayer.play();
	}

	// Check if currently playing (exposed for external use)
	export function getIsPlaying(): boolean {
		return !!(activePlayer && !activePlayer.paused);
	}

	// Get current time (exposed for external use)
	export function getCurrentTime(): number {
		return activePlayer?.currentTime || 0;
	}

	// Cleanup media elements
	export function cleanup() {
		if (videoElement) {
			videoElement.pause();
			videoElement.src = '';
			videoElement.load();
		}
		if (audioElement) {
			audioElement.pause();
			audioElement.src = '';
			audioElement.load();
		}
		activePlayer = null;
	}

	// Capture timecode for comment
	function captureTimecode() {
		if (onTimecodeCapture && activePlayer) {
			const tc = formatTime(activePlayer.currentTime);
			onTimecodeCapture(tc, activePlayer.currentTime);
		}
	}

	// Update active player based on src type
	$effect(() => {
		if (!src) {
			activePlayer = null;
			return;
		}

		// Detect if audio or video based on file extension or mime type
		const ext = src.split(/[?.]/).filter(Boolean).pop()?.toLowerCase() || '';
		const audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'];
		isVideo = !audioExts.includes(ext);

		if (isVideo && videoElement) {
			activePlayer = videoElement;
			if (audioElement) audioElement.src = '';
		} else if (audioElement) {
			activePlayer = audioElement;
			if (videoElement) videoElement.src = '';
		}

		if (activePlayer) {
			activePlayer.src = src;
			activePlayer.load();
		}
	});

	// Player event listeners
	$effect(() => {
		if (!activePlayer) return;

		const onPlay = () => (isPlaying = true);
		const onPause = () => (isPlaying = false);
		const onTimeUpdate = () => (currentTime = activePlayer?.currentTime || 0);
		const onLoadedMetadata = () => (duration = activePlayer?.duration || 0);

		activePlayer.addEventListener('play', onPlay);
		activePlayer.addEventListener('pause', onPause);
		activePlayer.addEventListener('timeupdate', onTimeUpdate);
		activePlayer.addEventListener('loadedmetadata', onLoadedMetadata);

		return () => {
			activePlayer?.removeEventListener('play', onPlay);
			activePlayer?.removeEventListener('pause', onPause);
			activePlayer?.removeEventListener('timeupdate', onTimeUpdate);
			activePlayer?.removeEventListener('loadedmetadata', onLoadedMetadata);
		};
	});

	// Keyboard shortcuts
	$effect(() => {
		const handleKeydown = (e: KeyboardEvent) => {
			if (!activePlayer) return;
			const target = e.target as HTMLElement;
			if (target.matches('input, textarea')) return;

			switch (e.code) {
				case 'Space':
					e.preventDefault();
					togglePlay();
					break;
				case 'ArrowLeft':
					e.preventDefault();
					skip(-5);
					break;
				case 'ArrowRight':
					e.preventDefault();
					skip(5);
					break;
				case 'KeyM':
					e.preventDefault();
					captureTimecode();
					break;
			}
		};

		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});

	function handleMarkerClick(e: MouseEvent, marker: { id: number; timeSeconds: number }) {
		e.stopPropagation();
		seekTo(marker.timeSeconds);
		if (onMarkerClick) onMarkerClick(marker.id);
	}
</script>

<div class="video-panel">
	{#if onBack || fileName}
		<!-- Header -->
		<div class="video-header">
			{#if onBack}
				<button class="back-btn" onclick={onBack}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M19 12H5M12 19l-7-7 7-7" />
					</svg>
					back to files
				</button>
			{/if}
			<span class="video-filename">{fileName}</span>
		</div>
	{/if}

	<!-- Video/Audio Container -->
	<div class="video-container">
		{#if !src}
			<div class="video-placeholder">
				<svg width="200" height="200" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
					<defs>
						<linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" style="stop-color:#4A90E2;stop-opacity:1" />
							<stop offset="100%" style="stop-color:#E74C3C;stop-opacity:1" />
						</linearGradient>
					</defs>
					<text
						x="256"
						y="256"
						font-family="'Bricolage Grotesque', system-ui, -apple-system, sans-serif"
						font-size="180"
						font-weight="700"
						fill="url(#textGradient)"
						text-anchor="middle"
						dominant-baseline="middle"
						letter-spacing="6">Aa</text
					>
				</svg>
			</div>
		{:else if !isVideo}
			<div class="audio-visualizer">
				<div class="audio-icon">
					<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
						<path
							d="M9 18V5l12-2v13M9 18c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3zm12-2c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3z"
						/>
					</svg>
				</div>
				<div class="audio-bars">
					<div class="audio-bar"></div>
					<div class="audio-bar"></div>
					<div class="audio-bar"></div>
					<div class="audio-bar"></div>
					<div class="audio-bar"></div>
				</div>
			</div>
		{/if}

		<video bind:this={videoElement} style={!isVideo || !src ? 'display: none' : ''}></video>
		<audio bind:this={audioElement} style={isVideo || !src ? 'display: none' : ''}></audio>
	</div>

	<!-- Controls -->
	<div class="video-controls">
		<div class="controls-row">
			<button class="control-btn" onclick={startOver} title="Start over">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
					<rect x="4" y="4" width="2" height="16" />
					<path d="M18 6l-8 6 8 6z" />
				</svg>
			</button>
			<button class="control-btn" onclick={() => skip(-10)} title="Rewind 10 seconds">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
					<path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38"></path>
					<text x="12" y="16" font-size="8" fill="white" text-anchor="middle" font-weight="bold"
						>10</text
					>
				</svg>
			</button>
			<button class="play-btn" onclick={togglePlay}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
					{#if isPlaying}
						<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
					{:else}
						<path d="M8 5v14l11-7z" />
					{/if}
				</svg>
			</button>
			<button class="control-btn" onclick={() => skip(10)} title="Forward 10 seconds">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
					<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"></path>
					<text x="12" y="16" font-size="8" fill="white" text-anchor="middle" font-weight="bold"
						>10</text
					>
				</svg>
			</button>
			<span class="timecode">{formatTime(currentTime)} / {formatTime(duration)}</span>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="progress-container" onclick={(e) => {
				const rect = e.currentTarget.getBoundingClientRect();
				const percent = ((e.clientX - rect.left) / rect.width) * 100;
				seek(percent);
			}}>
				<div class="progress-bar" style="width: {progress}%">
					<div class="progress-handle"></div>
				</div>
				<div class="comment-markers">
					{#each commentMarkers as marker}
						{@const percent = duration > 0 ? (marker.timeSeconds / duration) * 100 : 0}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div
							class="comment-marker"
							style="left: {percent}%"
							onclick={(e) => handleMarkerClick(e, marker)}
							title="Jump to comment"
						></div>
					{/each}
				</div>
			</div>
			<div class="volume-control">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
					<path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07"></path>
				</svg>
				<input
					type="range"
					class="volume-slider"
					min="0"
					max="100"
					value={volume}
					oninput={(e) => setVolume(parseInt(e.currentTarget.value))}
				/>
			</div>
			<button class="fullscreen-btn" onclick={toggleFullscreen} title="Fullscreen">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path
						d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
					></path>
				</svg>
			</button>
		</div>
	</div>
</div>

<style>
	.video-panel {
		display: flex;
		flex-direction: column;
		background: #000;
		position: relative;
		height: 100%;
	}

	.video-header {
		padding: 0.75rem 1.5rem;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-shrink: 0;
	}

	.back-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-family: var(--font-body);
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: background 0.2s;
		flex-shrink: 0;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.video-filename {
		color: white;
		font-size: 0.85rem;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.video-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
		position: relative;
		overflow: hidden;
		min-height: 0;
	}

	.video-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		color: var(--muted-text);
		background: var(--bg-secondary);
		width: 100%;
		height: 100%;
	}

	.video-placeholder svg {
		opacity: 0.3;
	}

	video,
	audio {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.audio-visualizer {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		width: 100%;
		height: 100%;
		background: #000;
	}

	.audio-icon {
		opacity: 0.3;
	}

	.audio-bars {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		height: 60px;
	}

	.audio-bar {
		width: 6px;
		background: linear-gradient(to top, #469fe0, #007acc);
		border-radius: 3px;
		opacity: 0.4;
	}

	.audio-bar:nth-child(1) {
		height: 30%;
	}
	.audio-bar:nth-child(2) {
		height: 50%;
	}
	.audio-bar:nth-child(3) {
		height: 70%;
	}
	.audio-bar:nth-child(4) {
		height: 45%;
	}
	.audio-bar:nth-child(5) {
		height: 35%;
	}

	.video-controls {
		background: rgba(0, 0, 0, 0.85);
		padding: 0.75rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.controls-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.control-btn {
		background: rgba(255, 255, 255, 0.1);
		border: none;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s;
	}

	.control-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.play-btn {
		background: var(--accent-teal);
		border: none;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s;
	}

	.play-btn:hover {
		background: #3a8bc7;
	}

	.timecode {
		font-family: var(--font-mono);
		color: white;
		font-size: 0.9rem;
		min-width: 140px;
	}

	.progress-container {
		flex: 1;
		height: 6px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
		cursor: pointer;
		position: relative;
	}

	.progress-bar {
		height: 100%;
		background: linear-gradient(90deg, #ff6b6b 0%, #007acc 100%);
		border-radius: 3px;
		position: relative;
	}

	.progress-handle {
		position: absolute;
		right: -6px;
		top: 50%;
		transform: translateY(-50%);
		width: 12px;
		height: 12px;
		background: white;
		border-radius: 50%;
		cursor: grab;
	}

	.progress-handle:active {
		cursor: grabbing;
	}

	.comment-markers {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.comment-marker {
		position: absolute;
		width: 3px;
		height: 100%;
		background: var(--accent-gold);
		cursor: pointer;
		pointer-events: all;
	}

	.comment-marker:hover {
		background: var(--accent-red);
		width: 4px;
	}

	.volume-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.volume-slider {
		width: 80px;
	}

	.fullscreen-btn {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.fullscreen-btn:hover {
		color: var(--accent-teal);
	}
</style>
