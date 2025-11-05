// Simple console logger for parser
const log = {
    info: (msg, data) => console.log('[Parser]', msg, data || ''),
    warn: (msg, data) => console.warn('[Parser]', msg, data || ''),
    error: (msg, data) => console.error('[Parser]', msg, data || ''),
    debug: (msg, data) => {} // Silent in production
};

function parseFrameioTXT(text, options = {}) {
    const { diagnosticMode = false } = options;
    
    // Enhanced validation for corrupted and edge case files
    if (!text || typeof text !== 'string') {
        log.warn('Empty or invalid file content provided');
        return [];
    }
    
    // Handle completely empty files
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
        log.info('Empty file detected - no content to parse');
        return [];
    }
    
    // Check for common corruption patterns
    if (text.includes('\0') || text.includes('\uFFFD')) {
        log.warn('Binary or corrupted file detected - attempting to parse anyway');
        // Clean out null bytes and replacement characters
        text = text.replace(/[\0\uFFFD]/g, '');
    }
    
    // Check for extremely small files that are unlikely to be valid Frame.io exports
    if (trimmedText.length < 20) {
        log.warn('File appears too small to be a valid Frame.io export');
        return [];
    }
    
    // Basic validation: check if file looks like Frame.io format
    const hasTimecodePattern = /\d{1,2}:\d{1,2}:\d{1,2}[:;]\d{1,2}/.test(text);
    const hasAuthorPattern = /\d+\s*-\s*[^-\n\r]+\s*-/.test(text);
    
    if (!hasTimecodePattern && !hasAuthorPattern) {
        log.warn('File does not appear to be a Frame.io export format - no timecodes or author patterns found');
        return [];
    }
    
    // Check file size and warn about very large files
    const fileSizeKB = text.length / 1024;
    if (fileSizeKB > 500) { // > 500KB
        log.warn(`Large Frame.io file detected: ${fileSizeKB.toFixed(1)}KB - parsing may take longer`);
    }
    
    if (diagnosticMode) {
        log.info('🔬 Diagnostic mode enabled - generating detailed parsing analysis');
    }
    
    return parseFrameioWithStateMachine(text, diagnosticMode);
}

