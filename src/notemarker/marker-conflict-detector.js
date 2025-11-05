/**
 * Marker Conflict Detection Module
 * 
 * Handles detection and resolution of marker conflicts before creation,
 * preventing accidental overwrites and providing user control over conflicts.
 * 
 * Features:
 * - Precise timecode comparison using TimecodeCalculator
 * - User conflict resolution options (skip, replace, offset)
 * - Batch conflict resolution (remember choice)
 * - Intelligent offset calculation
 * - Comprehensive conflict reporting
 */

const log = require('electron-log');
const { TimecodeCalculator, TimecodeUtils } = require('./timecode-calculator');

/**
 * Conflict resolution strategies
 */
const CONFLICT_STRATEGIES = {
    SKIP: 'skip',           // Skip conflicting markers
    REPLACE: 'replace',     // Replace existing markers
    OFFSET: 'offset',       // Offset conflicting markers
    ASK_EACH: 'ask_each',   // Ask user for each conflict
    CANCEL: 'cancel'        // Cancel entire operation
};

/**
 * Conflict types
 */
const CONFLICT_TYPES = {
    EXACT_TIMECODE: 'exact_timecode',       // Same timecode, different name
    EXACT_NAME: 'exact_name',               // Same name, different timecode
    EXACT_MATCH: 'exact_match',             // Same name and timecode
    NEAR_TIMECODE: 'near_timecode'          // Timecodes within threshold
};

/**
 * Marker conflict detection and resolution
 */
class MarkerConflictDetector {
    constructor(frameRate = '29.97', options = {}) {
        this.timecodeCalculator = new TimecodeCalculator(frameRate);
        this.frameRate = frameRate;
        
        // Configuration
        this.config = {
            nearTimecodeThresholdFrames: options.nearTimecodeThreshold || 15, // ~0.5 seconds at 30fps
            defaultOffsetFrames: options.defaultOffset || 30,                  // 1 second at 30fps
            enableNearTimecodeDetection: options.enableNearDetection !== false,
            caseSensitiveNames: options.caseSensitiveNames || false,
            ...options
        };
        
        // Batch resolution state
        this.batchStrategy = null;
        this.batchStrategyAppliedCount = 0;
        this.userInteractionCallback = null;
        
        // Statistics
        this.stats = {
            totalChecked: 0,
            conflicts: 0,
            resolved: 0,
            skipped: 0,
            replaced: 0,
            offset: 0,
            cancelled: 0
        };
        
        log.debug('MarkerConflictDetector initialized', {
            frameRate: this.frameRate,
            config: this.config
        });
    }
    
    /**
     * Set user interaction callback for conflict resolution
     * @param {Function} callback - Function to handle user prompts
     */
    setUserInteractionCallback(callback) {
        this.userInteractionCallback = callback;
    }
    
    /**
     * Detect conflicts between new markers and existing markers
     * @param {Array} newMarkers - Array of new markers to create
     * @param {Array} existingMarkers - Array of existing markers from Pro Tools
     * @returns {Object} Conflict detection results
     */
    async detectConflicts(newMarkers, existingMarkers) {
        log.info('Starting conflict detection', {
            newMarkersCount: newMarkers.length,
            existingMarkersCount: existingMarkers.length
        });
        
        this.stats.totalChecked = newMarkers.length;
        const conflicts = [];
        const conflictsByType = {
            [CONFLICT_TYPES.EXACT_TIMECODE]: [],
            [CONFLICT_TYPES.EXACT_NAME]: [],
            [CONFLICT_TYPES.EXACT_MATCH]: [],
            [CONFLICT_TYPES.NEAR_TIMECODE]: []
        };
        
        for (let i = 0; i < newMarkers.length; i++) {
            const newMarker = newMarkers[i];
            
            // Find conflicts for this marker
            const markerConflicts = await this.findMarkerConflicts(newMarker, existingMarkers, i);
            
            if (markerConflicts.length > 0) {
                conflicts.push({
                    newMarker,
                    newMarkerIndex: i,
                    conflicts: markerConflicts
                });
                
                // Categorize conflicts by type
                markerConflicts.forEach(conflict => {
                    conflictsByType[conflict.type].push(conflict);
                });
                
                this.stats.conflicts++;
            }
        }
        
        const result = {
            hasConflicts: conflicts.length > 0,
            totalConflicts: conflicts.length,
            conflicts,
            conflictsByType,
            summary: this.generateConflictSummary(conflictsByType),
            stats: { ...this.stats }
        };
        
        log.info('Conflict detection completed', {
            hasConflicts: result.hasConflicts,
            totalConflicts: result.totalConflicts,
            summary: result.summary
        });
        
        return result;
    }
    
