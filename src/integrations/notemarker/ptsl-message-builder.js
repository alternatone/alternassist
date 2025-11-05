const ptsl = require('./ptsl-proto.js').ptsl;
const log = require('electron-log');
const { PTSLTimeFormatter, TIME_FORMATS, REFERENCE_TYPES } = require('./ptsl-time-formats.js');

/**
 * PTSL Message Builder
 * Constructs proper protobuf messages for PTSL gRPC communication
 * Uses correct enum values from generated protobuf definitions
 */
class PTSLMessageBuilder {
    constructor() {
        this.requestIdCounter = 0;
        this.ptslProto = null; // Will be set by setProtoDefinitions
        this.timeFormatter = new PTSLTimeFormatter();
    }
    
    /**
     * Set protobuf definitions for creating message instances
     */
    setProtoDefinitions(ptslProto) {
        this.ptslProto = ptslProto;
    }

    /**
     * Set session parameters for time formatting
     * @param {number} sampleRate - Session sample rate (e.g., 44100, 48000)
     * @param {number} frameRate - Session frame rate (e.g., 23.976, 24, 25, 29.97, 30)
     */
    setSessionParameters(sampleRate, frameRate) {
        this.timeFormatter.setSessionParameters(sampleRate, frameRate);
        log.debug('Session parameters set for message builder:', { sampleRate, frameRate });
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        this.requestIdCounter++;
        return `nm_${Date.now()}_${this.requestIdCounter}`;
    }

    /**
     * Create base request with proper PTSL format (Request with RequestHeader and JSON body)
     * Creates actual protobuf message instances
     */
    createBaseRequest(commandId, sessionId = '') {
        if (!this.ptslProto) {
            throw new Error('Proto definitions not set. Call setProtoDefinitions() first.');
        }
        
        // Create proper protobuf message instances
        const request = new this.ptslProto.Request();
        const header = new this.ptslProto.RequestHeader();
        
        // Set header fields using snake_case (due to keepCase: true in protoLoader)
        header.task_id = this.generateRequestId();
        header.command = commandId;
        header.version = 2025;
        header.version_minor = 6;
        header.session_id = sessionId; // Empty for registration, filled after successful registration
        
        request.header = header;
        request.request_body_json = ''; // Will be filled by specific request builders
        
        return request;
    }

    /**
     * Build RegisterConnection request
     * Uses company_name='alternatone' and application_name='notemarker' in JSON format
     */
    buildRegisterConnectionRequest() {
        try {
            // Use command ID 70 (RegisterConnection/CId_RegisterConnection)
            const request = this.createBaseRequest(70);
            
            // Create JSON request body according to PTSL.proto specification
            const requestBodyJson = {
                company_name: 'alternatone',
                application_name: 'notemarker'
            };
            
            request.request_body_json = JSON.stringify(requestBodyJson);
            
            log.debug('Built RegisterConnection request:', {
                commandId: request.header.command,
                taskId: request.header.task_id,
                companyName: requestBodyJson.company_name,
                applicationName: requestBodyJson.application_name,
                isProtobufInstance: true
            });
            
            return request;
            
        } catch (error) {
            log.error('Failed to build RegisterConnection request:', error);
            throw new Error(`Failed to build RegisterConnection request: ${error.message}`);
        }
    }

