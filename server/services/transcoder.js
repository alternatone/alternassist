const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

// Set FFmpeg path (Homebrew location on Apple Silicon Mac)
ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg');
ffmpeg.setFfprobePath('/opt/homebrew/bin/ffprobe');

/**
 * Check if a video file needs transcoding
 * Returns true if file is already web-optimized H.264
 */
async function needsTranscoding(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('FFprobe error:', err);
        return reject(err);
      }

      // Find video stream
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');

      if (!videoStream) {
        // No video stream (audio-only file) - no transcoding needed
        return resolve(false);
      }

      // Check if it's H.264/AVC
      const isH264 = videoStream.codec_name === 'h264';

      // Check bitrate (if available)
      const bitrate = parseInt(videoStream.bit_rate) || parseInt(metadata.format.bit_rate) || 0;
      const bitrateInMbps = bitrate / 1000000;

      // If it's H.264 with reasonable bitrate (under 20 Mbps for HD, 40 Mbps for 4K), skip transcoding
      const width = videoStream.width || 0;
      const maxBitrate = width > 1920 ? 40 : 20; // 4K vs HD threshold

      if (isH264 && bitrateInMbps > 0 && bitrateInMbps <= maxBitrate) {
        console.log(`File is already web-optimized H.264 (${bitrateInMbps.toFixed(1)} Mbps) - skipping transcode`);
        return resolve(false);
      }

      console.log(`File needs transcoding: codec=${videoStream.codec_name}, bitrate=${bitrateInMbps.toFixed(1)} Mbps`);
      return resolve(true);
    });
  });
}

/**
 * Transcode video to web-optimized H.264
 */
async function transcodeVideo(inputPath, outputPath, onProgress = null) {
  return new Promise((resolve, reject) => {
    console.log(`Starting transcode: ${inputPath} -> ${outputPath}`);

    const command = ffmpeg(inputPath)
      // Video codec settings - H.264 with good quality
      .videoCodec('libx264')
      .videoBitrate('5000k')  // 5 Mbps - good balance of quality/size
      .size('1920x?')         // Max width 1920px, maintain aspect ratio
      .fps(30)                // Max 30fps for web
      .outputOptions([
        '-preset fast',       // Encoding speed vs compression ratio
        '-crf 23',            // Quality (18-28, lower = better quality)
        '-profile:v high',    // H.264 profile
        '-level 4.0',         // H.264 level
        '-pix_fmt yuv420p',   // Pixel format (max compatibility)
        '-movflags +faststart' // Enable streaming before download complete
      ])
      // Audio codec settings
      .audioCodec('aac')
      .audioBitrate('192k')
      .audioChannels(2)
      .audioFrequency(48000)
      // Output format
      .format('mp4')
      .output(outputPath);

    // Track progress
    if (onProgress) {
      command.on('progress', (progress) => {
        onProgress(progress);
      });
    }

    // Handle completion
    command
      .on('end', () => {
        console.log(`Transcode complete: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('Transcode error:', err.message);
        console.error('FFmpeg stderr:', stderr);
        reject(err);
      })
      .run();
  });
}

/**
 * Get video duration and metadata
 */
async function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(err);
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

      resolve({
        duration: metadata.format.duration,
        bitrate: metadata.format.bit_rate,
        size: metadata.format.size,
        videoCodec: videoStream?.codec_name,
        videoWidth: videoStream?.width,
        videoHeight: videoStream?.height,
        audioCodec: audioStream?.codec_name,
        hasVideo: !!videoStream,
        hasAudio: !!audioStream
      });
    });
  });
}

/**
 * Main transcoding workflow
 * Returns the path to use for streaming (original or transcoded)
 */
async function processVideoFile(originalPath, projectPath, originalFilename) {
  try {
    const ext = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, ext);

    // Check if file needs transcoding
    const shouldTranscode = await needsTranscoding(originalPath);

    if (!shouldTranscode) {
      // File is already optimized - return null to indicate no transcoded version
      return null;
    }

    // Generate transcoded filename
    const transcodedFilename = `${baseName}-transcoded.mp4`;
    const transcodedPath = path.join(projectPath, transcodedFilename);

    // Transcode the video
    await transcodeVideo(originalPath, transcodedPath, (progress) => {
      if (progress.percent) {
        console.log(`Transcode progress: ${progress.percent.toFixed(1)}%`);
      }
    });

    return transcodedPath;
  } catch (error) {
    console.error('Error processing video file:', error);
    throw error;
  }
}

module.exports = {
  needsTranscoding,
  transcodeVideo,
  getVideoMetadata,
  processVideoFile
};
