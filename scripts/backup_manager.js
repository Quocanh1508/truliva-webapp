const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKUP_ROOT = '/var/backups/truliva_db';
const HOURLY_DIR = path.join(BACKUP_ROOT, 'hourly');
const DAILY_DIR = path.join(BACKUP_ROOT, 'daily');

function listBackups() {
  const result = { hourly: [], daily: [] };

  if (fs.existsSync(HOURLY_DIR)) {
    result.hourly = fs.readdirSync(HOURLY_DIR)
      .filter(f => f.endsWith('.sql.gz'))
      .map(f => {
        const stats = fs.statSync(path.join(HOURLY_DIR, f));
        return {
          filename: f,
          path: path.join(HOURLY_DIR, f),
          sizeBytes: stats.size,
          sizeMb: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
          createdAt: stats.mtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  if (fs.existsSync(DAILY_DIR)) {
    result.daily = fs.readdirSync(DAILY_DIR)
      .filter(f => f.endsWith('.sql.gz'))
      .map(f => {
        const stats = fs.statSync(path.join(DAILY_DIR, f));
        return {
          filename: f,
          path: path.join(DAILY_DIR, f),
          sizeBytes: stats.size,
          sizeMb: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
          createdAt: stats.mtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  return result;
}

function runBackup() {
  console.log('Taking snapshot now...');
  execSync('bash /var/www/truliva/scripts/backup_db.sh', { stdio: 'inherit' });
}

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === 'run') {
    runBackup();
  } else {
    console.log(JSON.stringify(listBackups(), null, 2));
  }
}

module.exports = { listBackups, runBackup };