    /**
     * Build CreateMemoryLocation request with proper field mapping
     * @param {string} name - Memory location name
     * @param {string} timecode - Start location (timecode)
     * @param {string} [comments] - Optional comments
     * @param {Object} [options] - Additional options
     */
    buildCreateMemoryLocationRequest(name, timecode, comments = '', options = {}) {
        try {
            const request = this.createBaseRequest(ptsl.CommandId.CId_CreateMemoryLocation);
            
            const requestBody = new ptsl.CreateMemoryLocationRequestBody();
            
            // Required fields
            requestBody.name = name;
            requestBody.start_time = timecode;
            
            log.info('🔥 PTSL DEBUG: CreateMemoryLocation with timecode', {
                name,
                timecode,
                start_time: requestBody.start_time
            });
            
            // Validate and detect time format
            const timeValidation = this.timeFormatter.validateTimeFormat(timecode);
            if (!timeValidation.isValid) {
                log.warn('Invalid time format detected:', {
                    timecode,
                    detectedFormat: timeValidation.detectedFormat,
                    error: timeValidation.error
                });
            }
            
            // Set time properties to Marker (using current enum)
            requestBody.time_properties = ptsl.TimeProperties.TProperties_Marker;
            
            // Auto-detect reference type based on time format (as per PTSL spec)
            const autoReference = this.timeFormatter.getReference(timecode);
            switch (autoReference) {
                case REFERENCE_TYPES.BAR_BEAT:
                    requestBody.reference = ptsl.MemoryLocationReference.MLReference_BarBeat;
                    break;
                case REFERENCE_TYPES.ABSOLUTE:
                default:
                    requestBody.reference = ptsl.MemoryLocationReference.MLReference_Absolute;
                    break;
            }
            
            // Set general properties (no propertiesOption field exists)
            requestBody.generalProperties = new ptsl.MemoryLocationProperties();
            
            // Optional memory location number
            // IMPORTANT: Don't set number field if not explicitly provided
            // Pro Tools protocol buffer defaults to 0, causing conflicts
            if (options.number !== undefined && options.number >= 1) {
                requestBody.number = options.number;
                log.debug('Setting explicit memory location number', { number: options.number });
            } else {
                // Explicitly delete the number field to avoid default value of 0
                // This lets Pro Tools auto-assign memory location numbers
                delete requestBody.number;
                log.debug('Deleted memory location number field - Pro Tools will auto-assign');
            }
            
            // Optional track name
            if (options.trackName) {
                requestBody.track_name = options.trackName;
            }
            
            // Optional marker location (Main ruler, Track, or Named ruler)
            if (options.location) {
                switch (options.location.toLowerCase()) {
                    case 'mainruler':
                    case 'main_ruler':
                        requestBody.location = ptsl.MarkerLocation.MarkerLocation_MainRuler;
                        break;
                    case 'track':
                        requestBody.location = ptsl.MarkerLocation.MarkerLocation_Track;
                        break;
                    case 'namedruler':
                    case 'named_ruler':
                        requestBody.location = ptsl.MarkerLocation.MarkerLocation_NamedRuler;
                        break;
                    default:
                        log.warn('Unknown marker location, using MainRuler:', options.location);
                        requestBody.location = ptsl.MarkerLocation.MarkerLocation_MainRuler;
                }
            } else {
                // Default based on whether track_name is specified
                if (options.trackName) {
                    // Use NamedRuler when track name is specified so Pro Tools respects track_name
                    requestBody.location = ptsl.MarkerLocation.MarkerLocation_NamedRuler;
                } else {
                    // Default to MainRuler if no track specified
                    requestBody.location = ptsl.MarkerLocation.MarkerLocation_MainRuler;
                }
            }
            
            // Set color index directly on the request body (not on generalProperties)
            if (options.colorIndex !== undefined && options.colorIndex >= 0) {
                requestBody.color_index = options.colorIndex;
            }
            
            // Optional comments
            if (comments) {
                requestBody.comments = comments;
            }
            
            // Optional end time for selections
            if (options.endTime) {
                // Validate end time format
                const endTimeValidation = this.timeFormatter.validateTimeFormat(options.endTime);
                if (!endTimeValidation.isValid) {
                    log.warn('Invalid end time format detected:', {
                        endTime: options.endTime,
                        detectedFormat: endTimeValidation.detectedFormat,
                        error: endTimeValidation.error
                    });
                }
                
                requestBody.end_time = options.endTime;
                // Change to selection if end time is specified
                requestBody.time_properties = ptsl.TimeProperties.TProperties_Selection;
            }
            
            // Optional reference override
            if (options.reference) {
                switch (options.reference.toLowerCase()) {
                    case 'barbeat':
                    case 'bar_beat':
                        requestBody.reference = ptsl.MemoryLocationReference.MLReference_BarBeat;
                        break;
                    case 'absolute':
                        requestBody.reference = ptsl.MemoryLocationReference.MLReference_Absolute;
                        break;
                    case 'followtracktime':
                    case 'follow_track_time':
                        requestBody.reference = ptsl.MemoryLocationReference.MLReference_FollowTrackTimebase;
                        break;
                    default:
                        log.warn('Unknown reference type, using Absolute:', options.reference);
                        requestBody.reference = ptsl.MemoryLocationReference.MLReference_Absolute;
                }
            }
            
            // Optional time properties override
            if (options.timeProperties) {
                switch (options.timeProperties.toLowerCase()) {
                    case 'marker':
                        requestBody.time_properties = ptsl.TimeProperties.TProperties_Marker;
                        break;
                    case 'selection':
                        requestBody.time_properties = ptsl.TimeProperties.TProperties_Selection;
                        break;
                    default:
                        log.warn('Unknown time properties type, using Marker:', options.timeProperties);
                        requestBody.time_properties = ptsl.TimeProperties.TProperties_Marker;
                }
            }
            
            // Convert protobuf object to JSON for PTSL protocol compliance
            // Since we're now using correct snake_case field names, we can directly use them
            const requestBodyJson = {
                name: requestBody.name,
                start_time: requestBody.start_time,
                time_properties: requestBody.time_properties,
                reference: requestBody.reference,
                general_properties: requestBody.general_properties || {},
                comments: requestBody.comments || '',
                color_index: requestBody.color_index || 0,
                location: requestBody.location
            };
            
            // Add optional fields if they exist
            // Only include number if explicitly set (not 0 default) and not deleted
            if (options.number !== undefined && options.number >= 1) {
                requestBodyJson.number = options.number;
            }
            
            if (requestBody.track_name) {
                requestBodyJson.track_name = requestBody.track_name;
            }
            
            if (requestBody.end_time) {
                requestBodyJson.end_time = requestBody.end_time;
            }
            
            // Serialize to JSON for PTSL transmission
            request.request_body_json = JSON.stringify(requestBodyJson);
            
            log.debug('Built CreateMemoryLocation request:', {
                commandId: request.header.command,
                taskId: request.header.task_id,
                name: requestBodyJson.name,
                startTime: requestBodyJson.start_time,
                startTimeFormat: this.timeFormatter.detectTimeFormat(requestBodyJson.start_time),
                endTime: requestBodyJson.end_time,
                endTimeFormat: requestBodyJson.end_time ? this.timeFormatter.detectTimeFormat(requestBodyJson.end_time) : null,
                number: requestBodyJson.number,
                trackName: requestBodyJson.track_name,
                timeProperties: requestBodyJson.time_properties,
                reference: requestBodyJson.reference,
                colorIndex: requestBodyJson.color_index,
                hasComments: !!requestBodyJson.comments,
                hasEndTime: !!requestBodyJson.end_time,
                requestBodySerialized: true
            });
            
            return request;
            
        } catch (error) {
            log.error('Failed to build CreateMemoryLocation request:', error);
            throw new Error(`Failed to build CreateMemoryLocation request: ${error.message}`);
        }
    }

