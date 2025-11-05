const log = require('electron-log');
const PTSLMessageBuilder = require('./ptsl-message-builder.js');
const { PTSLErrorHandler, PTSL_ERROR_TYPES } = require('./ptsl-error-handler.js');
const { MarkerConflictDetector, ConflictDetectionUtils, CONFLICT_STRATEGIES } = require('./marker-conflict-detector.js');
const { ComprehensiveErrorHandler, ERROR_CATEGORIES, RECOVERY_STRATEGIES } = require('./comprehensive-error-handler.js');

/**
 * Marker Creation Pipeline
 * Handles the complete workflow for creating Frame.io markers in Pro Tools
 * with proper validation, conflict detection, and progress reporting
 */
class MarkerCreationPipeline {
    constructor(connectionManager, ipcHandler = null) {
        this.connectionManager = connectionManager;
        this.ipcHandler = ipcHandler;
        this.messageBuilder = new PTSLMessageBuilder();
        this.errorHandler = new PTSLErrorHandler();
        
        // Pipeline state
        this.isRunning = false;
        this.currentOperation = null;
        this.sessionInfo = null;
        this.existingMarkers = [];
        this.options = {};
        
        // Conflict detection
        this.conflictDetector = null;
        this.userInteractionCallback = null;
        
        // Comprehensive error handling
        this.errorHandler = new ComprehensiveErrorHandler({
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            circuitBreakerThreshold: 5,
            batchRetryLimit: 2
        });
        
        // Progress tracking
        this.totalMarkers = 0;
        this.processedMarkers = 0;
        this.createdMarkers = 0;
        this.skippedMarkers = 0;
        this.failedMarkers = 0;
        
        // Timecode settings
        this.sessionTimecodeRate = null;
        this.isDropFrame = false;
        
        // Color mapping for marker types
        this.markerColors = {
            main: 0,    // Blue for main comments
            reply: 1,   // Red for replies
            note: 2,    // Green for notes
            warning: 3, // Yellow for warnings
            error: 4    // Orange for errors
        };
        
        log.info('MarkerCreationPipeline initialized');
    }
    
    /**
     * Set user interaction callback for conflict resolution and error recovery
     * @param {Function} callback - Function to handle user prompts for conflicts and errors
     */
    setUserInteractionCallback(callback) {
        this.userInteractionCallback = callback;
        if (this.conflictDetector) {
            this.conflictDetector.setUserInteractionCallback(callback);
        }
        if (this.errorHandler) {
            this.errorHandler.setUserInteractionCallback(callback);
        }
    }
    
    /**
     * Set progress callback for error handling
     * @param {Function} callback - Function to handle progress updates
     */
    setProgressCallback(callback) {
        if (this.errorHandler) {
            this.errorHandler.setProgressCallback(callback);
        }
    }
    
    /**
     * Main pipeline entry point
     * @param {Array} frameioMarkers - Array of Frame.io markers to create
     * @param {Object} options - Pipeline options
     */
    async createMarkers(frameioMarkers, options = {}) {
        if (this.isRunning) {
            throw new Error('Pipeline is already running');
        }
        
        this.isRunning = true;
        this.options = options;
        this.totalMarkers = frameioMarkers.length;
        this.processedMarkers = 0;
        this.createdMarkers = 0;
        this.skippedMarkers = 0;
        this.failedMarkers = 0;
        
        try {
            log.info(`Starting marker creation pipeline for ${this.totalMarkers} markers`);
            this.reportProgress('Starting pipeline', 0);
            
            // Step 1: Validate session compatibility
            this.currentOperation = 'Validating session compatibility';
            const validationResult = await this.validateSessionCompatibility();
            if (!validationResult.valid) {
                throw new Error(`Session validation failed: ${validationResult.errors.join(', ')}`);
            }
            this.reportProgress(this.currentOperation, 10);
            
            // Step 2: Get existing markers to check for conflicts
            this.currentOperation = 'Checking for existing markers';
            await this.getExistingMarkers();
            this.reportProgress(this.currentOperation, 20);
            
            // Step 3: Initialize conflict detector with session settings
            this.currentOperation = 'Initializing conflict detection';
            this.initializeConflictDetector();
            this.reportProgress(this.currentOperation, 25);
            
            // Step 4: Validate and process Frame.io markers
            this.currentOperation = 'Validating markers';
            const validatedMarkers = await this.validateMarkers(frameioMarkers);
            this.reportProgress(this.currentOperation, 35);
            
            // Step 5: Detect and resolve conflicts
            this.currentOperation = 'Checking for conflicts';
            const { finalMarkers, conflictResults } = await this.handleConflicts(validatedMarkers, options);
            this.reportProgress(this.currentOperation, 50);
            
            // Step 6: Create markers in batches
            this.currentOperation = 'Creating markers';
            const results = await this.batchCreateMarkers(finalMarkers, options);
            this.reportProgress('Pipeline completed', 100);
            
            log.info('Marker creation pipeline completed', {
                total: this.totalMarkers,
                created: this.createdMarkers,
                skipped: this.skippedMarkers,
                failed: this.failedMarkers
            });
            
            return {
                success: true,
                total: this.totalMarkers,
                created: this.createdMarkers,
                skipped: this.skippedMarkers,
                failed: this.failedMarkers,
                results: results,
                conflictResults: conflictResults
            };
            
        } catch (error) {
            log.error('Marker creation pipeline failed:', error);
            this.reportProgress(`Pipeline failed: ${error.message}`, -1);
            throw error;
        } finally {
            this.isRunning = false;
            this.currentOperation = null;
        }
    }
    