    /**
     * Find conflicts for a single marker
     * @param {Object} newMarker - New marker to check
     * @param {Array} existingMarkers - Existing markers
     * @param {number} index - Index of new marker
     * @returns {Array} Array of conflicts found
     */
    async findMarkerConflicts(newMarker, existingMarkers, index) {
        const conflicts = [];
        
        for (const existingMarker of existingMarkers) {
            const conflict = await this.compareMarkers(newMarker, existingMarker, index);
            if (conflict) {
                conflicts.push(conflict);
            }
        }
        
        return conflicts;
    }
    
    /**
     * Compare two markers for conflicts
     * @param {Object} newMarker - New marker
     * @param {Object} existingMarker - Existing marker
     * @param {number} newMarkerIndex - Index of new marker
     * @returns {Object|null} Conflict object or null if no conflict
     */
    async compareMarkers(newMarker, existingMarker, newMarkerIndex) {
        const newName = this.normalizeName(newMarker.name);
        const existingName = this.normalizeName(existingMarker.name);
        const newTimecode = newMarker.timecode;
        const existingTimecode = existingMarker.startLocation;
        
        // Check for exact matches first
        if (newName === existingName && this.isExactTimecodeMatch(newTimecode, existingTimecode)) {
            return {
                type: CONFLICT_TYPES.EXACT_MATCH,
                existingMarker,
                newMarkerIndex,
                severity: 'high',
                description: `Exact match: same name "${newName}" and timecode ${newTimecode}`,
                suggestions: ['skip', 'replace']
            };
        }
        
        // Check for same name, different timecode
        if (newName === existingName) {
            return {
                type: CONFLICT_TYPES.EXACT_NAME,
                existingMarker,
                newMarkerIndex,
                severity: 'medium',
                description: `Name conflict: marker "${newName}" already exists at ${existingTimecode}`,
                suggestions: ['skip', 'replace', 'offset']
            };
        }
        
        // Check for same timecode, different name
        if (this.isExactTimecodeMatch(newTimecode, existingTimecode)) {
            return {
                type: CONFLICT_TYPES.EXACT_TIMECODE,
                existingMarker,
                newMarkerIndex,
                severity: 'medium',
                description: `Timecode conflict: timecode ${newTimecode} already has marker "${existingName}"`,
                suggestions: ['skip', 'replace', 'offset']
            };
        }
        
        // Check for near timecode conflicts if enabled
        if (this.config.enableNearTimecodeDetection) {
            const timecodeDistance = await this.calculateTimecodeDistance(newTimecode, existingTimecode);
            if (timecodeDistance > 0 && timecodeDistance <= this.config.nearTimecodeThresholdFrames) {
                return {
                    type: CONFLICT_TYPES.NEAR_TIMECODE,
                    existingMarker,
                    newMarkerIndex,
                    severity: 'low',
                    distance: timecodeDistance,
                    description: `Near timecode: "${newName}" at ${newTimecode} is ${timecodeDistance} frames from "${existingName}" at ${existingTimecode}`,
                    suggestions: ['skip', 'offset']
                };
            }
        }
        
        return null;
    }
    