    /**
     * Build GetSessionName request
     */
    buildGetSessionNameRequest() {
        try {
            const request = this.createBaseRequest(ptsl.CommandId.CId_GetSessionName);
            
            // GetSessionName doesn't require a request body
            log.debug('Built GetSessionName request:', {
                commandId: request.commandId,
                requestId: request.requestId
            });
            
            return request;
            
        } catch (error) {
            log.error('Failed to build GetSessionName request:', error);
            throw new Error(`Failed to build GetSessionName request: ${error.message}`);
        }
    }

    /**
     * Build GetSessionSampleRate request
     */
    buildGetSessionSampleRateRequest() {
        try {
            const request = this.createBaseRequest(ptsl.CommandId.CId_GetSessionSampleRate);
            
            log.debug('Built GetSessionSampleRate request:', {
                commandId: request.commandId,
                requestId: request.requestId
            });
            
            return request;
            
        } catch (error) {
            log.error('Failed to build GetSessionSampleRate request:', error);
            throw new Error(`Failed to build GetSessionSampleRate request: ${error.message}`);
        }
    }

    /**
     * Build GetSessionTimeCodeRate request
     */
    buildGetSessionTimeCodeRateRequest() {
        try {
            const request = this.createBaseRequest(ptsl.CommandId.CId_GetSessionTimeCodeRate);
            
            log.debug('Built GetSessionTimeCodeRate request:', {
                commandId: request.commandId,
                requestId: request.requestId
            });
            
            return request;
            
        } catch (error) {
            log.error('Failed to build GetSessionTimeCodeRate request:', error);
            throw new Error(`Failed to build GetSessionTimeCodeRate request: ${error.message}`);
        }
    }