// State Machine Parser Implementation
function parseFrameioWithStateMachine(text, diagnosticMode = false) {
    // State Machine States
    const STATES = {
        SCANNING: 'SCANNING',
        IN_COMMENT: 'IN_COMMENT', 
        IN_REPLY: 'IN_REPLY'
    };
    
    // Pre-compiled regex patterns for performance
    const PATTERNS = {
        // Header author line: "001 - Author Name - 06:56PM April 06, 2025"
        AUTHOR_HEADER: /^\d+\s*-\s*([^-]+?)\s*-\s*(.+)$/,
        
        // Comment start with timecode: flexible format with validation
        COMMENT_START: /^(\d{1,2}:\d{2}:\d{2}[:;]\d{2})\s*-\s*(.+)$/,
        
        // Bracketed timecode format: single or range - extract all possibilities
        BRACKETED_TIMECODE_RANGE: /\[(\d{1,2}:\d{2}:\d{2}[:;]\d{2})\s*-\s*(\d{1,2}:\d{2}:\d{2}[:;]\d{2})\]/g,
        BRACKETED_TIMECODE_SINGLE: /\[(\d{1,2}:\d{2}:\d{2}[:;]\d{2})\]/g,
        
        // Enhanced timecode patterns for comprehensive extraction
        TIMECODE_FULL: /(\d{1,2}:\d{2}:\d{2}[:;]\d{2})/g,
        TIMECODE_ANYWHERE: /(?:^|[^\d])(\d{1,2}:\d{2}:\d{2}[:;]\d{2})(?:[^\d]|$)/g,
        
        // Partial timecode at line start (for legacy compatibility)
        PARTIAL_TIMECODE: /^(\d{1,2}:\d{1,2}(?::\d{2})?(?:[:;]\d{2})?)/,
        
        // Reply indentation detection (tab or 2+ spaces)
        REPLY_INDENT: /^(\t|  +)(.+)$/,
        
        // Reply author line: "Author Name - timestamp" (indented) - more strict pattern
        REPLY_AUTHOR: /^([^-]+?)\s*-\s*(\d{1,2}:\d{2}[AP]M\s+.+)$/,
        
        // Legacy general timecode pattern (kept for backward compatibility)
        TIMECODE_PATTERN: /(\d{1,2}:\d{2}:\d{2}[:;]\d{2})/g
    };
    
    const lines = text.split('\n');
    const comments = [];
    
    // State machine variables
    let state = STATES.SCANNING;
    let currentAuthor = 'Unknown';
    let currentTimecode = null;
    let currentComment = null;
    let commentBuffer = [];
    
    // Enhanced reply context tracking
    let replyContext = {
        inReplySequence: false,
        currentReplyAuthor: null,
        replyTextBuffer: [],
        lastReplyAuthorLine: -1,
        baselineIndentLevel: 0
    };
    
    // Multi-line comment tracking
    let commentContext = {
        inMultiLineComment: false,
        lastLineWasComment: false,
        lastLineWasContinuation: false
    };
    
    // Simplified diagnostic context
    let diagnosticContext = {
        enabled: diagnosticMode,
        statistics: { 
            totalLines: 0, 
            commentLines: 0, 
            replyLines: 0,
            timecodeFormats: {
                standard: 0,
                bracketedRange: 0,
                bracketedSingle: 0,
                anywhere: 0,
                invalid: 0
            }
        }
    };
    
    const MAX_COMMENTS = 2000;
    
    function diagnosticLog(lineIndex, rawLine, classification, details = {}) {
        if (!diagnosticContext.enabled) return;
        
        const line = rawLine.trim();
        const indentLevel = getIndentLevel(rawLine);
        const isIndented = isIndentedLine(rawLine);
        
        const entry = {
            lineNumber: lineIndex + 1,
            rawLine: rawLine,
            trimmedLine: line,
            classification: classification,
            indentLevel: indentLevel,
            isIndented: isIndented,
            currentState: state,
            details: details,
            timestamp: Date.now()
        };
        
        diagnosticContext.lineClassifications.push(entry);
        diagnosticContext.statistics.totalLines++;
        
        // Update statistics based on classification
        switch (classification) {
            case 'empty':
                diagnosticContext.statistics.emptyLines++;
                break;
            case 'comment_start':
            case 'comment_extracted':
                diagnosticContext.statistics.commentLines++;
                break;
            case 'reply_author':
            case 'reply_text':
                diagnosticContext.statistics.replyLines++;
                break;
            case 'author_header':
                diagnosticContext.statistics.authorHeaderLines++;
                break;
            case 'continuation':
                diagnosticContext.statistics.continuationLines++;
                break;
            case 'skipped':
                diagnosticContext.statistics.skippedLines++;
                break;
        }
        
        log.debug(`[DIAGNOSTIC] Line ${lineIndex + 1} [${classification.toUpperCase()}] [${state}] [Indent:${indentLevel}] "${line.substring(0, 50)}${line.length > 50 ? '...' : ''}"`);
    }
    
    function diagnosticStateTransition(fromState, toState, reason, lineIndex) {
        if (!diagnosticContext.enabled) return;
        
        const transition = {
            fromState: fromState,
            toState: toState,
            reason: reason,
            lineNumber: lineIndex + 1,
            timestamp: Date.now()
        };
        
        diagnosticContext.stateTransitions.push(transition);
        diagnosticContext.statistics.stateTransitions++;
        
        log.debug(`[DIAGNOSTIC] STATE TRANSITION: ${fromState} → ${toState} (${reason}) at line ${lineIndex + 1}`);
    }
    
    function diagnosticAnomaly(type, description, lineIndex, data = {}) {
        if (!diagnosticContext.enabled) return;
        
        const anomaly = {
            type: type,
            description: description,
            lineNumber: lineIndex + 1,
            data: data,
            timestamp: Date.now()
        };
        
        diagnosticContext.anomalies.push(anomaly);
        
        log.warn(`[DIAGNOSTIC] ANOMALY [${type}]: ${description} at line ${lineIndex + 1}`, data);
    }
    
    function diagnosticAuthorAnalysis(originalAuthor, normalizedAuthor, context = '') {
        if (!diagnosticContext.enabled) return;
        
        if (!diagnosticContext.authors.has(originalAuthor)) {
            diagnosticContext.authors.set(originalAuthor, {
                normalized: normalizedAuthor,
                occurrences: 0,
                contexts: []
            });
        }
        
        const authorData = diagnosticContext.authors.get(originalAuthor);
        authorData.occurrences++;
        if (context) authorData.contexts.push(context);
        
        if (authorData.normalized !== normalizedAuthor) {
            diagnosticAnomaly('author_normalization_inconsistency', 
                `Author "${originalAuthor}" mapped to different normalized forms`, 
                processedLines, 
                { original: originalAuthor, existing: authorData.normalized, new: normalizedAuthor }
            );
        }
        
        log.debug(`[DIAGNOSTIC] AUTHOR: "${originalAuthor}" → "${normalizedAuthor}" (${context})`);
    }
    
    function extractTimecodeFromLine(line, context = 'comment') {
        const timecodes = [];
        
        // Priority 1: Bracketed range format [TC1 - TC2] - use first timecode
        let match;
        PATTERNS.BRACKETED_TIMECODE_RANGE.lastIndex = 0; // Reset regex
        while ((match = PATTERNS.BRACKETED_TIMECODE_RANGE.exec(line)) !== null) {
            const validation = validateAndNormalizeTimecode(match[1]);
            if (validation.isValid) {
                timecodes.push({
                    timecode: validation.timecode,
                    source: 'bracketed_range',
                    raw: match[1],
                    priority: 1
                });
                log.debug(`Robust timecode extraction: Found bracketed range ${match[1]} -> ${validation.timecode}`);
            } else {
                log.warn(`Robust timecode extraction: Invalid bracketed range timecode "${match[1]}": ${validation.error}`);
            }
        }
        
        // Priority 2: Bracketed single format [TC]
        PATTERNS.BRACKETED_TIMECODE_SINGLE.lastIndex = 0; // Reset regex
        while ((match = PATTERNS.BRACKETED_TIMECODE_SINGLE.exec(line)) !== null) {
            const validation = validateAndNormalizeTimecode(match[1]);
            if (validation.isValid) {
                timecodes.push({
                    timecode: validation.timecode,
                    source: 'bracketed_single',
                    raw: match[1],
                    priority: 2
                });
                log.debug(`Robust timecode extraction: Found bracketed single ${match[1]} -> ${validation.timecode}`);
            } else {
                log.warn(`Robust timecode extraction: Invalid bracketed single timecode "${match[1]}": ${validation.error}`);
            }
        }
        
        // Priority 3: Standard format at line start (for comment detection)
        if (context === 'comment') {
            const startMatch = line.match(PATTERNS.COMMENT_START);
            if (startMatch) {
                const validation = validateAndNormalizeTimecode(startMatch[1]);
                if (validation.isValid) {
                    timecodes.push({
                        timecode: validation.timecode,
                        source: 'line_start',
                        raw: startMatch[1],
                        priority: 3
                    });
                    log.debug(`Robust timecode extraction: Found line start ${startMatch[1]} -> ${validation.timecode}`);
                } else {
                    log.warn(`Robust timecode extraction: Invalid line start timecode "${startMatch[1]}": ${validation.error}`);
                }
            }
        }
        
        // Priority 4: Any timecode found anywhere in line
        PATTERNS.TIMECODE_ANYWHERE.lastIndex = 0; // Reset regex
        while ((match = PATTERNS.TIMECODE_ANYWHERE.exec(line)) !== null) {
            const validation = validateAndNormalizeTimecode(match[1]);
            if (validation.isValid) {
                // Check if we already found this exact timecode
                const alreadyFound = timecodes.some(tc => tc.timecode === validation.timecode);
                if (!alreadyFound) {
                    timecodes.push({
                        timecode: validation.timecode,
                        source: 'anywhere',
                        raw: match[1],
                        priority: 4
                    });
                    log.debug(`Robust timecode extraction: Found anywhere ${match[1]} -> ${validation.timecode}`);
                }
            } else {
                log.debug(`Robust timecode extraction: Invalid anywhere timecode "${match[1]}": ${validation.error}`);
            }
        }
        
        // Return the highest priority valid timecode
        if (timecodes.length > 0) {
            timecodes.sort((a, b) => a.priority - b.priority);
            const selected = timecodes[0];
            log.debug(`Robust timecode extraction: Selected "${selected.timecode}" from ${selected.source} (${timecodes.length} candidates)`);
            return selected.timecode;
        }
        
        log.debug(`Robust timecode extraction: No valid timecode found in "${line.substring(0, 50)}..."`);
        return null;
    }
    
    function isIndentedLine(line) {
        return PATTERNS.REPLY_INDENT.test(line);
    }
    
    function getIndentedContent(line) {
        const match = line.match(PATTERNS.REPLY_INDENT);
        return match ? match[2] : line.trim();
    }
    
    function getIndentLevel(line) {
        const match = line.match(/^(\t|[ ]*)/);
        if (!match) return 0;
        const indent = match[1];
        // Convert tabs to equivalent spaces (tab = 4 spaces)
        return indent.replace(/\t/g, '    ').length;
    }
    
    function isReplyAuthorLine(content) {
        // Check if line matches "Author Name - timestamp" pattern and doesn't contain timecode
        return PATTERNS.REPLY_AUTHOR.test(content) && !PATTERNS.TIMECODE_PATTERN.test(content);
    }
    
    function isReplyTextLine(content, prevLineWasReplyAuthor) {
        // Reply text is indented content that:
        // 1. Follows a reply author line
        // 2. Doesn't contain timecodes
        // 3. Doesn't match the reply author pattern
        return prevLineWasReplyAuthor && 
               content.trim().length > 0 &&
               !PATTERNS.TIMECODE_PATTERN.test(content) &&
               !PATTERNS.REPLY_AUTHOR.test(content);
    }
    
    function finalizeCurrentReply() {
        if (replyContext.inReplySequence && 
            replyContext.currentReplyAuthor && 
            replyContext.replyTextBuffer.length > 0) {
            
            // Combine all buffered text into a single reply
            const replyText = replyContext.replyTextBuffer.join(' ').trim();
            
            if (replyText && currentTimecode) {
                const replyComment = {
                    timecode: currentTimecode,
                    text: replyText,
                    author: replyContext.currentReplyAuthor,
                    isReply: true
                };
                
                comments.push(replyComment);
                log.debug(`Enhanced reply detection: Added multi-line reply from ${replyContext.currentReplyAuthor}: "${replyText.substring(0, 50)}..."`);
            }
        }
        
        // Reset reply context
        replyContext.inReplySequence = false;
        replyContext.currentReplyAuthor = null;
        replyContext.replyTextBuffer = [];
        replyContext.lastReplyAuthorLine = -1;
    }
    
    function startNewReply(authorName, lineIndex) {
        // Finalize any existing reply first
        finalizeCurrentReply();
        
        replyContext.inReplySequence = true;
        replyContext.currentReplyAuthor = authorName;
        replyContext.replyTextBuffer = [];
        replyContext.lastReplyAuthorLine = lineIndex;
        
        log.debug(`Enhanced reply detection: Started reply context for ${authorName} at line ${lineIndex}`);
    }
    
    function addToReplyBuffer(text) {
        if (replyContext.inReplySequence && text.trim()) {
            replyContext.replyTextBuffer.push(text.trim());
            log.debug(`Enhanced reply detection: Added to reply buffer: "${text.trim()}"`);
        }
    }
    
    function isCommentContinuation(line, prevLineWasComment) {
        // A line is a comment continuation if:
        // 1. Previous line was a comment or continuation
        // 2. Current line is not indented
        // 3. Current line doesn't contain a timecode
        // 4. Current line doesn't match author header pattern
        // 5. Current line has actual content (not empty)
        
        if (!prevLineWasComment) return false;
        
        const trimmedLine = line.trim();
        if (!trimmedLine) return false;
        
        // Not a continuation if it's indented (likely a reply)
        if (isIndentedLine(line)) return false;
        
        // Not a continuation if it contains a timecode
        if (PATTERNS.TIMECODE_PATTERN.test(trimmedLine)) return false;
        
        // Not a continuation if it's an author header
        if (PATTERNS.AUTHOR_HEADER.test(trimmedLine)) return false;
        
        // Not a continuation if it starts a new comment
        if (PATTERNS.COMMENT_START.test(trimmedLine)) return false;
        
        return true;
    }
    
    function addToCommentBuffer(text) {
        if (text.trim()) {
            commentBuffer.push(text.trim());
            log.debug(`Multi-line comment: Added continuation: "${text.trim()}"`);
        }
    }
    
    function createCommentSafely(rawTimecode, text, author, isReply = false, context = 'comment') {
        // Validate timecode first
        const validation = validateAndNormalizeTimecode(rawTimecode);
        
        if (!validation.isValid) {
            log.error(`Skipping comment due to invalid timecode: ${validation.error}`, {
                rawTimecode,
                text: text?.substring(0, 50) + '...',
                author,
                context
            });
            return null;
        }
        
        // Create valid comment
        const comment = {
            timecode: validation.timecode,
            text: text.trim(),
            author: author.trim(),
            isReply: isReply
        };
        
        log.debug(`Created ${isReply ? 'reply' : 'comment'} at ${validation.timecode}: "${text.substring(0, 30)}..." by ${author}`);
        return comment;
    }
    
    function finalizeCurrentComment() {
        if (currentComment && currentComment.text.trim()) {
            // Add any buffered multi-line content
            if (commentBuffer.length > 0) {
                currentComment.text += ' ' + commentBuffer.join(' ');
                commentBuffer = [];
            }
            
            // Validate before adding
            if (currentComment.timecode !== '00:00:00:00' && currentComment.text.length > 1) {
                comments.push({ ...currentComment });
                
                // Memory protection
                if (comments.length >= MAX_COMMENTS) {
                    log.warn(`Maximum comment limit (${MAX_COMMENTS}) reached - stopping parsing`);
                    return true; // Signal to stop
                }
            }
        }
        currentComment = null;
        return false;
    }
    
    // Track processed lines for diagnostics
    const processedLines = lines.length;
    
    // Main state machine loop
    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        
        // Skip empty lines
        if (!line) {
            diagnosticLog(i, rawLine, 'empty', { inCommentWithBuffer: state === STATES.IN_COMMENT && commentBuffer.length > 0 });
            if (state === STATES.IN_COMMENT && commentBuffer.length > 0) {
                // Empty line might end multi-line comment
                continue;
            }
            continue;
        }
        
        switch (state) {
            case STATES.SCANNING:
                // Check for author header
                const authorMatch = line.match(PATTERNS.AUTHOR_HEADER);
                if (authorMatch) {
                    currentAuthor = authorMatch[1].trim();
                    diagnosticLog(i, rawLine, 'author_header', { author: currentAuthor, pattern: authorMatch[0] });
                    diagnosticAuthorAnalysis(currentAuthor, normalizeAuthorName(currentAuthor), 'header');
                    log.debug(`Found author: ${currentAuthor}`);
                    continue;
                }
                
                // Check for comment start
                const commentMatch = line.match(PATTERNS.COMMENT_START);
                if (commentMatch) {
                    const rawTimecode = commentMatch[1];
                    const text = commentMatch[2].trim();
                    
                    diagnosticLog(i, rawLine, 'comment_start', { rawTimecode, text: text.substring(0, 50), author: currentAuthor });
                    
                    // Validate and create comment safely
                    const comment = createCommentSafely(rawTimecode, text, currentAuthor, false, 'line_start');
                    if (!comment) {
                        // Invalid timecode, skip this line
                        diagnosticLog(i, rawLine, 'skipped', { reason: 'invalid_timecode', rawTimecode });
                        diagnosticContext.statistics.timecodeFormats.invalid++;
                        continue;
                    }
                    
                    currentTimecode = comment.timecode;
                    currentComment = comment;
                    diagnosticContext.statistics.timecodeFormats.standard++;
                    
                    // Set comment context flags
                    commentContext.lastLineWasComment = true;
                    commentContext.lastLineWasContinuation = false;
                    commentContext.inMultiLineComment = false;
                    
                    const oldState = state;
                    state = STATES.IN_COMMENT;
                    diagnosticStateTransition(oldState, state, 'comment_start_detected', i);
                    continue;
                }
                
                // Check for bracketed timecode or other formats anywhere in line
                const extractedTimecode = extractTimecodeFromLine(line, 'scanning');
                if (extractedTimecode) {
                    // Extract text after removing timecode patterns
                    let textAfterTimecode = line;
                    
                    // Determine timecode format for statistics
                    let timecodeFormat = 'anywhere';
                    if (PATTERNS.BRACKETED_TIMECODE_RANGE.test(line)) {
                        timecodeFormat = 'bracketedRange';
                        diagnosticContext.statistics.timecodeFormats.bracketedRange++;
                    } else if (PATTERNS.BRACKETED_TIMECODE_SINGLE.test(line)) {
                        timecodeFormat = 'bracketedSingle';
                        diagnosticContext.statistics.timecodeFormats.bracketedSingle++;
                    } else {
                        diagnosticContext.statistics.timecodeFormats.anywhere++;
                    }
                    
                    // Remove various timecode patterns to get clean text
                    textAfterTimecode = textAfterTimecode.replace(PATTERNS.BRACKETED_TIMECODE_RANGE, '');
                    textAfterTimecode = textAfterTimecode.replace(PATTERNS.BRACKETED_TIMECODE_SINGLE, '');
                    textAfterTimecode = textAfterTimecode.replace(PATTERNS.PARTIAL_TIMECODE, '');
                    textAfterTimecode = textAfterTimecode.replace(/^\s*-\s*/, '').trim();
                    
                    diagnosticLog(i, rawLine, 'comment_extracted', { 
                        extractedTimecode, 
                        timecodeFormat, 
                        text: textAfterTimecode.substring(0, 50), 
                        author: currentAuthor 
                    });
                    
                    if (textAfterTimecode) {
                        // Create comment safely (timecode already validated in extractTimecodeFromLine)
                        const comment = {
                            timecode: extractedTimecode,
                            text: textAfterTimecode,
                            author: currentAuthor,
                            isReply: false
                        };
                        
                        currentTimecode = extractedTimecode;
                        currentComment = comment;
                        
                        // Set comment context flags
                        commentContext.lastLineWasComment = true;
                        commentContext.lastLineWasContinuation = false;
                        commentContext.inMultiLineComment = false;
                        
                        const oldState = state;
                        state = STATES.IN_COMMENT;
                        diagnosticStateTransition(oldState, state, 'timecode_extracted', i);
                        log.debug(`Created comment from extracted timecode ${extractedTimecode}: "${textAfterTimecode.substring(0, 30)}..."`);
                    }
                } else {
                    // Unrecognized line in scanning state
                    diagnosticLog(i, rawLine, 'unrecognized', { state: 'SCANNING' });
                }
                break;
                
            case STATES.IN_COMMENT:
                // Check if this is a new comment start
                const newCommentMatch = line.match(PATTERNS.COMMENT_START);
                if (newCommentMatch) {
                    // Finalize previous comment
                    if (finalizeCurrentComment()) return comments;
                    
                    // Start new comment with validation
                    const rawTimecode = newCommentMatch[1];
                    const text = newCommentMatch[2].trim();
                    
                    const comment = createCommentSafely(rawTimecode, text, currentAuthor, false, 'new_comment');
                    if (!comment) {
                        // Invalid timecode, skip
                        continue;
                    }
                    
                    currentTimecode = comment.timecode;
                    currentComment = comment;
                    
                    // Set comment context flags
                    commentContext.lastLineWasComment = true;
                    commentContext.lastLineWasContinuation = false;
                    commentContext.inMultiLineComment = false;
                    
                    continue;
                }
                
                // Check for new author header
                const newAuthorMatch = line.match(PATTERNS.AUTHOR_HEADER);
                if (newAuthorMatch) {
                    // Finalize current comment and update author
                    if (finalizeCurrentComment()) return comments;
                    currentAuthor = newAuthorMatch[1].trim();
                    
                    // Reset comment context
                    commentContext.lastLineWasComment = false;
                    commentContext.lastLineWasContinuation = false;
                    commentContext.inMultiLineComment = false;
                    
                    state = STATES.SCANNING;
                    continue;
                }
                
                // Enhanced reply detection with better heuristics
                if (isIndentedLine(rawLine)) {
                    // Finalize current main comment first
                    if (finalizeCurrentComment()) return comments;
                    
                    // Reset comment context when entering reply mode
                    commentContext.lastLineWasComment = false;
                    commentContext.lastLineWasContinuation = false;
                    commentContext.inMultiLineComment = false;
                    
                    const indentedContent = getIndentedContent(rawLine);
                    const currentIndentLevel = getIndentLevel(rawLine);
                    
                    // Set baseline indent level if not set
                    if (replyContext.baselineIndentLevel === 0) {
                        replyContext.baselineIndentLevel = currentIndentLevel;
                    }
                    
                    // Check if this is a reply author line (indented + author pattern + timestamp)
                    if (isReplyAuthorLine(indentedContent)) {
                        const replyAuthorMatch = indentedContent.match(PATTERNS.REPLY_AUTHOR);
                        const replyAuthor = replyAuthorMatch[1].trim();
                        
                        diagnosticLog(i, rawLine, 'reply_author', { 
                            replyAuthor, 
                            currentTimecode, 
                            indentLevel: currentIndentLevel,
                            pattern: replyAuthorMatch[0]
                        });
                        diagnosticAuthorAnalysis(replyAuthor, normalizeAuthorName(replyAuthor), 'reply');
                        
                        log.debug(`Enhanced reply detection: Found reply author line for ${replyAuthor} at line ${i}`);
                        startNewReply(replyAuthor, i);
                        
                        const oldState = state;
                        state = STATES.IN_REPLY;
                        diagnosticStateTransition(oldState, state, 'reply_author_detected', i);
                        continue;
                    }
                    
                    // Check if this is reply text (indented + no timecode + not author line)
                    if (!PATTERNS.TIMECODE_PATTERN.test(indentedContent) && 
                        !isReplyAuthorLine(indentedContent) &&
                        currentTimecode) {
                        
                        diagnosticLog(i, rawLine, 'reply_text', { 
                            indentLevel: currentIndentLevel,
                            hasReplyContext: replyContext.inReplySequence,
                            currentReplyAuthor: replyContext.currentReplyAuthor,
                            text: indentedContent.substring(0, 50)
                        });
                        
                        // If we don't have a reply context, this might be a reply without explicit author
                        if (!replyContext.inReplySequence) {
                            log.debug(`Enhanced reply detection: Found orphaned reply text, assigning to ${currentAuthor}`);
                            startNewReply(currentAuthor + ' (Reply)', i);
                        }
                        
                        addToReplyBuffer(indentedContent);
                        const oldState = state;
                        state = STATES.IN_REPLY;
                        if (oldState !== state) {
                            diagnosticStateTransition(oldState, state, 'reply_text_detected', i);
                        }
                        continue;
                    }
                    
                    state = STATES.IN_REPLY;
                    continue;
                }
                
                // Enhanced multi-line comment continuation
                if (isCommentContinuation(line, commentContext.lastLineWasComment || commentContext.lastLineWasContinuation)) {
                    diagnosticLog(i, rawLine, 'continuation', { 
                        currentCommentTimecode: currentComment?.timecode,
                        bufferLength: commentBuffer.length,
                        text: line.substring(0, 50)
                    });
                    addToCommentBuffer(line);
                    commentContext.lastLineWasContinuation = true;
                    commentContext.lastLineWasComment = false;
                    commentContext.inMultiLineComment = true;
                    continue;
                }
                
                // If we get here, this line doesn't continue the comment
                commentContext.lastLineWasComment = false;
                commentContext.lastLineWasContinuation = false;
                commentContext.inMultiLineComment = false;
                break;
                
            case STATES.IN_REPLY:
                // Check for new comment start (ends reply context)
                const newCommentInReply = line.match(PATTERNS.COMMENT_START);
                if (newCommentInReply) {
                    // Finalize any current reply
                    finalizeCurrentReply();
                    
                    const rawTimecode = newCommentInReply[1];
                    const text = newCommentInReply[2].trim();
                    
                    const comment = createCommentSafely(rawTimecode, text, currentAuthor, false, 'reply_to_comment');
                    if (!comment) {
                        // Invalid timecode, skip
                        continue;
                    }
                    
                    currentTimecode = comment.timecode;
                    currentComment = comment;
                    state = STATES.IN_COMMENT;
                    continue;
                }
                
                // Check for new author header (ends reply context)
                const authorInReply = line.match(PATTERNS.AUTHOR_HEADER);
                if (authorInReply) {
                    // Finalize any current reply
                    finalizeCurrentReply();
                    
                    currentAuthor = authorInReply[1].trim();
                    state = STATES.SCANNING;
                    continue;
                }
                
                // Handle indented content in reply context
                if (isIndentedLine(rawLine)) {
                    const indentedContent = getIndentedContent(rawLine);
                    const currentIndentLevel = getIndentLevel(rawLine);
                    
                    // Check if this is a new reply author line
                    if (isReplyAuthorLine(indentedContent)) {
                        const replyAuthorMatch = indentedContent.match(PATTERNS.REPLY_AUTHOR);
                        const replyAuthor = replyAuthorMatch[1].trim();
                        
                        log.debug(`Enhanced reply detection: Found additional reply author ${replyAuthor} in reply context`);
                        startNewReply(replyAuthor, i);
                        continue;
                    }
                    
                    // Check if this is reply text continuation or new reply text
                    if (!PATTERNS.TIMECODE_PATTERN.test(indentedContent) && 
                        !isReplyAuthorLine(indentedContent)) {
                        
                        // If we have an active reply context, add to buffer
                        if (replyContext.inReplySequence) {
                            addToReplyBuffer(indentedContent);
                        } else {
                            // Orphaned reply text - create context
                            log.debug(`Enhanced reply detection: Found orphaned reply text in reply state`);
                            startNewReply(currentAuthor + ' (Continuation)', i);
                            addToReplyBuffer(indentedContent);
                        }
                        continue;
                    }
                } else {
                    // Check if we're returning to baseline (non-indented)
                    const currentIndentLevel = getIndentLevel(rawLine);
                    
                    if (currentIndentLevel === 0 || currentIndentLevel < replyContext.baselineIndentLevel) {
                        // Finalize current reply and return to scanning
                        finalizeCurrentReply();
                        replyContext.baselineIndentLevel = 0;
                        state = STATES.SCANNING;
                        i--; // Reprocess this line in SCANNING state
                        continue;
                    }
                }
                break;
        }
    }
    
    // Finalize any remaining comment and replies
    finalizeCurrentComment();
    finalizeCurrentReply();
    
    log.info(`State machine parsing complete: processed ${processedLines} lines, found ${comments.length} comments`);
    
    // Generate diagnostic report if enabled
    if (diagnosticContext.enabled) {
        generateDiagnosticReport();
    }
    
    // Remove duplicates and return (with enhanced diagnostic logging)
    return removeDuplicateComments(comments, diagnosticContext);
    
    function generateDiagnosticReport() {
        const endTime = Date.now();
        const report = {
            metadata: {
                generatedAt: new Date().toISOString(),
                fileSize: text.length,
                processingTime: endTime - (diagnosticContext.lineClassifications[0]?.timestamp || endTime)
            },
            statistics: diagnosticContext.statistics,
            lineClassifications: diagnosticContext.lineClassifications,
            stateTransitions: diagnosticContext.stateTransitions,
            anomalies: diagnosticContext.anomalies,
            authorAnalysis: Object.fromEntries(diagnosticContext.authors),
            duplicateAnalysis: diagnosticContext.duplicateAnalysis
        };
        
        log.info('📊 DIAGNOSTIC REPORT GENERATED:', {
            totalLines: report.statistics.totalLines,
            comments: report.statistics.commentLines,
            replies: report.statistics.replyLines,
            continuations: report.statistics.continuationLines,
            stateTransitions: report.statistics.stateTransitions,
            anomalies: report.anomalies.length,
            uniqueAuthors: diagnosticContext.authors.size,
            processingTimeMs: report.metadata.processingTime
        });
        
        // Log classification summary
        const classificationSummary = {};
        diagnosticContext.lineClassifications.forEach(entry => {
            classificationSummary[entry.classification] = (classificationSummary[entry.classification] || 0) + 1;
        });
        log.info('📋 Line Classification Summary:', classificationSummary);
        
        // Log timecode format distribution
        log.info('⏰ Timecode Format Distribution:', report.statistics.timecodeFormats);
        
        // Log author analysis
        if (diagnosticContext.authors.size > 0) {
            log.info('👥 Author Analysis:', 
                Array.from(diagnosticContext.authors.entries()).map(([original, data]) => ({
                    original,
                    normalized: data.normalized,
                    occurrences: data.occurrences
                }))
            );
        }
        
        // Log anomalies if any
        if (report.anomalies.length > 0) {
            log.warn('⚠️  Anomalies Detected:', report.anomalies.map(a => ({
                type: a.type,
                line: a.lineNumber,
                description: a.description
            })));
        }
        
        return report;
    }
}

