/**
 * PTSL Time Format Utilities
 * 
 * This module provides utilities for handling different time formats supported by Pro Tools PTSL:
 * - Timecode (HH:MM:SS:FF)
 * - Samples (integer values)
 * - Bars/Beats (|bars|beats|ticks)
 * - Milliseconds
 * - Feet/Frames
 */

const log = require('electron-log');

/**
 * Time format types supported by PTSL
 */
const TIME_FORMATS = {
    TIMECODE: 'timecode'
};

/**
 * Reference types that correspond to different time formats
 */
const REFERENCE_TYPES = {
    ABSOLUTE: 'absolute'
};

/**
 * Time format validation patterns
 */
const TIME_PATTERNS = {
    TIMECODE: /^([0-9]{1,2}):([0-9]{2}):([0-9]{2})[:\.]([0-9]{2,3})$/
};

/**
 * PTSL ticks per beat (quarter note) - standard Pro Tools value
 */
const TICKS_PER_BEAT = 960000;

class PTSLTimeFormatter {
    constructor() {
        this.defaultSampleRate = 48000; // Default to 48kHz
        this.defaultFrameRate = 29.97; // Default to 29.97 fps
    }

    /**
     * Set session-specific parameters
     * @param {number} sampleRate - Session sample rate (e.g., 44100, 48000)
     * @param {number} frameRate - Session frame rate (e.g., 23.976, 24, 25, 29.97, 30)
     */
    setSessionParameters(sampleRate, frameRate) {
        this.defaultSampleRate = sampleRate || 48000;
        this.defaultFrameRate = frameRate || 29.97;
        
        log.debug('PTSL time formatter parameters updated:', {
            sampleRate: this.defaultSampleRate,
            frameRate: this.defaultFrameRate
        });
    }

    /**
     * Detect the time format of a time string
     * @param {string} timeString - Time string to analyze
     * @returns {string} Detected format type
     */
    detectTimeFormat(timeString) {
        if (typeof timeString !== 'string') {
            throw new Error('Time string must be a string');
        }

        const trimmed = timeString.trim();

        if (TIME_PATTERNS.TIMECODE.test(trimmed)) {
            return TIME_FORMATS.TIMECODE;
        }
        
        if (TIME_PATTERNS.SAMPLES.test(trimmed)) {
            return TIME_FORMATS.SAMPLES;
        }
        
        if (TIME_PATTERNS.BARS_BEATS.test(trimmed)) {
            return TIME_FORMATS.BARS_BEATS;
        }
        
        if (TIME_PATTERNS.MILLISECONDS.test(trimmed)) {
            return TIME_FORMATS.MILLISECONDS;
        }
        
        if (TIME_PATTERNS.FEET_FRAMES.test(trimmed)) {
            return TIME_FORMATS.FEET_FRAMES;
        }

        // Default to timecode if no pattern matches
        log.warn('Unknown time format, defaulting to timecode:', timeString);
        return TIME_FORMATS.TIMECODE;
    }

    /**
     * Validate a time string format
     * @param {string} timeString - Time string to validate
     * @param {string} [expectedFormat] - Expected format (optional)
     * @returns {Object} Validation result
     */
    validateTimeFormat(timeString, expectedFormat = null) {
        try {
            const detectedFormat = this.detectTimeFormat(timeString);
            
            const isValid = this.isValidTimeString(timeString, detectedFormat);
            const formatMatches = expectedFormat ? detectedFormat === expectedFormat : true;

            return {
                isValid: isValid && formatMatches,
                detectedFormat,
                expectedFormat,
                formatMatches,
                error: null
            };
        } catch (error) {
            return {
                isValid: false,
                detectedFormat: null,
                expectedFormat,
                formatMatches: false,
                error: error.message
            };
        }
    }

    /**
     * Check if a time string is valid for the detected format
     * @param {string} timeString - Time string to validate
     * @param {string} format - Format type
     * @returns {boolean} True if valid
     */
    isValidTimeString(timeString, format) {
        switch (format) {
            case TIME_FORMATS.TIMECODE:
                return this.validateTimecode(timeString);
            case TIME_FORMATS.SAMPLES:
                return this.validateSamples(timeString);
            case TIME_FORMATS.BARS_BEATS:
                return this.validateBarsBeats(timeString);
            case TIME_FORMATS.MILLISECONDS:
                return this.validateMilliseconds(timeString);
            case TIME_FORMATS.FEET_FRAMES:
                return this.validateFeetFrames(timeString);
            default:
                return false;
        }
    }

    /**
     * Validate timecode format
     * @param {string} timecode - Timecode string
     * @returns {boolean} True if valid
     */
    validateTimecode(timecode) {
        const match = TIME_PATTERNS.TIMECODE.exec(timecode);
        if (!match) return false;

        const [, hours, minutes, seconds, frames] = match;
        
        // Basic range validation
        if (parseInt(minutes) >= 60 || parseInt(seconds) >= 60) {
            return false;
        }

        // Frame validation depends on frame rate
        const maxFrames = Math.floor(this.defaultFrameRate);
        if (parseInt(frames) >= maxFrames) {
            return false;
        }

        return true;
    }

    /**
     * Validate samples format
     * @param {string} samples - Samples string
     * @returns {boolean} True if valid
     */
    validateSamples(samples) {
        const match = TIME_PATTERNS.SAMPLES.exec(samples);
        if (!match) return false;

        const value = parseInt(samples);
        return !isNaN(value) && isFinite(value);
    }