    /**
     * Build GetMemoryLocations request
     * @param {Object} [options] - Optional filtering parameters
     */
    buildGetMemoryLocationsRequest(options = {}) {
        try {
            const request = this.createBaseRequest(ptsl.CommandId.CId_GetMemoryLocations);
            
            const requestBody = new ptsl.GetMemoryLocationsRequestBody();
            
            // Optional location properties to filter by
            if (options.locationProperties) {
                requestBody.locationProperties = options.locationProperties;
            }
            
            // Optional match criteria
            if (options.matchCriteria) {
                requestBody.matchCriteria = options.matchCriteria;
            }
            
            // Serialize to JSON as required by PTSL protocol
            request.request_body_json = JSON.stringify(requestBody);
            
            log.debug('Built GetMemoryLocations request:', {
                commandId: request.commandId,
                requestId: request.requestId,
                hasLocationProperties: !!options.locationProperties,
                hasMatchCriteria: !!options.matchCriteria
            });
            
            return request;
            
        } catch (error) {
            log.error('Failed to build GetMemoryLocations request:', error);
            throw new Error(`Failed to build GetMemoryLocations request: ${error.message}`);
        }
    }

    /**
     * Build GetTrackList request - REBUILT FROM GetSessionName pattern
     */
    buildGetTrackListRequest() {
        try {
            const request = this.createBaseRequest(ptsl.CommandId.CId_GetTrackList);
            
            // GetTrackList doesn't require a request body (same as GetSessionName)
            log.debug('Built GetTrackList request:', {
                commandId: request.commandId,
                requestId: request.requestId
            });
            
            return request;
            
        } catch (error) {
            log.error('Failed to build GetTrackList request:', error);
            throw new Error(`Failed to build GetTrackList request: ${error.message}`);
        }
    }

    /**
     * Build CreateNewTracks request
     * @param {Object} options - Track creation options
     * @param {number} [options.numberOfTracks=1] - Number of tracks to create
     * @param {string} [options.trackName] - Name for the track(s)
     * @param {string} [options.trackType='Audio'] - Track type (Audio, Midi, Aux, etc.)
     * @param {string} [options.trackFormat='Mono'] - Track format (Mono, Stereo, LCR)
     */
    buildCreateNewTracksRequest(options = {}) {
        try {
            const request = this.createBaseRequest(ptsl.CommandId.CId_CreateNewTracks);
            
            const requestBody = new ptsl.CreateNewTracksRequestBody();
            
            // Set number of tracks (default to 1)
            requestBody.numberOfTracks = options.numberOfTracks || 1;
            
            // Set track name
            if (options.trackName) {
                requestBody.trackName = options.trackName;
            }
            
            // Set track type
            switch (options.trackType?.toLowerCase()) {
                case 'audio':
                case 'audiotrack':
                    requestBody.trackType = ptsl.TrackType.AudioTrack;
                    break;
                case 'midi':
                    requestBody.trackType = ptsl.TrackType.Midi;
                    break;
                case 'aux':
                case 'auxinput':
                    requestBody.trackType = ptsl.TrackType.Aux;
                    break;
                case 'instrument':
                    requestBody.trackType = ptsl.TrackType.Instrument;
                    break;
                case 'vca':
                    requestBody.trackType = ptsl.TrackType.Vca;
                    break;
                default:
                    requestBody.trackType = ptsl.TrackType.AudioTrack; // Default to audio
            }
            
            // Set track format
            switch (options.trackFormat?.toLowerCase()) {
                case 'mono':
                    requestBody.trackFormat = ptsl.TrackFormat.TFormat_Mono;
                    break;
                case 'stereo':
                    requestBody.trackFormat = ptsl.TrackFormat.TFormat_Stereo;
                    break;
                case 'lcr':
                    requestBody.trackFormat = ptsl.TrackFormat.TFormat_LCR;
                    break;
                default:
                    requestBody.trackFormat = ptsl.TrackFormat.TFormat_Mono; // Default to mono
            }
            
            // Convert to JSON for PTSL transmission
            const requestBodyJson = {
                numberOfTracks: requestBody.numberOfTracks,
                trackType: requestBody.trackType,
                trackFormat: requestBody.trackFormat
            };
            
            // Add optional track name if provided
            if (requestBody.trackName) {
                requestBodyJson.trackName = requestBody.trackName;
            }
            
            request.request_body_json = JSON.stringify(requestBodyJson);
            
            log.debug('Built CreateNewTracks request:', {
                commandId: request.header.command,
                taskId: request.header.task_id,
                numberOfTracks: requestBodyJson.numberOfTracks,
                trackName: requestBodyJson.trackName,
                trackType: requestBodyJson.trackType,
                trackFormat: requestBodyJson.trackFormat
            });
            
            return request;
            
        } catch (error) {
            log.error('Failed to build CreateNewTracks request:', error);
            throw new Error(`Failed to build CreateNewTracks request: ${error.message}`);
        }
    }

