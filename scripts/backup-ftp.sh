#!/bin/bash

# Alternassist FTP Backup Script
# Syncs FTP1 (primary) to FTP1 BACKUP and backs up the database

set -e

LOG_FILE="$HOME/Developer/alternassist/logs/backup.log"
DB_BACKUP_DIR="/Volumes/FTP1 BACKUP/db-backups"
DB_SOURCE="$HOME/Developer/alternassist/alternaview.db"

echo "=== Backup started: $(date) ===" >> "$LOG_FILE"

# Check if FTP drives are mounted
if [ ! -d "/Volumes/FTP1" ]; then
    echo "ERROR: FTP1 not mounted" >> "$LOG_FILE"
    exit 1
fi

if [ ! -d "/Volumes/FTP1 BACKUP" ]; then
    echo "ERROR: FTP1 BACKUP not mounted" >> "$LOG_FILE"
    exit 1
fi

# Sync FTP1 to FTP1 BACKUP
echo "Syncing FTP1 to FTP1 BACKUP..." >> "$LOG_FILE"
rsync -av --delete "/Volumes/FTP1/" "/Volumes/FTP1 BACKUP/" >> "$LOG_FILE" 2>&1

# Backup database
if [ -f "$DB_SOURCE" ]; then
    mkdir -p "$DB_BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    DB_BACKUP_FILE="$DB_BACKUP_DIR/alternaview-$TIMESTAMP.db"

    echo "Backing up database to $DB_BACKUP_FILE" >> "$LOG_FILE"
    cp "$DB_SOURCE" "$DB_BACKUP_FILE"

    # Clean up old database backups (keep last 30 days)
    echo "Cleaning up old database backups..." >> "$LOG_FILE"
    find "$DB_BACKUP_DIR" -name "*.db" -mtime +30 -delete >> "$LOG_FILE" 2>&1

    echo "Database backup complete" >> "$LOG_FILE"
else
    echo "WARNING: Database file not found at $DB_SOURCE" >> "$LOG_FILE"
fi

echo "=== Backup completed: $(date) ===" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
