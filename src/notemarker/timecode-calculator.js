/**
 * Timecode Calculator Module
 * 
 * Handles precise timecode calculations with session start offset,
 * drop-frame/non-drop-frame support, and comprehensive validation.
 * 
 * Critical for accurate marker placement in Pro Tools sessions.
 */

const log = require('electron-log');

/**
 * Frame rate definitions with drop-frame support
 */
const FRAME_RATES = {
    '23.976': { fps: 23.976, dropFrame: false, framesPerSecond: 24 },
    '23.98': { fps: 23.976, dropFrame: false, framesPerSecond: 24 },
    '24': { fps: 24, dropFrame: false, framesPerSecond: 24 },
    '25': { fps: 25, dropFrame: false, framesPerSecond: 25 },
    '29.97': { fps: 29.97, dropFrame: false, framesPerSecond: 30 },
    '29.97drop': { fps: 29.97, dropFrame: true, framesPerSecond: 30 },
    '30': { fps: 30, dropFrame: false, framesPerSecond: 30 },
    '50': { fps: 50, dropFrame: false, framesPerSecond: 50 },
    '59.94': { fps: 59.94, dropFrame: false, framesPerSecond: 60 },
    '59.94drop': { fps: 59.94, dropFrame: true, framesPerSecond: 60 },
    '60': { fps: 60, dropFrame: false, framesPerSecond: 60 }
};

/**
 * Timecode validation ranges
 */
const TIMECODE_LIMITS = {
    hours: { min: 0, max: 23 },
    minutes: { min: 0, max: 59 },
    seconds: { min: 0, max: 59 },
    frames: { min: 0, max: 29 } // Will be adjusted based on frame rate
};

/**
 * Timecode parsing and validation errors
 */
class TimecodeError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'TimecodeError';
        this.code = code;
        this.details = details;
    }
}

/**
 * Main TimecodeCalculator class
 */
class TimecodeCalculator {
    constructor(frameRate = '29.97') {
        this.setFrameRate(frameRate);
        log.debug('TimecodeCalculator initialized', { frameRate: this.frameRate });
    }
    
    /**
     * Set the frame rate for calculations
     * @param {string} frameRate - Frame rate string (e.g., '29.97', '29.97drop')
     */
    setFrameRate(frameRate) {
        const frameRateKey = String(frameRate).toLowerCase();
        
        if (!FRAME_RATES[frameRateKey]) {
            throw new TimecodeError(
                `Unsupported frame rate: ${frameRate}`,
                'INVALID_FRAME_RATE',
                { frameRate, supportedRates: Object.keys(FRAME_RATES) }
            );
        }
        
        this.frameRate = frameRateKey;
        this.frameRateInfo = FRAME_RATES[frameRateKey];
        this.maxFrames = this.frameRateInfo.framesPerSecond - 1;
        
        log.debug('Frame rate set', {
            frameRate: this.frameRate,
            info: this.frameRateInfo,
            maxFrames: this.maxFrames
        });
    }
    
    /**
     * Parse timecode string into components
     * @param {string} timecodeString - Timecode in HH:MM:SS:FF format
     * @returns {Object} Parsed timecode components
     */
    parseTimecode(timecodeString) {
        if (!timecodeString || typeof timecodeString !== 'string') {
            throw new TimecodeError(
                'Timecode must be a non-empty string',
                'INVALID_INPUT',
                { input: timecodeString }
            );
        }
        
        // Remove any whitespace and validate format
        const cleaned = timecodeString.trim();
        const timecodeRegex = /^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/;
        const match = cleaned.match(timecodeRegex);
        
        if (!match) {
            throw new TimecodeError(
                `Invalid timecode format: "${timecodeString}". Expected HH:MM:SS:FF`,
                'INVALID_FORMAT',
                { input: timecodeString, expected: 'HH:MM:SS:FF' }
            );
        }
        
        const [, hoursStr, minutesStr, secondsStr, framesStr] = match;
        const hours = parseInt(hoursStr, 10);
        const minutes = parseInt(minutesStr, 10);
        const seconds = parseInt(secondsStr, 10);
        const frames = parseInt(framesStr, 10);
        
        // Validate ranges
        this.validateTimecodeComponents(hours, minutes, seconds, frames, timecodeString);
        
        return { hours, minutes, seconds, frames };
    }
    
