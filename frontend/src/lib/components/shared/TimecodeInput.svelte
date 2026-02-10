<script lang="ts">
	let {
		value = $bindable('00:00:00'),
		placeholder = '00:00:00',
		includeFrames = false,
		onchange
	}: {
		value?: string;
		placeholder?: string;
		includeFrames?: boolean;
		onchange?: (value: string) => void;
	} = $props();

	function handleInput(event: Event) {
		const input = event.target as HTMLInputElement;
		value = input.value;
		if (onchange) {
			onchange(value);
		}
	}

	function handleBlur(event: FocusEvent) {
		const input = event.target as HTMLInputElement;
		const formatted = formatTimecode(input.value);
		value = formatted;
		input.value = formatted;
		if (onchange) {
			onchange(formatted);
		}
	}

	function formatTimecode(timeStr: string): string {
		if (!timeStr) return includeFrames ? '00:00:00:00' : '00:00:00';

		// Remove non-digit/colon characters
		const cleaned = timeStr.replace(/[^0-9:]/g, '');
		const parts = cleaned.split(':').filter((p) => p);

		if (includeFrames) {
			// HH:MM:SS:FF format
			const hh = parts[0] ? parts[0].padStart(2, '0') : '00';
			const mm = parts[1] ? parts[1].padStart(2, '0') : '00';
			const ss = parts[2] ? parts[2].padStart(2, '0') : '00';
			const ff = parts[3] ? parts[3].padStart(2, '0') : '00';
			return `${hh}:${mm}:${ss}:${ff}`;
		} else {
			// HH:MM:SS format
			const hh = parts[0] ? parts[0].padStart(2, '0') : '00';
			const mm = parts[1] ? parts[1].padStart(2, '0') : '00';
			const ss = parts[2] ? parts[2].padStart(2, '0') : '00';
			return `${hh}:${mm}:${ss}`;
		}
	}
</script>

<input
	type="text"
	{value}
	{placeholder}
	oninput={handleInput}
	onblur={handleBlur}
	class="timecode-input"
/>

<style>
	.timecode-input {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		background: white;
		width: 100%;
	}

	.timecode-input:focus {
		outline: none;
		border-color: var(--accent-teal);
	}
</style>