function removeDuplicateComments(comments, diagnosticContext = null) {
    if (!comments || comments.length === 0) {
        return [];
    }
    
    // Enhanced deduplication for Frame.io's duplicate exports
    const seen = new Map();
    const deduplicated = [];
    const duplicatesFound = [];
    
    // Statistics for logging
    let exactDuplicates = 0;
    let authorVariationDuplicates = 0;
    
    for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];
        
        // Normalize text by trimming and lowercasing for comparison
        const normalizedText = comment.text.trim().toLowerCase();
        
        // Normalize author name to handle variations (e.g., "Baron" vs "Baron Ryan")
        const normalizedAuthor = normalizeAuthorName(comment.author);
        
        // Create unique key: ${timecode}-${normalizedText}-${normalizedAuthor}
        const uniqueKey = `${comment.timecode}-${normalizedText}-${normalizedAuthor}`;
        
        // Check for exact duplicates first
        if (seen.has(uniqueKey)) {
            const existingIndex = seen.get(uniqueKey);
            exactDuplicates++;
            
            const duplicateInfo = {
                type: 'exact',
                duplicate: comment,
                original: comments[existingIndex],
                reason: 'Same timecode, text, and author',
                duplicateIndex: i,
                originalIndex: existingIndex
            };
            
            duplicatesFound.push(duplicateInfo);
            
            // Enhanced diagnostic logging for duplicates
            if (diagnosticContext?.enabled) {
                diagnosticContext.duplicateAnalysis.push({
                    type: 'exact_duplicate',
                    duplicateComment: {
                        timecode: comment.timecode,
                        text: comment.text.substring(0, 100),
                        author: comment.author,
                        isReply: comment.isReply
                    },
                    originalComment: {
                        timecode: comments[existingIndex].timecode,
                        text: comments[existingIndex].text.substring(0, 100),
                        author: comments[existingIndex].author,
                        isReply: comments[existingIndex].isReply
                    },
                    uniqueKey: uniqueKey,
                    indices: { duplicate: i, original: existingIndex }
                });
                
                log.debug(`[DIAGNOSTIC] EXACT DUPLICATE: Comment ${i+1} matches comment ${existingIndex+1} - Key: "${uniqueKey}"`);
            }
            
            log.debug(`Exact duplicate found at ${comment.timecode}: "${comment.text.substring(0, 50)}..." by ${comment.author}`);
            continue;
        }
        
        // Check for author name variations (same timecode and text, different author format)
        let isAuthorVariation = false;
        for (const [existingKey, existingIndex] of seen.entries()) {
            const [existingTimecode, existingText] = existingKey.split('-', 2);
            
            if (existingTimecode === comment.timecode && 
                existingText === normalizedText && 
                existingKey !== uniqueKey) {
                
                // Found same timecode and text but different author - check if it's a name variation
                const existingComment = comments[existingIndex];
                if (isAuthorNameVariation(comment.author, existingComment.author)) {
                    authorVariationDuplicates++;
                    isAuthorVariation = true;
                    
                    const variationInfo = {
                        type: 'author_variation',
                        duplicate: comment,
                        original: existingComment,
                        reason: `Author name variation: "${comment.author}" vs "${existingComment.author}"`,
                        duplicateIndex: i,
                        originalIndex: existingIndex
                    };
                    
                    duplicatesFound.push(variationInfo);
                    
                    // Enhanced diagnostic logging for author variations
                    if (diagnosticContext?.enabled) {
                        diagnosticContext.duplicateAnalysis.push({
                            type: 'author_variation_duplicate',
                            duplicateComment: {
                                timecode: comment.timecode,
                                text: comment.text.substring(0, 100),
                                author: comment.author,
                                normalizedAuthor: normalizeAuthorName(comment.author),
                                isReply: comment.isReply
                            },
                            originalComment: {
                                timecode: existingComment.timecode,
                                text: existingComment.text.substring(0, 100),
                                author: existingComment.author,
                                normalizedAuthor: normalizeAuthorName(existingComment.author),
                                isReply: existingComment.isReply
                            },
                            matchingKey: existingKey,
                            newKey: uniqueKey,
                            indices: { duplicate: i, original: existingIndex }
                        });
                        
                        log.debug(`[DIAGNOSTIC] AUTHOR VARIATION DUPLICATE: "${comment.author}" vs "${existingComment.author}" - same content at ${comment.timecode}`);
                    }
                    
                    log.debug(`Author variation duplicate found: "${comment.author}" vs "${existingComment.author}" at ${comment.timecode}`);
                    break;
                }
            }
        }
        
        if (!isAuthorVariation) {
            // This is a unique comment, add it
            seen.set(uniqueKey, i);
            deduplicated.push(comment);
        }
    }
    
    // Clear the Map to free memory
    seen.clear();
    
    // Log duplicate detection results
    const removedCount = comments.length - deduplicated.length;
    if (removedCount > 0) {
        log.info(`Frame.io duplicate removal complete:`, {
            originalCount: comments.length,
            deduplicatedCount: deduplicated.length,
            totalRemoved: removedCount,
            exactDuplicates: exactDuplicates,
            authorVariationDuplicates: authorVariationDuplicates
        });
        
        // Log sample duplicates for debugging
        if (duplicatesFound.length > 0) {
            log.debug(`Sample duplicates found:`, duplicatesFound.slice(0, 3).map(d => ({
                type: d.type,
                timecode: d.duplicate.timecode,
                text: d.duplicate.text.substring(0, 50) + '...',
                duplicateAuthor: d.duplicate.author,
                originalAuthor: d.original.author,
                reason: d.reason
            })));
        }
    } else {
        log.info(`No duplicates found in ${comments.length} comments`);
    }
    
    return deduplicated;
}

