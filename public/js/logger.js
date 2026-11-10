/**
 * Activity Logger Module
 * Menyimpan dan mengelola riwayat aktivitas lokal (Upload, Download, Kelola Folder, Hapus)
 */
const ActivityLogger = {
  STORAGE_KEY: 'drive_activity_logs',
  MAX_LOGS: 250,

  getLogs() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  },

  addLog({ type, action, title, details = '', status = 'success', link = null }) {
    const logs = this.getLogs();
    const newEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type, // 'upload' | 'download' | 'create_folder' | 'delete' | 'connect_folder' | 'unlink_folder'
      action, // e.g. 'Mengunggah Berkas', 'Mengunduh Berkas', dll
      title, // Nama file / folder
      details, // Detail tambahan (ukuran file, nama folder tujuan, alasan error)
      status, // 'success' | 'error'
      link, // Opsional: Link Google Drive
      timestamp: new Date().toISOString(),
    };

    logs.unshift(newEntry);

    // Batasi riwayat maksimal 250 log terakhir
    if (logs.length > this.MAX_LOGS) {
      logs.length = this.MAX_LOGS;
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
      console.warn('Gagal menyimpan log aktivitas:', e);
    }

    this.updateBadge();
    return newEntry;
  },

  clearLogs() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.updateBadge();
  },

  updateBadge() {
    const badge = document.getElementById('log-count-badge');
    if (!badge) return;
    const logs = this.getLogs();
    if (logs.length > 0) {
      badge.textContent = logs.length > 99 ? '99+' : logs.length;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  },

  formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 45) return 'Baru saja';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
    if (diffSec < 172800) return 'Kemarin';
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  formatFullDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  },

  getTypeConfig(type) {
    switch (type) {
      case 'upload':
        return {
          icon: 'upload-cloud',
          color: 'var(--success)',
          bg: 'rgba(16, 185, 129, 0.12)',
          border: 'rgba(16, 185, 129, 0.25)',
          label: 'Upload',
        };
      case 'download':
        return {
          icon: 'download',
          color: 'var(--accent)',
          bg: 'rgba(59, 130, 246, 0.12)',
          border: 'rgba(59, 130, 246, 0.25)',
          label: 'Download',
        };
      case 'create_folder':
        return {
          icon: 'folder-plus',
          color: 'var(--color-folder)',
          bg: 'rgba(245, 158, 11, 0.12)',
          border: 'rgba(245, 158, 11, 0.25)',
          label: 'Buat Folder',
        };
      case 'connect_folder':
        return {
          icon: 'link-2',
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.12)',
          border: 'rgba(56, 189, 248, 0.25)',
          label: 'Hubungkan Folder',
        };
      case 'unlink_folder':
        return {
          icon: 'unlink-2',
          color: 'var(--text-dim)',
          bg: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.1)',
          label: 'Putus Tautan',
        };
      case 'delete':
        return {
          icon: 'trash-2',
          color: 'var(--danger)',
          bg: 'rgba(239, 68, 68, 0.12)',
          border: 'rgba(239, 68, 68, 0.25)',
          label: 'Hapus / Trash',
        };
      default:
        return {
          icon: 'activity',
          color: 'var(--text-muted)',
          bg: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.1)',
          label: 'Aktivitas',
        };
    }
  },
};

// Update badge saat halaman pertama kali dibuka
document.addEventListener('DOMContentLoaded', () => {
  ActivityLogger.updateBadge();
});