    /**
     * Validate timecode component ranges
     * @param {number} hours - Hours component
     * @param {number} minutes - Minutes component
     * @param {number} seconds - Seconds component
     * @param {number} frames - Frames component
     * @param {string} originalString - Original timecode string for error reporting
     */
    validateTimecodeComponents(hours, minutes, seconds, frames, originalString) {
        const errors = [];
        
        if (hours < TIMECODE_LIMITS.hours.min || hours > TIMECODE_LIMITS.hours.max) {
            errors.push(`Hours ${hours} out of range (${TIMECODE_LIMITS.hours.min}-${TIMECODE_LIMITS.hours.max})`);
        }
        
        if (minutes < TIMECODE_LIMITS.minutes.min || minutes > TIMECODE_LIMITS.minutes.max) {
            errors.push(`Minutes ${minutes} out of range (${TIMECODE_LIMITS.minutes.min}-${TIMECODE_LIMITS.minutes.max})`);
        }
        
        if (seconds < TIMECODE_LIMITS.seconds.min || seconds > TIMECODE_LIMITS.seconds.max) {
            errors.push(`Seconds ${seconds} out of range (${TIMECODE_LIMITS.seconds.min}-${TIMECODE_LIMITS.seconds.max})`);
        }
        
        if (frames < TIMECODE_LIMITS.frames.min || frames > this.maxFrames) {
            errors.push(`Frames ${frames} out of range (${TIMECODE_LIMITS.frames.min}-${this.maxFrames}) for ${this.frameRate} fps`);
        }
        
        if (errors.length > 0) {
            throw new TimecodeError(
                `Invalid timecode components in "${originalString}": ${errors.join(', ')}`,
                'INVALID_RANGE',
                { 
                    input: originalString,
                    errors,
                    frameRate: this.frameRate,
                    maxFrames: this.maxFrames
                }
            );
        }
    }
    
    /**
     * Convert timecode to total frames for calculation
     * @param {Object} timecode - Parsed timecode object
     * @returns {number} Total frames
     */
    timecodeToFrames(timecode) {
        const { hours, minutes, seconds, frames } = timecode;
        const frameRate = this.frameRateInfo;
        
        let totalFrames = frames;
        totalFrames += seconds * frameRate.framesPerSecond;
        totalFrames += minutes * 60 * frameRate.framesPerSecond;
        totalFrames += hours * 3600 * frameRate.framesPerSecond;
        
        // Apply drop-frame correction if applicable
        if (frameRate.dropFrame) {
            totalFrames = this.applyDropFrameCorrection(timecode, totalFrames);
        }
        
        return Math.floor(totalFrames);
    }
    
    /**
     * Convert total frames back to timecode
     * @param {number} totalFrames - Total frame count
     * @returns {Object} Timecode components
     */
    framesToTimecode(totalFrames) {
        const frameRate = this.frameRateInfo;
        let remainingFrames = Math.floor(totalFrames);
        
        // Handle drop-frame conversion
        if (frameRate.dropFrame) {
            remainingFrames = this.removeDropFrameCorrection(remainingFrames);
        }
        
        const framesPerSecond = frameRate.framesPerSecond;
        const framesPerMinute = framesPerSecond * 60;
        const framesPerHour = framesPerMinute * 60;
        
        const hours = Math.floor(remainingFrames / framesPerHour);
        remainingFrames %= framesPerHour;
        
        const minutes = Math.floor(remainingFrames / framesPerMinute);
        remainingFrames %= framesPerMinute;
        
        const seconds = Math.floor(remainingFrames / framesPerSecond);
        const frames = remainingFrames % framesPerSecond;
        
        // Handle midnight crossing (24+ hours)
        const normalizedHours = hours % 24;
        
        return {
            hours: normalizedHours,
            minutes,
            seconds,
            frames,
            dayOverflow: Math.floor(hours / 24)
        };
    }
    