/**
 * Normalize author name to handle variations like "Baron" vs "Baron Ryan"
 * Returns the base/first name for comparison
 */
function normalizeAuthorName(authorName) {
    if (!authorName || typeof authorName !== 'string') {
        return 'unknown';
    }
    
    const cleaned = authorName.trim().toLowerCase();
    
    // Split by space and take the first name as the base
    // This handles cases like "Baron Ryan" -> "baron" and "Baron" -> "baron"
    const firstWord = cleaned.split(/\s+/)[0];
    
    // Remove any non-alphabetic characters from the first word
    return firstWord.replace(/[^a-z]/g, '');
}

/**
 * Check if two author names are likely variations of the same person
 * Handles cases like "Baron" vs "Baron Ryan" or "Mike Chen" vs "Mike"
 */
function isAuthorNameVariation(author1, author2) {
    if (!author1 || !author2) return false;
    
    const name1 = author1.trim().toLowerCase();
    const name2 = author2.trim().toLowerCase();
    
    // Exact match (case insensitive)
    if (name1 === name2) return true;
    
    // Split names into words
    const words1 = name1.split(/\s+/).filter(w => w.length > 0);
    const words2 = name2.split(/\s+/).filter(w => w.length > 0);
    
    // If one name is a subset of the other (e.g., "Baron" vs "Baron Ryan")
    const minLength = Math.min(words1.length, words2.length);
    const maxLength = Math.max(words1.length, words2.length);
    
    // Allow up to 2 word difference (handles "John" vs "John Doe Smith")
    if (maxLength - minLength > 2) return false;
    
    // Check if the first name(s) match
    for (let i = 0; i < minLength; i++) {
        if (words1[i] !== words2[i]) {
            return false;
        }
    }
    
    return true;
}