    /**
     * Resolve conflicts interactively or using batch strategy
     * @param {Object} conflictResults - Results from detectConflicts
     * @param {string} initialStrategy - Initial resolution strategy
     * @returns {Object} Resolution results
     */
    async resolveConflicts(conflictResults, initialStrategy = CONFLICT_STRATEGIES.ASK_EACH) {
        if (!conflictResults.hasConflicts) {
            return {
                strategy: 'none',
                resolved: true,
                modifiedMarkers: [],
                skippedIndices: [],
                results: []
            };
        }
        
        log.info('Starting conflict resolution', {
            totalConflicts: conflictResults.totalConflicts,
            initialStrategy
        });
        
        this.batchStrategy = initialStrategy;
        this.batchStrategyAppliedCount = 0;
        
        const resolutionResults = [];
        const skippedIndices = new Set();
        const modifiedMarkers = [];
        
        for (const conflictGroup of conflictResults.conflicts) {
            try {
                const resolution = await this.resolveConflictGroup(conflictGroup);
                resolutionResults.push(resolution);
                
                if (resolution.action === 'skip') {
                    skippedIndices.add(conflictGroup.newMarkerIndex);
                    this.stats.skipped++;
                } else if (resolution.action === 'replace') {
                    this.stats.replaced++;
                } else if (resolution.action === 'offset') {
                    modifiedMarkers.push({
                        originalIndex: conflictGroup.newMarkerIndex,
                        originalMarker: conflictGroup.newMarker,
                        modifiedMarker: resolution.modifiedMarker
                    });
                    this.stats.offset++;
                } else if (resolution.action === 'cancel') {
                    this.stats.cancelled++;
                    return {
                        strategy: this.batchStrategy,
                        resolved: false,
                        cancelled: true,
                        modifiedMarkers: [],
                        skippedIndices: [],
                        results: resolutionResults
                    };
                }
                
                this.stats.resolved++;
                
            } catch (error) {
                log.error('Error resolving conflict group:', error);
                resolutionResults.push({
                    conflict: conflictGroup,
                    action: 'error',
                    error: error.message
                });
            }
        }
        
        const result = {
            strategy: this.batchStrategy,
            resolved: true,
            modifiedMarkers,
            skippedIndices: Array.from(skippedIndices),
            results: resolutionResults,
            stats: { ...this.stats }
        };
        
        log.info('Conflict resolution completed', result);
        return result;
    }
    
    /**
     * Resolve a single conflict group
     * @param {Object} conflictGroup - Group of conflicts for one marker
     * @returns {Object} Resolution result
     */
    async resolveConflictGroup(conflictGroup) {
        const { newMarker, conflicts } = conflictGroup;
        
        // Determine resolution strategy
        let strategy = this.batchStrategy;
        
        if (strategy === CONFLICT_STRATEGIES.ASK_EACH) {
            strategy = await this.promptUserForResolution(conflictGroup);
            
            if (!strategy) {
                return {
                    conflict: conflictGroup,
                    action: 'cancel'
                };
            }
        }
        
        // Apply resolution strategy
        switch (strategy) {
            case CONFLICT_STRATEGIES.SKIP:
                return {
                    conflict: conflictGroup,
                    action: 'skip',
                    reason: 'User chose to skip conflicting marker'
                };
                
            case CONFLICT_STRATEGIES.REPLACE:
                return {
                    conflict: conflictGroup,
                    action: 'replace',
                    reason: 'User chose to replace existing marker'
                };
                
            case CONFLICT_STRATEGIES.OFFSET:
                const offsetMarker = await this.calculateOffsetMarker(newMarker, conflicts);
                return {
                    conflict: conflictGroup,
                    action: 'offset',
                    modifiedMarker: offsetMarker,
                    reason: `Marker offset to avoid conflicts: ${offsetMarker.timecode}`
                };
                
            case CONFLICT_STRATEGIES.CANCEL:
                return {
                    conflict: conflictGroup,
                    action: 'cancel'
                };
                
            default:
                throw new Error(`Unknown resolution strategy: ${strategy}`);
        }
    }
    
    /**
     * Prompt user for conflict resolution
     * @param {Object} conflictGroup - Conflict group to resolve
     * @returns {string} User's chosen strategy
     */
    async promptUserForResolution(conflictGroup) {
        if (!this.userInteractionCallback) {
            // Default to skip if no user interaction available
            log.warn('No user interaction callback available, defaulting to skip');
            return CONFLICT_STRATEGIES.SKIP;
        }
        
        const { newMarker, conflicts } = conflictGroup;
        
        const promptData = {
            type: 'marker_conflict',
            newMarker,
            conflicts,
            options: {
                skip: 'Skip this marker',
                replace: 'Replace existing marker(s)',
                offset: 'Offset to next available timecode',
                cancel: 'Cancel entire operation'
            },
            allowBatch: true,
            summary: this.generateConflictGroupSummary(conflictGroup)
        };
        
        try {
            const response = await this.userInteractionCallback(promptData);
            
            if (response.applyToAll) {
                this.batchStrategy = response.strategy;
                log.info('User chose batch strategy:', this.batchStrategy);
            }
            
            return response.strategy;
            
        } catch (error) {
            log.error('Error prompting user for conflict resolution:', error);
            return CONFLICT_STRATEGIES.SKIP;
        }
    }
    