    /**
     * Apply drop-frame correction for SMPTE timecode
     * @param {Object} timecode - Original timecode
     * @param {number} totalFrames - Frame count before correction
     * @returns {number} Corrected frame count
     */
    applyDropFrameCorrection(timecode, totalFrames) {
        if (!this.frameRateInfo.dropFrame) {
            return totalFrames;
        }
        
        const { hours, minutes, seconds } = timecode;
        
        // Drop-frame timecode drops 2 frames at the start of every minute
        // except for minutes divisible by 10 (00, 10, 20, 30, 40, 50)
        const totalMinutes = hours * 60 + minutes;
        const droppedMinutes = totalMinutes - Math.floor(totalMinutes / 10);
        
        // Each dropped minute loses 2 frames
        const droppedFrames = droppedMinutes * 2;
        
        return totalFrames - droppedFrames;
    }
    
    /**
     * Remove drop-frame correction when converting back from frames
     * @param {number} totalFrames - Frame count with correction
     * @returns {number} Frame count without correction
     */
    removeDropFrameCorrection(totalFrames) {
        if (!this.frameRateInfo.dropFrame) {
            return totalFrames;
        }
        
        // This is an approximation for reverse calculation
        // In practice, this conversion is complex and may need iteration
        const framesPerMinute = this.frameRateInfo.framesPerSecond * 60;
        const approximateMinutes = Math.floor(totalFrames / framesPerMinute);
        const droppedMinutes = approximateMinutes - Math.floor(approximateMinutes / 10);
        const droppedFrames = droppedMinutes * 2;
        
        return totalFrames + droppedFrames;
    }
    
    /**
     * Add two timecodes together (comment timecode + session start)
     * @param {string} commentTimecode - Comment timecode string
     * @param {string} sessionStart - Session start timecode string
     * @returns {Object} Result with absolute timecode and metadata
     */
    addTimecodes(commentTimecode, sessionStart) {
        try {
            log.debug('Adding timecodes', { commentTimecode, sessionStart, frameRate: this.frameRate });
            
            // Parse both timecodes
            const commentTC = this.parseTimecode(commentTimecode);
            const sessionTC = this.parseTimecode(sessionStart);
            
            // Convert to frames for accurate calculation
            const commentFrames = this.timecodeToFrames(commentTC);
            const sessionFrames = this.timecodeToFrames(sessionTC);
            
            // Add frame counts
            const totalFrames = commentFrames + sessionFrames;
            
            // Convert back to timecode
            const resultTC = this.framesToTimecode(totalFrames);
            
            // Format result
            const absoluteTimecode = this.formatTimecode(resultTC);
            
            const result = {
                absoluteTimecode,
                components: resultTC,
                calculation: {
                    commentTimecode: {
                        original: commentTimecode,
                        parsed: commentTC,
                        frames: commentFrames
                    },
                    sessionStart: {
                        original: sessionStart,
                        parsed: sessionTC,
                        frames: sessionFrames
                    },
                    result: {
                        totalFrames,
                        dayOverflow: resultTC.dayOverflow || 0,
                        frameRate: this.frameRate,
                        dropFrame: this.frameRateInfo.dropFrame
                    }
                }
            };
            
            log.debug('Timecode addition completed', result);
            
            return result;
            
        } catch (error) {
            log.error('Timecode addition failed', { commentTimecode, sessionStart, error });
            
            if (error instanceof TimecodeError) {
                throw error;
            }
            
            throw new TimecodeError(
                `Failed to add timecodes: ${error.message}`,
                'CALCULATION_ERROR',
                { commentTimecode, sessionStart, originalError: error.message }
            );
        }
    }
    