    /**
     * Build HostReadyCheck request (for connection validation)
     */
    buildHostReadyCheckRequest() {
        try {
            const request = this.createBaseRequest(ptsl.CommandId.CId_HostReadyCheck);
            
            log.debug('Built HostReadyCheck request:', {
                commandId: request.commandId,
                requestId: request.requestId
            });
            
            return request;
            
        } catch (error) {
            log.error('Failed to build HostReadyCheck request:', error);
            throw new Error(`Failed to build HostReadyCheck request: ${error.message}`);
        }
    }

    /**
     * Set session ID on request header (called after successful registration)
     */
    setSessionId(request, sessionId) {
        if (sessionId && request && request.header) {
            request.header.session_id = sessionId;
            log.debug('Set session ID on request:', {
                taskId: request.header.task_id,
                sessionId: sessionId
            });
        }
        return request;
    }

    /**
     * Emergency header reconstruction - defensive programming
     * @param {number} commandId - PTSL command ID
     * @param {string} sessionId - Current session ID
     * @param {string} [taskId] - Optional task ID, generates new one if not provided
     * @returns {Object} Emergency header object
     */
    createEmergencyHeader(commandId, sessionId, taskId = null) {
        if (!this.ptslProto) {
            throw new Error('Proto definitions not set. Cannot create emergency header.');
        }

        log.warn('🚨 Creating emergency header for commandId:', commandId);

        const emergencyHeader = new this.ptslProto.RequestHeader();
        emergencyHeader.task_id = taskId || this.generateRequestId();
        emergencyHeader.command = commandId;
        emergencyHeader.version = 2025;
        emergencyHeader.version_minor = 6;
        emergencyHeader.session_id = sessionId || '';

        log.debug('Emergency header created:', {
            taskId: emergencyHeader.task_id,
            command: emergencyHeader.command,
            sessionId: emergencyHeader.session_id
        });

        return emergencyHeader;
    }

    /**
     * Get available enum values for debugging/validation
     */
    getEnumValues() {
        return {
            CommandId: ptsl.CommandId,
            TimeProperties: ptsl.TimeProperties,
            MemoryLocationReference: ptsl.MemoryLocationReference,
            MemoryLocationPropertiesOption: ptsl.MemoryLocationPropertiesOption
        };
    }

    /**
     * Validate protobuf message before sending
     */
    validateMessage(message) {
        try {
            if (!message.header) {
                throw new Error('Missing request header');
            }
            
            if (!message.header.command) {
                throw new Error('Missing command ID in header');
            }
            
            if (!message.header.task_id) {
                throw new Error('Missing task ID in header');
            }
            
            // Validate command-specific requirements
            switch (message.header.command) {
                case 70: // RegisterConnection / CId_RegisterConnection
                    if (!message.request_body_json) {
                        throw new Error('Missing RegisterConnection request body JSON');
                    }
                    try {
                        const body = JSON.parse(message.request_body_json);
                        if (!body.company_name) {
                            throw new Error('Missing company_name in request body');
                        }
                        if (!body.application_name) {
                            throw new Error('Missing application_name in request body');
                        }
                    } catch (parseError) {
                        throw new Error('Invalid JSON in request body: ' + parseError.message);
                    }
                    break;
                    
                case 71: // CreateMemoryLocation / CId_CreateMemoryLocation
                    if (!message.request_body_json) {
                        throw new Error('Missing CreateMemoryLocation request body JSON');
                    }
                    // Additional validation can be added for CreateMemoryLocation
                    break;
                    
                case 72: // CreateNewTracks / CId_CreateNewTracks
                    if (!message.request_body_json) {
                        throw new Error('Missing CreateNewTracks request body JSON');
                    }
                    try {
                        const body = JSON.parse(message.request_body_json);
                        if (!body.numberOfTracks || body.numberOfTracks < 1) {
                            throw new Error('Invalid numberOfTracks in request body');
                        }
                        if (body.trackType === undefined) {
                            throw new Error('Missing trackType in request body');
                        }
                        if (body.trackFormat === undefined) {
                            throw new Error('Missing trackFormat in request body');
                        }
                    } catch (parseError) {
                        throw new Error('Invalid JSON in request body: ' + parseError.message);
                    }
                    break;
            }
            
            log.debug('Message validation passed:', {
                commandId: message.header.command,
                taskId: message.header.task_id
            });
            
            return true;
            
        } catch (error) {
            log.error('Message validation failed:', error);
            throw error;
        }
    }

}

module.exports = PTSLMessageBuilder;