    /**
     * Calculate offset marker to avoid conflicts
     * @param {Object} newMarker - Original new marker
     * @param {Array} conflicts - Array of conflicts for this marker
     * @returns {Object} Modified marker with offset timecode
     */
    async calculateOffsetMarker(newMarker, conflicts) {
        const originalTimecode = newMarker.timecode;
        let offsetFrames = this.config.defaultOffsetFrames;
        
        // Find the minimum offset needed to avoid all conflicts
        for (const conflict of conflicts) {
            const existingTimecode = conflict.existingMarker.startLocation;
            const distance = await this.calculateTimecodeDistance(originalTimecode, existingTimecode);
            
            if (conflict.type === CONFLICT_TYPES.EXACT_TIMECODE || conflict.type === CONFLICT_TYPES.EXACT_MATCH) {
                offsetFrames = Math.max(offsetFrames, this.config.defaultOffsetFrames);
            } else if (conflict.type === CONFLICT_TYPES.NEAR_TIMECODE) {
                offsetFrames = Math.max(offsetFrames, conflict.distance + this.config.defaultOffsetFrames);
            }
        }
        
        // Calculate new timecode
        const originalTC = this.timecodeCalculator.parseTimecode(originalTimecode);
        const originalFrames = this.timecodeCalculator.timecodeToFrames(originalTC);
        const newFrames = originalFrames + offsetFrames;
        const newTC = this.timecodeCalculator.framesToTimecode(newFrames);
        const newTimecode = this.timecodeCalculator.formatTimecode(newTC);
        
        const offsetMarker = {
            ...newMarker,
            timecode: newTimecode,
            name: newMarker.name + ` (+${Math.round(offsetFrames / this.timecodeCalculator.frameRateInfo.framesPerSecond * 10) / 10}s)`,
            offsetInfo: {
                originalTimecode,
                offsetFrames,
                offsetSeconds: offsetFrames / this.timecodeCalculator.frameRateInfo.framesPerSecond
            }
        };
        
        log.debug('Calculated offset marker', {
            original: originalTimecode,
            offset: newTimecode,
            offsetFrames,
            offsetSeconds: offsetMarker.offsetInfo.offsetSeconds
        });
        
        return offsetMarker;
    }
    
    /**
     * Check if two timecodes are exactly the same
     * @param {string} timecode1 - First timecode
     * @param {string} timecode2 - Second timecode
     * @returns {boolean} True if timecodes match exactly
     */
    isExactTimecodeMatch(timecode1, timecode2) {
        try {
            const tc1 = this.timecodeCalculator.parseTimecode(timecode1);
            const tc2 = this.timecodeCalculator.parseTimecode(timecode2);
            
            return tc1.hours === tc2.hours &&
                   tc1.minutes === tc2.minutes &&
                   tc1.seconds === tc2.seconds &&
                   tc1.frames === tc2.frames;
        } catch (error) {
            log.error('Error comparing timecodes:', error);
            return false;
        }
    }
    
    /**
     * Calculate distance between two timecodes in frames
     * @param {string} timecode1 - First timecode
     * @param {string} timecode2 - Second timecode
     * @returns {number} Distance in frames (0 if same, positive if different)
     */
    async calculateTimecodeDistance(timecode1, timecode2) {
        try {
            const tc1 = this.timecodeCalculator.parseTimecode(timecode1);
            const tc2 = this.timecodeCalculator.parseTimecode(timecode2);
            
            const frames1 = this.timecodeCalculator.timecodeToFrames(tc1);
            const frames2 = this.timecodeCalculator.timecodeToFrames(tc2);
            
            return Math.abs(frames1 - frames2);
        } catch (error) {
            log.error('Error calculating timecode distance:', error);
            return Infinity;
        }
    }
    
