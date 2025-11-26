# Files API - Cloudflare Migration Notes

## Implementation Status

### ✅ Completed (Database Operations)
- Comment CRUD operations (/api/files/comments/:id)

### ⚠️  Requires R2 Integration (File Storage)

The following endpoints require significant rework for Cloudflare:

#### File Upload (`POST /api/files/upload`)
- **Issue**: Multer disk storage doesn't work in Workers/Pages Functions
- **Solution**: Need to use Cloudflare R2 for object storage
- **Implementation**:
  1. Add R2 bucket binding to wrangler.toml
  2. Replace multer with FormData parsing
  3. Upload files to R2 instead of local filesystem
  4. Store R2 object keys in database instead of file paths

#### File Streaming (`GET /api/files/:id/stream`)
- **Issue**: `fs.createReadStream()` doesn't exist in Workers
- **Solution**: Stream from R2
- **Implementation**:
  1. Fetch file from R2 bucket
  2. Use R2 object's `httpMetadata` for Content-Type
  3. Support range requests using R2's range parameter

#### File Download (`GET /api/files/:id/download`)
- **Issue**: Same as streaming - no filesystem access
- **Solution**: Fetch from R2 and stream to response
- **Implementation**: Similar to streaming but with Content-Disposition header

#### File Deletion (`DELETE /api/files/:id`)
- **Issue**: Can't delete from filesystem
- **Solution**: Delete from R2 bucket
- **Implementation**:
  1. Query database for R2 object key
  2. Delete from R2 bucket: `await env.MY_BUCKET.delete(objectKey)`
  3. Delete database record

### Configuration Required

Add to `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "FILES_BUCKET"
bucket_name = "alternassist-files"
```

### Migration Path

1. **Phase 1** (Current): Database operations only
2. **Phase 2**: Implement R2 storage for new uploads
3. **Phase 3**: Migrate existing files from local storage to R2
4. **Phase 4**: Implement video transcoding with Cloudflare Stream (optional)

### Activity Tracking

Activity tracking endpoints can be implemented but ActivityTracker service needs adaptation:
- Remove `req.ip` usage (use `request.headers.get('CF-Connecting-IP')` instead)
- Update log storage strategy for serverless environment

### Reference

- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Workers FormData](https://developers.cloudflare.com/workers/runtime-apis/request/#requestformdata)
- [Range Requests in R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#ranged-reads)
