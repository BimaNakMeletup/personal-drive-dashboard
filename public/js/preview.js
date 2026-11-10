/**
 * File Preview Modal Handler
 */
const PreviewManager = {
  open(file) {
    const modal = document.getElementById('preview-modal');
    const title = document.getElementById('preview-title');
    const body = document.getElementById('preview-body');
    const downloadBtn = document.getElementById('preview-download-btn');
    const driveBtn = document.getElementById('preview-drive-btn');

    if (!modal) return;

    title.textContent = file.name;
    downloadBtn.onclick = () => {
      if (window.DriveApp) DriveApp.logDownload(file);
      window.open(API.getDownloadUrl(file.id), '_blank');
    };
    
    if (file.webViewLink) {
      driveBtn.href = file.webViewLink;
      driveBtn.style.display = 'inline-flex';
    } else {
      driveBtn.style.display = 'none';
    }

    body.innerHTML = '<div style="color: #94a3b8;">Memuat pratinjau...</div>';
    modal.classList.add('active');

    const mime = file.mimeType || '';

    // 1. Gambar
    if (mime.startsWith('image/')) {
      const img = document.createElement('img');
      img.className = 'preview-image';
      img.src = API.getDownloadUrl(file.id);
      img.onload = () => {
        body.innerHTML = '';
        body.appendChild(img);
      };
      img.onerror = () => {
        body.innerHTML = '<div style="color: #ef4444;">Gagal memuat pratinjau gambar.</div>';
      };
      return;
    }

    // 2. Berkas Teks / Markdown / Kode / JSON
    if (
      mime.startsWith('text/') ||
      mime.includes('json') ||
      mime.includes('javascript') ||
      mime.includes('typescript') ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.txt')
    ) {
      fetch(API.getDownloadUrl(file.id))
        .then((res) => res.text())
        .then((text) => {
          const pre = document.createElement('pre');
          pre.className = 'preview-text';
          pre.textContent = text;
          body.innerHTML = '';
          body.appendChild(pre);
        })
        .catch(() => {
          body.innerHTML = '<div style="color: #ef4444;">Gagal membaca isi berkas teks.</div>';
        });
      return;
    }

    // 3. File Lainnya / Google Docs (Tampilkan link Google Drive)
    body.innerHTML = `
      <div style="text-align: center; color: #94a3b8; display: flex; flex-direction: column; align-items: center; gap: 1rem;">
        <i data-lucide="file" style="width: 48px; height: 48px; color: #64748b;"></i>
        <p>Pratinjau langsung tidak tersedia untuk format berkas ini (<strong>${mime}</strong>).</p>
        <div style="display: flex; gap: 0.75rem;">
          <a href="${API.getDownloadUrl(file.id)}" class="btn btn-primary btn-sm" download>
            <i data-lucide="download"></i> Download Berkas
          </a>
          ${
            file.webViewLink
              ? `<a href="${file.webViewLink}" target="_blank" class="btn btn-secondary btn-sm">
                   <i data-lucide="external-link"></i> Buka di Google Drive
                 </a>`
              : ''
          }
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  },

  close() {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.classList.remove('active');
  },
};

// Bind close button
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('preview-close-btn');
  if (closeBtn) closeBtn.onclick = () => PreviewManager.close();

  const modal = document.getElementById('preview-modal');
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) PreviewManager.close();
    };
  }
});