    /**
     * Validate session compatibility using connection manager's enhanced methods
     */
    async validateSessionCompatibility() {
        try {
            log.debug('Validating session compatibility using connection manager');
            
            // Use connection manager's comprehensive getSessionInfo method
            const sessionInfo = await this.connectionManager.getSessionInfo();
            
            // Parse timecode settings from session info
            this.sessionTimecodeRate = this.parseTimecodeRate(sessionInfo.timeCodeRate);
            this.isDropFrame = this.sessionTimecodeRate.dropFrame;
            
            // Store processed session info
            this.sessionInfo = {
                name: sessionInfo.name || 'Unknown Session',
                sampleRate: sessionInfo.sampleRate,
                timecodeRate: this.sessionTimecodeRate,
                timeCodeRate: sessionInfo.timeCodeRate, // Keep original for reference
                frameRate: sessionInfo.frameRate, // Numeric frame rate from Pro Tools
                isDropFrame: this.isDropFrame
            };
            
            log.info('Session compatibility validated using connection manager', this.sessionInfo);
            
            // Configure time formatter and message builder with Pro Tools session parameters
            const numericSampleRate = this._convertToNumericSampleRate(sessionInfo.sampleRate);
            this.messageBuilder.setSessionParameters(numericSampleRate, sessionInfo.frameRate);
            
            log.debug('Updated message builder with Pro Tools session parameters', {
                sampleRate: numericSampleRate,
                frameRate: sessionInfo.frameRate,
                timecodeFormat: sessionInfo.timecodeFormat
            });
            
            // Validate supported sample rates
            const supportedRates = [44100, 48000, 88200, 96000, 176400, 192000];
            const warnings = [];
            const errors = [];
            
            // Enhanced debugging for sample rate validation
            log.debug('Sample rate validation details', {
                originalRate: sessionInfo.sampleRate,
                originalType: typeof sessionInfo.sampleRate,
                numericRate: numericSampleRate,
                numericType: typeof numericSampleRate,
                supportedRates,
                isSupported: supportedRates.includes(numericSampleRate)
            });
            
            if (!supportedRates.includes(numericSampleRate)) {
                const warning = `Unsupported sample rate detected: ${sessionInfo.sampleRate}. Supported rates: ${supportedRates.join(', ')} Hz`;
                log.warn(warning, { 
                    rate: sessionInfo.sampleRate,
                    numericRate: numericSampleRate,
                    supportedRates 
                });
                warnings.push(warning);
            } else {
                log.debug('✅ Sample rate validation passed', {
                    rate: sessionInfo.sampleRate,
                    numericRate: numericSampleRate
                });
            }
            
            // Validate frame rate compatibility with user expectations
            if (this.options && this.options.expectedFrameRate) {
                const sessionFrameRate = sessionInfo.frameRate;
                const expectedFrameRate = this.options.expectedFrameRate;
                const frameRateTolerance = 0.001; // Allow small floating point differences
                
                if (Math.abs(sessionFrameRate - expectedFrameRate) > frameRateTolerance) {
                    const warning = `Frame rate mismatch detected! Pro Tools session: ${sessionFrameRate}fps, Expected: ${expectedFrameRate}fps. Markers may appear at incorrect times.`;
                    log.warn('Frame rate mismatch detected', {
                        sessionFrameRate,
                        expectedFrameRate,
                        ptslFormat: sessionInfo.timecodeFormat,
                        difference: Math.abs(sessionFrameRate - expectedFrameRate)
                    });
                    warnings.push(warning);
                    
                    // Also add error if difference is significant (indicates wrong session)
                    if (Math.abs(sessionFrameRate - expectedFrameRate) > 1) {
                        errors.push(`Significant frame rate mismatch (${sessionFrameRate}fps vs ${expectedFrameRate}fps) - markers will be created at wrong times`);
                    }
                } else {
                    log.debug('✅ Frame rate validation passed', {
                        sessionFrameRate,
                        expectedFrameRate,
                        ptslFormat: sessionInfo.timecodeFormat
                    });
                }
            } else {
                log.info('Using Pro Tools session frame rate (no user expectation provided)', {
                    frameRate: sessionInfo.frameRate,
                    ptslFormat: sessionInfo.timecodeFormat
                });
            }
            
            // Return validation result object
            return {
                valid: errors.length === 0,
                errors,
                warnings,
                sessionInfo: this.sessionInfo
            };
            
        } catch (error) {
            log.error('Session compatibility validation failed:', error);
            return {
                valid: false,
                errors: [`Session validation failed: ${error.message}`],
                warnings: [],
                sessionInfo: null
            };
        }
    }
    
