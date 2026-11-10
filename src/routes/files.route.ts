import { Hono } from 'hono';
import { Readable } from 'node:stream';
import { DriveService } from '../services/drive.service';
import { isAuthenticated } from '../config/google';

const filesRoute = new Hono();

// Middleware: Pastikan sudah login ke Google
filesRoute.use('*', async (c, next) => {
  if (!isAuthenticated()) {
    return c.json(
      {
        success: false,
        message: 'Belum terotentikasi. Silakan hubungkan akun Google Drive Anda.',
      },
      401
    );
  }
  await next();
});

/**
 * 1. Mendapatkan daftar berkas & folder
 * Query:
 *  - folderId: string (bisa berupa ID 'root' atau URL/link folder Google Drive)
 *  - search: string (kata kunci pencarian)
 */
filesRoute.get('/', async (c) => {
  const folderInput = c.req.query('folderId') || 'root';
  const search = c.req.query('search');

  try {
    const data = await DriveService.listContents(folderInput, search);
    return c.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error('Error listing drive contents:', err);
    return c.json(
      {
        success: false,
        message: err.message || 'Gagal mengambil isi folder dari Google Drive',
      },
      500
    );
  }
});

/**
 * 2. Menguraikan & memvalidasi Link Google Drive Folder
 * Body: { link: string }
 */
filesRoute.post('/resolve-link', async (c) => {
  try {
    const body = await c.req.json();
    const link = body.link;
    if (!link) {
      return c.json({ success: false, message: 'Link folder Google Drive wajib diisi' }, 400);
    }

    const folderId = DriveService.extractIdFromInput(link);
    const info = await DriveService.getFolderInfo(folderId);

    return c.json({
      success: true,
      data: {
        folderId,
        info,
      },
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: err.message || 'Link folder Google Drive tidak valid atau tidak dapat diakses',
      },
      400
    );
  }
});

/**
 * 3. Membuat folder baru
 * Body: { name: string, parentId?: string (bisa raw ID atau URL folder Drive) }
 */
filesRoute.post('/folder', async (c) => {
  try {
    const body = await c.req.json();
    const name = body.name?.trim();
    const parentId = body.parentId || 'root';

    if (!name) {
      return c.json({ success: false, message: 'Nama folder tidak boleh kosong' }, 400);
    }

    const newFolder = await DriveService.createFolder(name, parentId);

    return c.json({
      success: true,
      message: `Folder "${name}" berhasil dibuat!`,
      data: newFolder,
    });
  } catch (err: any) {
    console.error('Error creating folder:', err);
    return c.json(
      {
        success: false,
        message: err.message || 'Gagal membuat folder di Google Drive',
      },
      500
    );
  }
});

/**
 * 4. Mengunggah berkas ke Google Drive (Mendukung berkas besar via Direct Streaming & Resumable Upload)
 */
filesRoute.post('/upload', async (c) => {
  try {
    const rawHeaderFileName = c.req.header('x-file-name');

    // JIKA UPLOAD LANGSUNG STREAM BINARY (Untuk file besar / video / film)
    if (rawHeaderFileName) {
      const fileName = decodeURIComponent(rawHeaderFileName);
      const folderId = c.req.header('x-folder-id') || 'root';
      const mimeType = c.req.header('content-type') || 'application/octet-stream';
      const contentLength = c.req.header('content-length');
      const fileSize = contentLength ? Number(contentLength) : undefined;

      const bodyStream = c.req.raw.body;
      if (!bodyStream) {
        return c.json({ success: false, message: 'Stream data berkas kosong' }, 400);
      }

      const uploaded = await DriveService.uploadLargeFileResumable(
        bodyStream,
        fileName,
        mimeType,
        fileSize,
        folderId
      );

      return c.json({
        success: true,
        message: `Berkas "${fileName}" berhasil diunggah!`,
        data: uploaded,
      });
    }

    // FALLBACK: JIKA UPLOAD MENGGUNAKAN MULTIPART FORM-DATA
    const formData = await c.req.parseBody();
    const file = formData['file'];
    const folderId = (formData['folderId'] as string) || 'root';

    if (!file || typeof file === 'string') {
      return c.json({ success: false, message: 'File tidak ditemukan dalam request' }, 400);
    }

    const uploadedFile = file as File;
    const fileName = uploadedFile.name;
    const mimeType = uploadedFile.type || 'application/octet-stream';
    const fileSize = uploadedFile.size;

    const stream = (uploadedFile as any).stream();

    const uploaded = await DriveService.uploadLargeFileResumable(
      stream,
      fileName,
      mimeType,
      fileSize,
      folderId
    );

    return c.json({
      success: true,
      message: `Berkas "${fileName}" berhasil diunggah!`,
      data: uploaded,
    });
  } catch (err: any) {
    console.error('Error uploading file:', err);
    return c.json(
      {
        success: false,
        message: err.message || 'Gagal mengunggah berkas ke Google Drive',
      },
      500
    );
  }
});

/**
 * 5. Mengunduh berkas (Stream download)
 */
filesRoute.get('/download/:id', async (c) => {
  const fileId = c.req.param('id');

  try {
    const { stream: nodeStream, name, mimeType, size } = await DriveService.downloadFile(fileId);

    // Ubah Node Readable Stream ke Web ReadableStream
    const webStream = Readable.toWeb(nodeStream as Readable);

    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"`,
    };

    if (size) {
      headers['Content-Length'] = size.toString();
    }

    return new Response(webStream as any, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error('Error downloading file:', err);
    return c.json(
      {
        success: false,
        message: err.message || 'Gagal mengunduh berkas dari Google Drive',
      },
      500
    );
  }
});

/**
 * 6. Menghapus berkas / folder (Pindahkan ke Trash)
 */
filesRoute.delete('/:id', async (c) => {
  const fileId = c.req.param('id');

  try {
    await DriveService.trashItem(fileId);
    return c.json({
      success: true,
      message: 'Item berhasil dipindahkan ke tempat sampah (Trash)',
    });
  } catch (err: any) {
    console.error('Error moving to trash:', err);
    return c.json(
      {
        success: false,
        message: err.message || 'Gagal menghapus item dari Google Drive',
      },
      500
    );
  }
});

export default filesRoute;