    /**
     * Normalize marker name for comparison
     * @param {string} name - Marker name
     * @returns {string} Normalized name
     */
    normalizeName(name) {
        if (!name) return '';
        
        let normalized = name.trim();
        
        if (!this.config.caseSensitiveNames) {
            normalized = normalized.toLowerCase();
        }
        
        return normalized;
    }
    
    /**
     * Generate conflict summary
     * @param {Object} conflictsByType - Conflicts organized by type
     * @returns {Object} Summary object
     */
    generateConflictSummary(conflictsByType) {
        return {
            exactMatches: conflictsByType[CONFLICT_TYPES.EXACT_MATCH].length,
            nameConflicts: conflictsByType[CONFLICT_TYPES.EXACT_NAME].length,
            timecodeConflicts: conflictsByType[CONFLICT_TYPES.EXACT_TIMECODE].length,
            nearTimecodeConflicts: conflictsByType[CONFLICT_TYPES.NEAR_TIMECODE].length,
            totalConflicts: Object.values(conflictsByType).reduce((sum, arr) => sum + arr.length, 0)
        };
    }
    
    /**
     * Generate summary for a conflict group
     * @param {Object} conflictGroup - Single conflict group
     * @returns {string} Human-readable summary
     */
    generateConflictGroupSummary(conflictGroup) {
        const { newMarker, conflicts } = conflictGroup;
        const conflictTypes = [...new Set(conflicts.map(c => c.type))];
        
        let summary = `Marker "${newMarker.name}" at ${newMarker.timecode} has ${conflicts.length} conflict(s):\n`;
        
        conflicts.forEach((conflict, index) => {
            summary += `${index + 1}. ${conflict.description}\n`;
        });
        
        return summary;
    }
    
    /**
     * Reset batch strategy and statistics
     */
    reset() {
        this.batchStrategy = null;
        this.batchStrategyAppliedCount = 0;
        this.stats = {
            totalChecked: 0,
            conflicts: 0,
            resolved: 0,
            skipped: 0,
            replaced: 0,
            offset: 0,
            cancelled: 0
        };
        
        log.debug('MarkerConflictDetector reset');
    }
    
    /**
     * Get current statistics
     * @returns {Object} Current statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            batchStrategy: this.batchStrategy,
            batchStrategyAppliedCount: this.batchStrategyAppliedCount
        };
    }
    
    /**
     * Update frame rate and recreate timecode calculator
     * @param {string} frameRate - New frame rate
     */
    setFrameRate(frameRate) {
        this.frameRate = frameRate;
        this.timecodeCalculator = new TimecodeCalculator(frameRate);
        log.debug('Frame rate updated', { frameRate });
    }
}

/**
 * Utility functions for conflict detection
 */
const ConflictDetectionUtils = {
    /**
     * Create conflict detector with session settings
     * @param {Object} sessionInfo - Session information from Pro Tools
     * @param {Object} options - Additional options
     * @returns {MarkerConflictDetector} Configured detector
     */
    createDetectorForSession(sessionInfo, options = {}) {
        const frameRate = sessionInfo.timecodeRate?.fps ? 
            `${sessionInfo.timecodeRate.fps}${sessionInfo.timecodeRate.dropFrame ? 'drop' : ''}` : 
            '29.97';
            
        return new MarkerConflictDetector(frameRate, options);
    },
    
    /**
     * Quick conflict check without full resolution
     * @param {Array} newMarkers - New markers
     * @param {Array} existingMarkers - Existing markers
     * @param {string} frameRate - Frame rate
     * @returns {boolean} True if conflicts exist
     */
    async hasConflicts(newMarkers, existingMarkers, frameRate = '29.97') {
        const detector = new MarkerConflictDetector(frameRate);
        const results = await detector.detectConflicts(newMarkers, existingMarkers);
        return results.hasConflicts;
    }
};

module.exports = {
    MarkerConflictDetector,
    ConflictDetectionUtils,
    CONFLICT_STRATEGIES,
    CONFLICT_TYPES
};