    /**
     * Get existing markers to check for conflicts using connection manager's enhanced method
     */
    async getExistingMarkers() {
        try {
            log.debug('Getting existing memory locations using connection manager');
            
            // Use connection manager's getMemoryLocations method with error handling
            const result = await this.connectionManager.getMemoryLocations();
            
            // Extract markers from result
            this.existingMarkers = result.memoryLocations.map(marker => ({
                name: marker.name,
                startLocation: marker.startTime || marker.startLocation, // Handle both field names
                startTime: marker.startTime,
                timeProperties: marker.timeProperties,
                reference: marker.reference,
                colorIndex: marker.colorIndex
            }));
            
            log.info(`Found ${this.existingMarkers.length} existing memory locations using connection manager`, {
                totalCount: result.totalCount,
                stats: result.stats
            });
            
        } catch (error) {
            log.error('Failed to get existing markers:', error);
            throw new Error(`Failed to get existing markers: ${error.message}`);
        }
    }
    
    /**
     * Initialize conflict detector with session settings
     */
    initializeConflictDetector() {
        try {
            // Create frame rate string for conflict detector
            let frameRateString = '29.97'; // Default fallback
            
            if (this.sessionInfo?.timecodeRate) {
                const rate = this.sessionInfo.timecodeRate;
                frameRateString = `${rate.fps}${rate.dropFrame ? 'drop' : ''}`;
            }
            
            // Initialize conflict detector
            this.conflictDetector = new MarkerConflictDetector(frameRateString, {
                nearTimecodeThreshold: 15,     // 0.5 seconds at 30fps
                defaultOffset: 30,             // 1 second at 30fps
                enableNearDetection: true,
                caseSensitiveNames: false
            });
            
            // Set user interaction callback if available
            if (this.userInteractionCallback) {
                this.conflictDetector.setUserInteractionCallback(this.userInteractionCallback);
            }
            
            log.info('Conflict detector initialized', {
                frameRate: frameRateString,
                existingMarkersCount: this.existingMarkers.length
            });
            
        } catch (error) {
            log.error('Failed to initialize conflict detector:', error);
            throw new Error(`Conflict detector initialization failed: ${error.message}`);
        }
    }
    
    /**
     * Handle conflict detection and resolution
     * @param {Array} validatedMarkers - Validated markers ready for creation
     * @param {Object} options - Pipeline options including conflict strategy
     * @returns {Object} Final markers and conflict results
     */
    async handleConflicts(validatedMarkers, options = {}) {
        try {
            if (!this.conflictDetector) {
                throw new Error('Conflict detector not initialized');
            }
            
            log.info('Starting conflict detection and resolution', {
                newMarkersCount: validatedMarkers.length,
                existingMarkersCount: this.existingMarkers.length
            });
            
            // Step 1: Detect conflicts
            const conflictResults = await this.conflictDetector.detectConflicts(
                validatedMarkers, 
                this.existingMarkers
            );
            
            if (!conflictResults.hasConflicts) {
                log.info('No conflicts detected, proceeding with all markers');
                return {
                    finalMarkers: validatedMarkers,
                    conflictResults: conflictResults
                };
            }
            
            // Step 2: Handle conflicts based on strategy
            const conflictStrategy = options.conflictStrategy || CONFLICT_STRATEGIES.ASK_EACH;
            
            log.info('Conflicts detected, resolving with strategy', {
                conflictCount: conflictResults.totalConflicts,
                strategy: conflictStrategy,
                summary: conflictResults.summary
            });
            
            // Report conflict detection to user
            this.reportConflictDetection(conflictResults);
            
            // Step 3: Resolve conflicts
            const resolutionResults = await this.conflictDetector.resolveConflicts(
                conflictResults, 
                conflictStrategy
            );
            
            if (!resolutionResults.resolved) {
                throw new Error('Conflict resolution was cancelled by user');
            }
            
            // Step 4: Apply resolution results
            const finalMarkers = this.applyConflictResolution(validatedMarkers, resolutionResults);
            
            // Update skip count for pipeline stats
            this.skippedMarkers += resolutionResults.skippedIndices.length;
            
            log.info('Conflict resolution completed', {
                originalCount: validatedMarkers.length,
                finalCount: finalMarkers.length,
                skipped: resolutionResults.skippedIndices.length,
                modified: resolutionResults.modifiedMarkers.length,
                strategy: resolutionResults.strategy
            });
            
            return {
                finalMarkers,
                conflictResults: {
                    ...conflictResults,
                    resolutionResults
                }
            };
            
        } catch (error) {
            log.error('Conflict handling failed:', error);
            throw new Error(`Conflict resolution failed: ${error.message}`);
        }
    }
    
    /**
     * Apply conflict resolution results to marker list
     * @param {Array} originalMarkers - Original validated markers
     * @param {Object} resolutionResults - Results from conflict resolution
     * @returns {Array} Final marker list for creation
     */
    applyConflictResolution(originalMarkers, resolutionResults) {
        const finalMarkers = [];
        const skippedIndices = new Set(resolutionResults.skippedIndices);
        const modifiedMarkers = new Map();
        
        // Create map of modified markers
        resolutionResults.modifiedMarkers.forEach(mod => {
            modifiedMarkers.set(mod.originalIndex, mod.modifiedMarker);
        });
        
        // Build final marker list
        for (let i = 0; i < originalMarkers.length; i++) {
            if (skippedIndices.has(i)) {
                // Skip this marker
                continue;
            }
            
            if (modifiedMarkers.has(i)) {
                // Use modified marker
                finalMarkers.push(modifiedMarkers.get(i));
            } else {
                // Use original marker
                finalMarkers.push(originalMarkers[i]);
            }
        }
        
        return finalMarkers;
    }
    