/**
 * Enhanced timecode validation and normalization
 * @param {string} tc - Raw timecode string
 * @param {number} fps - Frame rate for validation (default 30)
 * @returns {object} {isValid: boolean, timecode: string, error: string}
 */
function validateAndNormalizeTimecode(tc, fps = 30) {
    if (!tc || typeof tc !== 'string') {
        return { isValid: false, timecode: '00:00:00:00', error: 'Empty or invalid timecode' };
    }
    
    // Clean and split the timecode
    const cleaned = tc.trim().replace(/[^\d:;]/g, '');
    const parts = cleaned.split(/[:;]/);
    
    // Ensure we have 4 parts (HH:MM:SS:FF)
    while (parts.length < 4) parts.unshift('00');
    if (parts.length > 4) parts.splice(4); // Trim excess parts
    
    // Convert to numbers for validation
    const [hours, minutes, seconds, frames] = parts.map(p => parseInt(p, 10));
    
    // Validate ranges
    const errors = [];
    
    if (isNaN(hours) || hours < 0 || hours >= 24) {
        errors.push(`Invalid hours: ${hours} (must be 0-23)`);
    }
    
    if (isNaN(minutes) || minutes < 0 || minutes >= 60) {
        errors.push(`Invalid minutes: ${minutes} (must be 0-59)`);
    }
    
    if (isNaN(seconds) || seconds < 0 || seconds >= 60) {
        errors.push(`Invalid seconds: ${seconds} (must be 0-59)`);
    }
    
    if (isNaN(frames) || frames < 0 || frames >= fps) {
        errors.push(`Invalid frames: ${frames} (must be 0-${fps - 1} for ${fps}fps)`);
    }
    
    if (errors.length > 0) {
        return { 
            isValid: false, 
            timecode: '00:00:00:00', 
            error: `Timecode validation failed for "${tc}": ${errors.join(', ')}` 
        };
    }
    
    // Format as HH:MM:SS:FF with zero padding
    const normalized = [hours, minutes, seconds, frames]
        .map(n => n.toString().padStart(2, '0'))
        .join(':');
    
    return { isValid: true, timecode: normalized, error: null };
}

/**
 * Legacy function for backward compatibility
 * @param {string} tc - Raw timecode string
 * @returns {string} Normalized timecode or '00:00:00:00' if invalid
 */
function normalizeTimecode(tc) {
    const result = validateAndNormalizeTimecode(tc);
    if (!result.isValid) {
        log.warn(`Timecode normalization warning: ${result.error}`);
    }
    return result.timecode;
}


// Export for use in main process
module.exports = { parseFrameioTXT };