    /**
     * Format timecode components back to string
     * @param {Object} timecode - Timecode components
     * @returns {string} Formatted timecode string
     */
    formatTimecode(timecode) {
        const { hours, minutes, seconds, frames } = timecode;
        
        return [
            hours.toString().padStart(2, '0'),
            minutes.toString().padStart(2, '0'),
            seconds.toString().padStart(2, '0'),
            frames.toString().padStart(2, '0')
        ].join(':');
    }
    
    /**
     * Validate that a timecode is within reasonable bounds
     * @param {string} timecodeString - Timecode to validate
     * @returns {Object} Validation result
     */
    validateTimecode(timecodeString) {
        try {
            const parsed = this.parseTimecode(timecodeString);
            const formatted = this.formatTimecode(parsed);
            
            return {
                valid: true,
                timecode: formatted,
                components: parsed,
                frameRate: this.frameRate,
                warnings: []
            };
            
        } catch (error) {
            return {
                valid: false,
                error: error.message,
                code: error.code,
                details: error.details,
                frameRate: this.frameRate
            };
        }
    }
    
    /**
     * Calculate duration between two timecodes
     * @param {string} startTimecode - Start timecode
     * @param {string} endTimecode - End timecode
     * @returns {Object} Duration calculation result
     */
    calculateDuration(startTimecode, endTimecode) {
        try {
            const startTC = this.parseTimecode(startTimecode);
            const endTC = this.parseTimecode(endTimecode);
            
            const startFrames = this.timecodeToFrames(startTC);
            const endFrames = this.timecodeToFrames(endTC);
            
            let durationFrames = endFrames - startFrames;
            
            // Handle negative duration (crossing midnight)
            if (durationFrames < 0) {
                const framesPerDay = 24 * 60 * 60 * this.frameRateInfo.framesPerSecond;
                durationFrames += framesPerDay;
            }
            
            const durationTC = this.framesToTimecode(durationFrames);
            
            return {
                duration: this.formatTimecode(durationTC),
                frames: durationFrames,
                components: durationTC,
                crossesMidnight: endFrames < startFrames
            };
            
        } catch (error) {
            throw new TimecodeError(
                `Failed to calculate duration: ${error.message}`,
                'DURATION_ERROR',
                { startTimecode, endTimecode, originalError: error.message }
            );
        }
    }
    
    /**
     * Get frame rate information
     * @returns {Object} Current frame rate information
     */
    getFrameRateInfo() {
        return {
            frameRate: this.frameRate,
            info: { ...this.frameRateInfo },
            maxFrames: this.maxFrames,
            supportedRates: Object.keys(FRAME_RATES)
        };
    }
}

/**
 * Utility functions for common timecode operations
 */
const TimecodeUtils = {
    /**
     * Create a timecode calculator with specified frame rate
     * @param {string} frameRate - Frame rate string
     * @returns {TimecodeCalculator} Calculator instance
     */
    createCalculator(frameRate) {
        return new TimecodeCalculator(frameRate);
    },
    
    /**
     * Quick timecode addition without creating calculator instance
     * @param {string} commentTimecode - Comment timecode
     * @param {string} sessionStart - Session start timecode
     * @param {string} frameRate - Frame rate
     * @returns {string} Absolute timecode string
     */
    addTimecodes(commentTimecode, sessionStart, frameRate = '29.97') {
        const calculator = new TimecodeCalculator(frameRate);
        const result = calculator.addTimecodes(commentTimecode, sessionStart);
        return result.absoluteTimecode;
    },
    
    /**
     * Validate timecode format and ranges
     * @param {string} timecode - Timecode to validate
     * @param {string} frameRate - Frame rate
     * @returns {boolean} True if valid
     */
    isValidTimecode(timecode, frameRate = '29.97') {
        try {
            const calculator = new TimecodeCalculator(frameRate);
            const result = calculator.validateTimecode(timecode);
            return result.valid;
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Get supported frame rates
     * @returns {Array} Array of supported frame rate strings
     */
    getSupportedFrameRates() {
        return Object.keys(FRAME_RATES);
    }
};

module.exports = {
    TimecodeCalculator,
    TimecodeError,
    TimecodeUtils,
    FRAME_RATES,
    TIMECODE_LIMITS
};