    /**
     * Report conflict detection to user interface
     * @param {Object} conflictResults - Conflict detection results
     */
    reportConflictDetection(conflictResults) {
        const conflictData = {
            type: 'conflict_detected',
            hasConflicts: conflictResults.hasConflicts,
            totalConflicts: conflictResults.totalConflicts,
            summary: conflictResults.summary,
            details: conflictResults.conflictsByType
        };
        
        log.debug('Reporting conflict detection:', conflictData);
        
        if (this.ipcHandler) {
            this.ipcHandler.send('marker-conflicts-detected', conflictData);
        }
    }
    
    /**
     * Validate Frame.io markers and convert to Pro Tools format
     */
    async validateMarkers(frameioMarkers) {
        const validatedMarkers = [];
        
        for (let i = 0; i < frameioMarkers.length; i++) {
            const marker = frameioMarkers[i];
            
            try {
                // Validate required fields - only timecode is required
                if (!marker.timecode) {
                    log.warn(`Skipping marker ${i + 1}: missing timecode`, marker);
                    this.skippedMarkers++;
                    continue;
                }
                
                // Auto-generate name if missing (Frame.io comments don't have name field)
                if (!marker.name) {
                    marker.name = this.generateMarkerName(marker);
                    log.debug(`Auto-generated marker name: "${marker.name}" for marker ${i + 1}`);
                }
                
                // Validate and convert timecode with comprehensive error handling
                const validatedTimecode = this.validateAndConvertTimecode(marker.timecode);
                if (!validatedTimecode) {
                    const timecodeError = await this.errorHandler.handleError(
                        new Error(`Invalid timecode format: ${marker.timecode}`), 
                        {
                            operation: 'validate_timecode',
                            markerIndex: i,
                            markerName: marker.name,
                            timecode: marker.timecode
                        }
                    );
                    
                    log.warn(`Skipping marker ${i + 1}: ${timecodeError.userMessage}`, { 
                        timecode: marker.timecode,
                        error: timecodeError
                    });
                    
                    this.skippedMarkers++;
                    continue;
                }
                
                // Note: Conflict detection is now handled separately in handleConflicts()
                // This allows for more sophisticated conflict resolution options
                
                // Determine marker color based on type
                const colorIndex = this.determineMarkerColor(marker);
                
                // Create validated marker object
                const validatedMarker = {
                    name: this.sanitizeMarkerName(marker.name),
                    timecode: validatedTimecode,
                    comments: marker.text || marker.comment || '',
                    colorIndex: colorIndex,
                    isReply: marker.isReply || false,
                    author: marker.author || '',
                    originalIndex: i,
                    frameioData: marker
                };
                
                validatedMarkers.push(validatedMarker);
                
            } catch (error) {
                // Use error handler for validation errors
                const handledError = await this.errorHandler.handleError(error, {
                    operation: 'validate_marker',
                    markerIndex: i,
                    markerName: marker.name
                });
                
                log.error(`Error validating marker ${i + 1}:`, handledError);
                this.failedMarkers++;
            }
        }
        
        log.info(`Validated ${validatedMarkers.length} markers for creation`);
        return validatedMarkers;
    }
    