    /**
     * Validate bars/beats format
     * @param {string} barsBeats - Bars/beats string
     * @returns {boolean} True if valid
     */
    validateBarsBeats(barsBeats) {
        const match = TIME_PATTERNS.BARS_BEATS.exec(barsBeats);
        if (!match) return false;

        const [, bars, beats, ticks] = match;
        
        // Basic validation
        if (parseInt(bars) < 1 || parseInt(beats) < 1) {
            return false;
        }

        if (parseInt(ticks) < 0 || parseInt(ticks) >= TICKS_PER_BEAT) {
            return false;
        }

        return true;
    }

    /**
     * Validate milliseconds format
     * @param {string} milliseconds - Milliseconds string
     * @returns {boolean} True if valid
     */
    validateMilliseconds(milliseconds) {
        const match = TIME_PATTERNS.MILLISECONDS.exec(milliseconds);
        if (!match) return false;

        const value = parseFloat(match[1]);
        return !isNaN(value) && isFinite(value);
    }

    /**
     * Validate feet/frames format
     * @param {string} feetFrames - Feet/frames string
     * @returns {boolean} True if valid
     */
    validateFeetFrames(feetFrames) {
        const match = TIME_PATTERNS.FEET_FRAMES.exec(feetFrames);
        if (!match) return false;

        const [, feet, frames] = match;
        
        // Basic validation
        if (parseInt(feet) < 0 || parseInt(frames) < 0) {
            return false;
        }

        // 16 frames per foot in 35mm film
        if (parseInt(frames) >= 16) {
            return false;
        }

        return true;
    }

    /**
     * Get the appropriate PTSL reference type for a time format
     * @param {string} timeString - Time string
     * @returns {string} Reference type
     */
    getReference(timeString) {
        const format = this.detectTimeFormat(timeString);
        
        switch (format) {
            case TIME_FORMATS.BARS_BEATS:
                return REFERENCE_TYPES.BAR_BEAT;
            case TIME_FORMATS.TIMECODE:
            case TIME_FORMATS.SAMPLES:
            case TIME_FORMATS.MILLISECONDS:
            case TIME_FORMATS.FEET_FRAMES:
            default:
                return REFERENCE_TYPES.ABSOLUTE;
        }
    }

    /**
     * Convert time string to samples (for calculations)
     * @param {string} timeString - Time string in any supported format
     * @returns {number} Time in samples
     */
    toSamples(timeString) {
        const format = this.detectTimeFormat(timeString);
        
        switch (format) {
            case TIME_FORMATS.TIMECODE:
                return this.timecodeToSamples(timeString);
            case TIME_FORMATS.SAMPLES:
                return parseInt(timeString);
            case TIME_FORMATS.MILLISECONDS:
                return this.millisecondsToSamples(timeString);
            case TIME_FORMATS.BARS_BEATS:
                // Bars/beats can't be converted without tempo information
                throw new Error('Bars/beats conversion requires tempo information');
            case TIME_FORMATS.FEET_FRAMES:
                return this.feetFramesToSamples(timeString);
            default:
                throw new Error(`Unsupported time format: ${format}`);
        }
    }

    /**
     * Convert timecode to samples
     * @param {string} timecode - Timecode string
     * @returns {number} Samples
     */
    timecodeToSamples(timecode) {
        const match = TIME_PATTERNS.TIMECODE.exec(timecode);
        if (!match) throw new Error('Invalid timecode format');

        const [, hours, minutes, seconds, frames] = match;
        
        const totalSeconds = parseInt(hours) * 3600 + 
                           parseInt(minutes) * 60 + 
                           parseInt(seconds) +
                           parseInt(frames) / this.defaultFrameRate;
        
        return Math.floor(totalSeconds * this.defaultSampleRate);
    }

    /**
     * Convert milliseconds to samples
     * @param {string} milliseconds - Milliseconds string
     * @returns {number} Samples
     */
    millisecondsToSamples(milliseconds) {
        const match = TIME_PATTERNS.MILLISECONDS.exec(milliseconds);
        if (!match) throw new Error('Invalid milliseconds format');

        const ms = parseFloat(match[1]);
        return Math.floor((ms / 1000) * this.defaultSampleRate);
    }

    /**
     * Convert feet/frames to samples
     * @param {string} feetFrames - Feet/frames string
     * @returns {number} Samples
     */
    feetFramesToSamples(feetFrames) {
        const match = TIME_PATTERNS.FEET_FRAMES.exec(feetFrames);
        if (!match) throw new Error('Invalid feet/frames format');

        const [, feet, frames] = match;
        
        // 35mm film: 16 frames per foot, 24 fps standard
        const totalFrames = parseInt(feet) * 16 + parseInt(frames);
        const seconds = totalFrames / 24; // Assuming 24fps film
        
        return Math.floor(seconds * this.defaultSampleRate);
    }

    /**
     * Format time examples for documentation/testing
     * @returns {Object} Examples of different time formats
     */
    getFormatExamples() {
        return {
            [TIME_FORMATS.TIMECODE]: ['01:00:30:15', '00:05:23:00', '02:15:45:29'],
            [TIME_FORMATS.SAMPLES]: ['1440000', '48000', '-22050'],
            [TIME_FORMATS.BARS_BEATS]: ['|1|1|0', '|4|2|480000', '|16|3|240000'],
            [TIME_FORMATS.MILLISECONDS]: ['1000ms', '500.5ms', '30000ms'],
            [TIME_FORMATS.FEET_FRAMES]: ['100+8', '0+15', '250+0']
        };
    }
}

module.exports = {
    PTSLTimeFormatter,
    TIME_FORMATS,
    REFERENCE_TYPES,
    TIME_PATTERNS,
    TICKS_PER_BEAT
};