    /**
     * Create markers in batches with progress reporting
     */
    async batchCreateMarkers(validatedMarkers, options = {}) {
        const batchSize = options.batchSize || 10;
        const delayBetweenBatches = options.delayMs || 100;
        const results = [];
        
        // Get starting number for batch - do this once at the batch level
        let startingNumber = 1;
        try {
            const existingLocations = await this.connectionManager.getMemoryLocations();
            if (existingLocations.length > 0) {
                const maxNumber = Math.max(...existingLocations
                    .map(loc => loc.number || 0)
                    .filter(num => typeof num === 'number' && num > 0));
                startingNumber = maxNumber > 0 ? maxNumber + 1 : 1;
            }
            log.debug('Batch numbering starting from', { startingNumber, existingCount: existingLocations.length });
        } catch (error) {
            log.warn('Failed to get existing markers for batch numbering, starting from 1', { error: error.message });
        }
        
        // Remove explicit numbering - let Pro Tools auto-assign to avoid multi-track conflicts  
        validatedMarkers.forEach((marker, index) => {
            // marker.explicitNumber = startingNumber + index; // Disabled to prevent conflicts
            // markerTrack removed - all markers go to main ruler
        });
        
        for (let i = 0; i < validatedMarkers.length; i += batchSize) {
            const batch = validatedMarkers.slice(i, i + batchSize);
            
            log.debug(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(validatedMarkers.length / batchSize)}`);
            
            // Process batch
            const batchResults = await this.processBatch(batch);
            results.push(...batchResults);
            
            // Update progress
            this.processedMarkers = Math.min(i + batchSize, validatedMarkers.length);
            const progress = 30 + Math.round((this.processedMarkers / validatedMarkers.length) * 60);
            this.reportProgress(`Creating markers (${this.processedMarkers}/${validatedMarkers.length})`, progress);
            
            // Delay between batches to avoid overwhelming Pro Tools
            if (i + batchSize < validatedMarkers.length && delayBetweenBatches > 0) {
                await this.delay(delayBetweenBatches);
            }
        }
        
        return results;
    }
    


    /**
     * Process a batch of markers with comprehensive error handling
     */
    async processBatch(batch, batchIndex = 0) {
        const results = [];
        const batchId = `batch_${batchIndex}_${Date.now()}`;
        
        // Initialize batch operation in error handler (if supported)
        if (this.errorHandler.batchOperations && typeof this.errorHandler.batchOperations.set === 'function') {
            this.errorHandler.batchOperations.set(batchId, {
                totalMarkers: batch.length,
                failedMarkers: [],
                retryCount: 0,
                startTime: Date.now()
            });
        }
        
        for (let i = 0; i < batch.length; i++) {
            const marker = batch[i];
            const isLastMarker = i === batch.length - 1;
            
            // Create context for error handling
            const context = {
                markerIndex: i,
                totalMarkers: batch.length,
                isBatchOperation: true,
                batchId: batchId,
                isLastMarker: isLastMarker
            };
            
            try {
                const result = await this.createSingleMarker(marker, context);
                results.push(result);
                
                if (result.success) {
                    this.createdMarkers++;
                    log.debug('Marker created successfully in batch', {
                        batchId,
                        markerIndex: i,
                        markerName: marker.name
                    });
                } else {
                    this.failedMarkers++;
                    log.warn('Marker failed in batch', {
                        batchId,
                        markerIndex: i,
                        markerName: marker.name,
                        error: result.error
                    });
                    
                    // Handle specific error types
                    if (result.errorType === 'circuit_breaker') {
                        log.warn('Circuit breaker activated, stopping batch processing');
                        break;
                    }
                }
                
            } catch (error) {
                // This should rarely happen now since createSingleMarker handles errors
                log.error('Unexpected error in batch processing:', error);
                
                results.push({
                    success: false,
                    marker: marker,
                    error: error.message,
                    errorType: 'unexpected_error',
                    attempts: 1
                });
                this.failedMarkers++;
            }
        }
        
        // Handle batch completion and potential retries (if supported)
        if (this.errorHandler.batchOperations && typeof this.errorHandler.batchOperations.get === 'function') {
            const batchInfo = this.errorHandler.batchOperations.get(batchId);
            if (batchInfo && batchInfo.failedMarkers.length > 0) {
                const retryResult = await this.handleBatchFailures(batchId, batchInfo, results);
                if (retryResult.shouldRetry) {
                    // Retry failed markers
                    const failedMarkers = retryResult.failedMarkers.map(index => batch[index]);
                    const retryResults = await this.processBatch(failedMarkers, batchIndex + 100); // Offset to avoid ID collision
                    
                    // Update original results with retry results
                    retryResult.failedMarkers.forEach((originalIndex, retryIndex) => {
                        if (retryResults[retryIndex]) {
                            results[originalIndex] = retryResults[retryIndex];
                            
                            // Update counters
                            if (retryResults[retryIndex].success) {
                                this.createdMarkers++;
                                this.failedMarkers--;
                            }
                        }
                    });
                }
            }
            
            // Clean up batch operation
            this.errorHandler.batchOperations.delete(batchId);
        }
        
        return results;
    }
    
    /**
     * Handle batch failures and determine if retry is needed
     * @param {string} batchId - Batch identifier
     * @param {Object} batchInfo - Batch information
     * @param {Array} results - Current batch results
     * @returns {Object} Retry decision and failed marker indices
     */
    async handleBatchFailures(batchId, batchInfo, results) {
        const failedMarkers = [];
        
        // Collect failed marker indices
        results.forEach((result, index) => {
            if (!result.success && result.errorType !== 'skipped' && result.errorType !== 'circuit_breaker') {
                failedMarkers.push(index);
            }
        });
        
        if (failedMarkers.length === 0) {
            return { shouldRetry: false, failedMarkers: [] };
        }
        
        // Check if we should offer batch retry
        const batchRetryLimit = this.errorHandler.options?.batchRetryLimit || 2;
        if (batchInfo.retryCount >= batchRetryLimit) {
            log.info('Batch retry limit reached', {
                batchId,
                retryCount: batchInfo.retryCount,
                failedCount: failedMarkers.length
            });
            return { shouldRetry: false, failedMarkers };
        }
        
        // Create error context for batch retry decision
        const errorContext = {
            operation: 'batch_completion',
            batchId,
            failedCount: failedMarkers.length,
            totalCount: batchInfo.totalMarkers,
            retryCount: batchInfo.retryCount,
            isBatchOperation: true
        };
        
        // Use error handler to determine if we should retry
        const recoveryResult = await this.errorHandler.offerBatchRetry(batchId, {
            ...batchInfo,
            failedMarkers
        });
        
        if (recoveryResult.action === 'retry_failed') {
            batchInfo.retryCount++;
            log.info('Retrying failed markers in batch', {
                batchId,
                failedCount: failedMarkers.length,
                retryAttempt: batchInfo.retryCount
            });
            return { shouldRetry: true, failedMarkers };
        }
        
        return { shouldRetry: false, failedMarkers };
    }
    
    /**
     * Create a single marker in Pro Tools with comprehensive error handling
     */
    async createSingleMarker(marker, context = {}) {
        const maxRetries = 3;
        let attempt = 0;
        
        while (attempt <= maxRetries) {
            try {
                log.debug('Creating marker', { 
                    name: marker.name, 
                    timecode: marker.timecode, 
                    attempt: attempt + 1 
                });
                
                // Build creation options - always use main marker track
                const creationOptions = {
                    colorIndex: marker.colorIndex,
                    reference: 'absolute',
                    timeProperties: 'marker', // For timeline display
                    // Remove explicit numbering - let Pro Tools auto-assign to avoid conflicts
                    // number: marker.explicitNumber, // Disabled to prevent multi-track conflicts
                    useSmartNumbering: false, // Use Pro Tools auto-assignment instead
                    maxRetries: 3,
                    location: 'MainRuler' // Always use main marker ruler
                };

                // Apply session start offset if provided  
                let finalTimecode = marker.timecode;
                if (this.options?.sessionStart && this.options.sessionStart !== '00:00:00:00') {
                    log.info('🔥 PIPELINE DEBUG: Applying timecode offset', {
                        original: marker.timecode,
                        sessionStart: this.options.sessionStart,
                        hasOffset: true
                    });
                    finalTimecode = this.addTimecodeOffset(marker.timecode, this.options.sessionStart);
                    log.info('🔥 PIPELINE DEBUG: After offset calculation', {
                        original: marker.timecode,
                        sessionStart: this.options.sessionStart,
                        final: finalTimecode
                    });
                }

                // Use connection manager's createMemoryLocation method
                // Put comment text in the name field, and name in the comments field
                const response = await this.connectionManager.createMemoryLocation(
                    marker.comments,  // Comment text goes in name field
                    finalTimecode,
                    marker.name,      // Name goes in comments field
                    creationOptions
                );
                
                // Verification temporarily disabled to avoid undefined property errors
                log.debug('Marker creation completed', { name: marker.name });
                
                log.debug('Marker created successfully', { name: marker.name });
                
                // Reset error handler on success
                this.errorHandler.consecutiveErrors = 0;
                
                return {
                    success: true,
                    marker: marker,
                    response: response,
                    attempts: attempt + 1
                };
                
            } catch (error) {
                attempt++;
                
                log.warn('Marker creation attempt failed', { 
                    attempt, 
                    maxRetries, 
                    error: error.message,
                    markerName: marker.name 
                });
                
                // Create comprehensive error context
                const errorContext = {
                    operation: 'create_single_marker',
                    markerName: marker.name,
                    markerTimecode: marker.timecode,
                    markerIndex: context.markerIndex,
                    totalMarkers: context.totalMarkers,
                    isBatchOperation: context.isBatchOperation,
                    batchId: context.batchId,
                    isLastMarker: context.isLastMarker,
                    attempt,
                    maxRetries,
                    connectionManager: this.connectionManager,
                    retryCount: attempt - 1
                };
                
                // Use comprehensive error handler
                const recoveryResult = await this.errorHandler.handleError(error, errorContext);
                
                // Handle recovery result
                if (!recoveryResult.success) {
                    log.error('Error recovery failed for marker creation', {
                        markerName: marker.name,
                        strategy: recoveryResult.strategy,
                        action: recoveryResult.action
                    });
                    
                    // Return error result instead of throwing
                    return {
                        success: false,
                        marker: marker,
                        error: error.message,
                        errorType: recoveryResult.strategy,
                        recovery: recoveryResult,
                        attempts: attempt
                    };
                }
                
                // Handle different recovery actions
                switch (recoveryResult.action) {
                    case 'retry':
                        // Continue with retry loop
                        if (recoveryResult.delay) {
                            await this.delay(recoveryResult.delay);
                        }
                        if (recoveryResult.context) {
                            // Update context for next attempt
                            Object.assign(errorContext, recoveryResult.context);
                        }
                        continue;
                        
                    case 'skip':
                        return {
                            success: false,
                            marker: marker,
                            error: 'Marker skipped due to error',
                            errorType: 'skipped',
                            recovery: recoveryResult,
                            attempts: attempt
                        };
                        
                    case 'abort':
                        throw new Error(`Marker creation aborted: ${recoveryResult.reason}`);
                        
                    case 'circuit_open':
                        return {
                            success: false,
                            marker: marker,
                            error: 'Circuit breaker open - operations paused',
                            errorType: 'circuit_breaker',
                            recovery: recoveryResult,
                            attempts: attempt
                        };
                        
                    default:
                        // If we don't know how to handle the recovery, break retry loop
                        break;
                }
                
                // If we're here and it's the last attempt, break
                if (attempt >= maxRetries) {
                    break;
                }
            }
        }
        
        // All retries exhausted
        return {
            success: false,
            marker: marker,
            error: 'Maximum retry attempts exceeded',
            errorType: 'max_retries_exceeded',
            attempts: attempt
        };
    }
    
    /**
     * Utility function to create a delay
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Validate and convert timecode to proper format (hh:mm:ss:ff)
     */
    validateAndConvertTimecode(timecode) {
        try {
            // Handle various input formats
            let cleanTimecode = timecode.trim();
            
            // Convert Frame.io format (00:03:30.12) to Pro Tools format (00:03:30:12)
            if (cleanTimecode.includes('.')) {
                const parts = cleanTimecode.split('.');
                if (parts.length === 2 && parts[1].length === 2) {
                    cleanTimecode = `${parts[0]}:${parts[1]}`;
                }
            }
            
            // Validate format: hh:mm:ss:ff
            const timecodeRegex = /^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/;
            const match = cleanTimecode.match(timecodeRegex);
            
            if (!match) {
                return null;
            }
            
            const [, hours, minutes, seconds, frames] = match;
            
            // Validate ranges
            if (parseInt(hours) > 23 || parseInt(minutes) > 59 || parseInt(seconds) > 59) {
                return null;
            }
            
            // Validate frames based on session timecode rate
            const maxFrames = this.getMaxFramesForRate();
            if (parseInt(frames) >= maxFrames) {
                return null;
            }
            
            // Handle drop-frame conversion if needed
            const convertedTimecode = this.convertToDropFrame(cleanTimecode);
            
            // Ensure proper zero-padding
            const paddedTimecode = this.padTimecode(convertedTimecode);
            
            log.debug('Timecode validated and converted', { 
                original: timecode, 
                converted: paddedTimecode,
                isDropFrame: this.isDropFrame
            });
            
            return paddedTimecode;
            
        } catch (error) {
            log.error('Timecode validation failed:', error);
            return null;
        }
    }
    
    /**
     * Convert timecode to drop-frame format if needed
     */
    convertToDropFrame(timecode) {
        if (!this.isDropFrame) {
            return timecode;
        }
        
        // Drop-frame conversion logic
        // For 29.97 FPS, frames 00 and 01 are dropped at the start of every minute except multiples of 10
        const parts = timecode.split(':');
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseInt(parts[2]);
        let frames = parseInt(parts[3]);
        
        // Drop-frame rules for 29.97 FPS
        if (this.sessionTimecodeRate.fps === 29.97 && seconds === 0 && (frames === 0 || frames === 1) && minutes % 10 !== 0) {
            frames = 2; // Skip frames 0 and 1
        }
        
        return `${parts[0]}:${parts[1]}:${parts[2]}:${frames.toString().padStart(2, '0')}`;
    }
    
    /**
     * Get maximum frames per second based on session rate
     */
    getMaxFramesForRate() {
        if (!this.sessionTimecodeRate) {
            return 30; // Default fallback
        }
        
        return Math.ceil(this.sessionTimecodeRate.fps);
    }
    
    /**
     * Pad timecode to ensure proper format
     */
    padTimecode(timecode) {
        const parts = timecode.split(':');
        return parts.map((part, index) => {
            const padding = index === 0 ? 2 : 2; // Hours can be 1-2 digits, others always 2
            return part.padStart(padding, '0');
        }).join(':');
    }
    
    /**
     * Parse timecode rate from Pro Tools response
     */
    parseTimecodeRate(timecodeRate) {
        const rates = {
            'Fps23976': { fps: 23.976, dropFrame: false },
            'Fps24': { fps: 24, dropFrame: false },
            'Fps25': { fps: 25, dropFrame: false },
            'Fps2997': { fps: 29.97, dropFrame: false },
            'Fps2997Drop': { fps: 29.97, dropFrame: true },
            'Fps30': { fps: 30, dropFrame: false },
            'Fps30Drop': { fps: 30, dropFrame: true },
            'Fps50': { fps: 50, dropFrame: false },
            'Fps5994': { fps: 59.94, dropFrame: false },
            'Fps5994Drop': { fps: 59.94, dropFrame: true },
            'Fps60': { fps: 60, dropFrame: false }
        };
        
        return rates[timecodeRate] || { fps: 25, dropFrame: false };
    }
    
    /**
     * Check for marker conflicts with existing markers
     */
    checkMarkerConflict(name, timecode) {
        return this.existingMarkers.some(existing => 
            existing.name === name || existing.startLocation === timecode
        );
    }

    /**
     * Add timecode offset to marker timecode
     * @param {string} markerTimecode - Original marker timecode (e.g. "00:03:30:12")
     * @param {string} sessionStart - Session start offset (e.g. "04:00:00:00") 
     * @returns {string} Final timecode with offset applied
     */
    addTimecodeOffset(markerTimecode, sessionStart) {
        try {
            log.info('🔥 OFFSET DEBUG: addTimecodeOffset called', {
                markerTimecode,
                sessionStart,
                hasSessionStart: !!sessionStart,
                sessionStartType: typeof sessionStart
            });
            
            // Parse both timecodes
            const [mH, mM, mS, mF] = markerTimecode.split(':').map(Number);
            const [sH, sM, sS, sF] = sessionStart.split(':').map(Number);
            
            // Simple addition
            let totalHours = mH + sH;
            let totalMinutes = mM + sM;
            let totalSeconds = mS + sS;
            let totalFrames = mF + sF;
            
            // Handle overflow - use conservative 24fps
            if (totalFrames >= 24) {
                totalSeconds += Math.floor(totalFrames / 24);
                totalFrames = totalFrames % 24;
            }
            
            if (totalSeconds >= 60) {
                totalMinutes += Math.floor(totalSeconds / 60);
                totalSeconds = totalSeconds % 60;
            }
            
            if (totalMinutes >= 60) {
                totalHours += Math.floor(totalMinutes / 60);
                totalMinutes = totalMinutes % 60;
            }
            
            // Format back to timecode string
            const result = [
                totalHours.toString().padStart(2, '0'),
                totalMinutes.toString().padStart(2, '0'),
                totalSeconds.toString().padStart(2, '0'), 
                totalFrames.toString().padStart(2, '0')
            ].join(':');
            
            log.info('🔥 OFFSET DEBUG: Calculated result', {
                original: markerTimecode,
                sessionStart,
                final: result,
                calculation: { totalHours, totalMinutes, totalSeconds, totalFrames }
            });
            
            return result;
            
        } catch (error) {
            log.error('Failed to add timecode offset', {
                markerTimecode,
                sessionStart,
                error: error.message
            });
            return markerTimecode; // Return original on error
        }
    }
    
    /**
     * Determine marker color based on comment type
     */
    determineMarkerColor(marker) {
        if (marker.isReply) {
            return this.markerColors.reply;
        }
        
        if (marker.type) {
            return this.markerColors[marker.type] || this.markerColors.main;
        }
        
        // Analyze comment text for keywords
        const text = (marker.text || marker.comment || '').toLowerCase();
        
        if (text.includes('error') || text.includes('problem') || text.includes('issue')) {
            return this.markerColors.error;
        }
        
        if (text.includes('warning') || text.includes('caution') || text.includes('careful')) {
            return this.markerColors.warning;
        }
        
        if (text.includes('note') || text.includes('reminder') || text.includes('remember')) {
            return this.markerColors.note;
        }
        
        return this.markerColors.main;
    }
    
    /**
     * Sanitize marker name for Pro Tools compatibility
     */
    sanitizeMarkerName(name) {
        // Remove or replace characters that might cause issues in Pro Tools
        return name
            .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid filename characters
            .replace(/\s+/g, ' ')          // Normalize whitespace
            .trim()                        // Remove leading/trailing spaces
            .substring(0, 64);             // Limit length to 64 characters
    }
    
    /**
     * Generate marker name from Frame.io comment data
     * @param {Object} marker - Frame.io comment object with author, text, timecode
     * @returns {string} Generated marker name
     */
    generateMarkerName(marker) {
        // Priority 1: Use author name if available
        if (marker.author && marker.author.trim()) {
            const authorName = marker.author.trim();
            
            // Clean up author name (remove reply indicators, timestamps, etc.)
            const cleanAuthor = authorName
                .replace(/\s*\(Reply\)\s*/gi, '')  // Remove "(Reply)" indicators
                .replace(/\s*-\s*\d{1,2}:\d{2}[AP]M.*$/i, '')  // Remove timestamps
                .replace(/^\d+\s*-\s*/, '')  // Remove leading numbers like "001 - "
                .trim();
            
            if (cleanAuthor) {
                return this.sanitizeMarkerName(cleanAuthor);
            }
        }
        
        // Priority 2: Use truncated comment text if no author
        if (marker.text && marker.text.trim()) {
            const truncatedText = marker.text.trim()
                .replace(/\s+/g, ' ')  // Normalize whitespace
                .substring(0, 30);    // Limit to 30 characters
            
            return this.sanitizeMarkerName(truncatedText);
        }
        
        // Priority 3: Use timecode as fallback
        const timecode = marker.timecode || '00:00:00:00';
        return this.sanitizeMarkerName(`Marker ${timecode}`);
    }
    
    /**
     * Report progress to renderer process via IPC
     */
    reportProgress(message, percentage) {
        const progressData = {
            message: message,
            percentage: percentage,
            total: this.totalMarkers,
            processed: this.processedMarkers,
            created: this.createdMarkers,
            skipped: this.skippedMarkers,
            failed: this.failedMarkers,
            operation: this.currentOperation
        };
        
        log.debug('Pipeline progress:', progressData);
        
        if (this.ipcHandler) {
            this.ipcHandler.send('marker-creation-progress', progressData);
        }
    }
    
    /**
     * Utility: Add delay
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get pipeline statistics
     */
    getStatistics() {
        return {
            isRunning: this.isRunning,
            currentOperation: this.currentOperation,
            totalMarkers: this.totalMarkers,
            processedMarkers: this.processedMarkers,
            createdMarkers: this.createdMarkers,
            skippedMarkers: this.skippedMarkers,
            failedMarkers: this.failedMarkers,
            sessionInfo: this.sessionInfo
        };
    }

    /**
     * Convert PTSL sample rate string to numeric format
     * @private
     * @param {string|number} ptslRate - PTSL sample rate (e.g., "SR_48000")
     * @returns {number} - Numeric sample rate (e.g., 48000)
     */
    _convertToNumericSampleRate(ptslRate) {
        if (typeof ptslRate === 'number') {
            return ptslRate;
        }

        const conversions = {
            'SR_44100': 44100,
            'SR_48000': 48000,
            'SR_88200': 88200,
            'SR_96000': 96000,
            'SR_176400': 176400,
            'SR_192000': 192000
        };
        
        return conversions[ptslRate] || 48000;
    }
}

module.exports = MarkerCreationPipeline;