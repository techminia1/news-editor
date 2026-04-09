/**
 * NewsOverlay Pro - Backend Server
 * Auth, admin-managed users, assigned logo/media, and video processing
 */

require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const app = express();
const PORT = process.env.PORT || 5000;

const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');
const tempDir = path.join(__dirname, 'temp');
const logosDir = path.join(__dirname, 'logos');
const assignedVideosDir = path.join(__dirname, 'assigned-videos');
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const sessionsFile = path.join(dataDir, 'sessions.json');

for (const dir of [uploadsDir, outputsDir, tempDir, logosDir, assignedVideosDir, dataDir]) {
  fs.ensureDirSync(dir);
}

if (!fs.existsSync(usersFile)) {
  fs.writeJsonSync(usersFile, [], { spaces: 2 });
}

if (!fs.existsSync(sessionsFile)) {
  fs.writeJsonSync(sessionsFile, [], { spaces: 2 });
}

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const allowedCorsOrigins = String(process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedCorsOrigins.length === 0 || allowedCorsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/outputs', express.static(outputsDir));
app.use('/logos', express.static(logosDir));
app.use('/assigned-videos', express.static(assignedVideosDir));

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${uuidv4()}_${file.originalname}`),
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
      return;
    }

    cb(new Error('Only video files are allowed'));
  },
  limits: { fileSize: 500 * 1024 * 1024 },
});

const adminAssetUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      cb(null, file.fieldname === 'logo' ? logosDir : assignedVideosDir);
    },
    filename: (_req, file, cb) => {
      const fallbackExt = file.fieldname === 'logo' ? '.png' : '.mp4';
      cb(null, `${uuidv4()}${path.extname(file.originalname) || fallbackExt}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'logo') {
      if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype)) {
        cb(null, true);
        return;
      }

      cb(new Error('Only PNG, JPG, JPEG, and WEBP logo files are allowed'));
      return;
    }

    if (['introVideo', 'outroVideo'].includes(file.fieldname) && file.mimetype.startsWith('video/')) {
      cb(null, true);
      return;
    }

    cb(new Error('Only video files are allowed for intro and outro'));
  },
  limits: { fileSize: 500 * 1024 * 1024 },
});

function normalizeUserRecord(user) {
  return {
    ...user,
    logoFileName: user.logoFileName || null,
    introVideoFileName: user.introVideoFileName || null,
    outroVideoFileName: user.outroVideoFileName || null,
  };
}

function readUsers() {
  return (fs.readJsonSync(usersFile, { throws: false }) || []).map(normalizeUserRecord);
}

function writeUsers(users) {
  fs.writeJsonSync(usersFile, users, { spaces: 2 });
}

function readSessions() {
  return fs.readJsonSync(sessionsFile, { throws: false }) || [];
}

function writeSessions(sessions) {
  fs.writeJsonSync(sessionsFile, sessions, { spaces: 2 });
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }

  const [salt, expectedHash] = storedHash.split(':');
  const actualHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function buildLogoUrl(req, logoFileName) {
  if (!logoFileName) {
    return null;
  }

  return `${req.protocol}://${req.get('host')}/logos/${logoFileName}`;
}

function buildAssignedVideoUrl(req, fileName) {
  if (!fileName) {
    return null;
  }

  return `${req.protocol}://${req.get('host')}/assigned-videos/${fileName}`;
}

function sanitizeUser(req, user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    logoUrl: buildLogoUrl(req, user.logoFileName),
    introVideoUrl: buildAssignedVideoUrl(req, user.introVideoFileName),
    outroVideoUrl: buildAssignedVideoUrl(req, user.outroVideoFileName),
    createdAt: user.createdAt,
  };
}

function ensureDefaultAdmin() {
  const users = readUsers();
  const existingAdmin = users.find((user) => user.role === 'admin');

  if (existingAdmin) {
    return;
  }

  users.push({
    id: uuidv4(),
    username: adminUsername,
    displayName: 'Administrator',
    role: 'admin',
    passwordHash: createPasswordHash(adminPassword),
    logoFileName: null,
    introVideoFileName: null,
    outroVideoFileName: null,
    createdAt: new Date().toISOString(),
  });

  writeUsers(users);
  console.log(`Seeded default admin user: ${adminUsername}`);
}

function resolveFontFile(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const devanagariFont = resolveFontFile([
  'C:\\Windows\\Fonts\\NirmalaB.ttf',
  'C:\\Windows\\Fonts\\Nirmala.ttf',
  'C:\\Windows\\Fonts\\mangal.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf',
]);

function escapeFFmpegText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

function escapeFFmpegPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

function fontFileClause(filePath) {
  return filePath ? `:fontfile='${escapeFFmpegPath(filePath)}'` : '';
}

function resolveCanvasTextColor(color) {
  return color === 'black' ? '#000000' : '#FFFFFF';
}

function resolveFFmpegTextColor(color) {
  return color === 'black' ? 'black' : 'white';
}

async function removeFiles(paths) {
  await Promise.all(
    (paths || []).filter(Boolean).map((filePath) => fs.remove(filePath).catch(() => {}))
  );
}

function drawFittedText(ctx, text, x, y, maxWidth, baseFontSize) {
  const safeText = String(text || '').trim();
  const minFontSize = Math.max(14, baseFontSize * 0.52);
  let fontSize = baseFontSize;

  while (fontSize > minFontSize) {
    ctx.font = `bold ${fontSize}px "Nirmala UI", "Mangal", Arial`;
    if (ctx.measureText(safeText).width <= maxWidth) {
      break;
    }
    fontSize -= 1;
  }

  ctx.fillText(safeText, x, y);
}

function getVideoMetadata(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find((item) => item.codec_type === 'video');
      resolve({
        width: videoStream.width,
        height: videoStream.height,
        duration: metadata.format.duration,
        hasAudio: metadata.streams.some((item) => item.codec_type === 'audio'),
      });
    });
  });
}

function getOverlayLayout(orientation, width, height) {
  const isLandscape = orientation === 'landscape';
  const scaleX = isLandscape ? width / 1920 : width / 1080;
  const scaleY = isLandscape ? height / 1080 : height / 1920;
  const scale = Math.min(scaleX, scaleY);

  const logoSize = Math.round((isLandscape ? 220 : 186) * scale);
  const upperBarWidth = Math.round((isLandscape ? 520 : 390) * scaleX);
  const upperBarHeight = Math.round((isLandscape ? 56 : 50) * scaleY);
  const upperBarY = Math.round((isLandscape ? 64 : 52) * scaleY);
  const lowerBarY = upperBarY + upperBarHeight + Math.round((isLandscape ? 8 : 6) * scaleY);
  const lowerBarWidth = Math.round((isLandscape ? 610 : 455) * scaleX);
  const lowerBarHeight = Math.round((isLandscape ? 64 : 56) * scaleY);
  const logoX = Math.round((isLandscape ? 22 : 18) * scaleX);
  const logoY = Math.round(
    upperBarY + (upperBarHeight + (lowerBarY - upperBarY - upperBarHeight) + lowerBarHeight - logoSize) / 2
  );
  const upperBarX = logoX + Math.round(logoSize * (isLandscape ? 0.3 : 0.32));
  const barTextStartX = logoX + logoSize + Math.round((isLandscape ? 18 : 14) * scaleX);
  const designationTextMaxWidth = Math.max(90, upperBarWidth - (barTextStartX - upperBarX) - Math.round(24 * scaleX));
  const reporterTextMaxWidth = Math.max(120, lowerBarWidth - (barTextStartX - upperBarX) - Math.round(28 * scaleX));
  const crawlerHeight = Math.round((isLandscape ? 70 : 65) * scaleY);
  const crawlerBottomInset = Math.round((isLandscape ? 28 : 36) * scaleY);
  const crawlerY = height - crawlerHeight - crawlerBottomInset;
  const lineWidth = Math.round((isLandscape ? 8 : 6) * scaleX);

  return {
    width,
    height,
    scaleX,
    logoSize,
    logoX,
    logoY,
    upperBarX,
    upperBarY,
    upperBarWidth,
    upperBarHeight,
    lowerBarY,
    lowerBarWidth,
    lowerBarHeight,
    barTextStartX,
    designationTextMaxWidth,
    reporterTextMaxWidth,
    crawlerHeight,
    crawlerY,
    lineWidth,
  };
}

async function drawAssignedLogo(ctx, layout, colors, logoPath) {
  const centerX = layout.logoX + layout.logoSize / 2;
  const centerY = layout.logoY + layout.logoSize / 2;
  const radius = layout.logoSize / 2;

  if (logoPath && fs.existsSync(logoPath)) {
    const image = await loadImage(logoPath);
    const imageAspect = image.width / image.height;
    let drawWidth = layout.logoSize;
    let drawHeight = layout.logoSize;
    let drawX = layout.logoX;
    let drawY = layout.logoY;

    if (imageAspect > 1) {
      drawWidth = layout.logoSize * imageAspect;
      drawX = layout.logoX - (drawWidth - layout.logoSize) / 2;
    } else {
      drawHeight = layout.logoSize / imageAspect;
      drawY = layout.logoY - (drawHeight - layout.logoSize) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();

    ctx.lineWidth = Math.max(3, layout.logoSize * 0.04);
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  ctx.fillStyle = colors.logoBg;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${layout.logoSize * 0.3}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEWS', centerX, centerY);
}

async function createOverlayImage(overlayPath, settings, orientation, width, height, logoPath) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const layout = getOverlayLayout(orientation, width, height);
  const { colors, reporterName, textColors = {} } = settings;

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = colors.designationBar;
  ctx.fillRect(layout.upperBarX, layout.upperBarY, layout.upperBarWidth, layout.upperBarHeight);
  ctx.fillStyle = resolveCanvasTextColor(textColors.designation);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  drawFittedText(
    ctx,
    'संवाददाता',
    layout.barTextStartX,
    layout.upperBarY + layout.upperBarHeight / 2,
    layout.designationTextMaxWidth,
    layout.upperBarHeight * 0.6
  );

  ctx.fillStyle = colors.reporterBar;
  ctx.fillRect(layout.upperBarX, layout.lowerBarY, layout.lowerBarWidth, layout.lowerBarHeight);
  ctx.fillStyle = resolveCanvasTextColor(textColors.reporter);
  drawFittedText(
    ctx,
    reporterName || 'अनिल मोर्या',
    layout.barTextStartX,
    layout.lowerBarY + layout.lowerBarHeight / 2,
    layout.reporterTextMaxWidth,
    layout.lowerBarHeight * 0.55
  );

  ctx.fillStyle = colors.crawlerBar;
  ctx.fillRect(0, layout.crawlerY, width, layout.crawlerHeight);
  ctx.fillStyle = colors.crawlerLine;
  ctx.fillRect(0, layout.crawlerY, layout.lineWidth, layout.crawlerHeight);
  await drawAssignedLogo(ctx, layout, colors, logoPath);

  await fs.writeFile(overlayPath, canvas.toBuffer('image/png'));
  return layout;
}

async function processVideoWithOverlay(inputPath, outputPath, settings, orientation, videoInfo, logoPath) {
  const overlayPath = path.join(tempDir, `overlay_${uuidv4()}.png`);
  const layout = await createOverlayImage(
    overlayPath,
    settings,
    orientation,
    videoInfo.width,
    videoInfo.height,
    logoPath
  );
  const scrollSpeed = videoInfo.width / 8;
  const crawlerText = escapeFFmpegText(settings.crawlerText || 'आज की मुख्य हेडलाइंस यहां दिखेंगी...');
  const crawlerTextColor = resolveFFmpegTextColor(settings.textColors?.crawler);
  const drawTextFilter = `[base]drawtext=text='${crawlerText}':x=w-mod(t*${scrollSpeed}\\,w+text_w):y=${layout.crawlerY + layout.crawlerHeight / 2}-text_h/2:fontsize=${layout.crawlerHeight * 0.5}:fontcolor=${crawlerTextColor}${fontFileClause(devanagariFont)}[vout]`;

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .input(overlayPath)
      .complexFilter(['[0:v][1:v]overlay=0:0[base]', drawTextFilter])
      .outputOptions([
        '-map [vout]',
        '-map 0:a?',
        '-c:v libx264',
        '-preset veryfast',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 192k',
        '-ar 48000',
        '-ac 2',
        '-movflags +faststart',
      ])
      .output(outputPath)
      .on('end', async () => {
        await fs.remove(overlayPath).catch(() => {});
        resolve(outputPath);
      })
      .on('error', async (err, _stdout, stderr) => {
        await fs.remove(overlayPath).catch(() => {});
        reject(new Error(stderr || err.message));
      })
      .run();
  });
}

async function normalizeVideoSegment(inputPath, outputPath, targetWidth, targetHeight) {
  const metadata = await getVideoMetadata(inputPath);
  const videoFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p`;

  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath);

    if (!metadata.hasAudio) {
      command.input('anullsrc=channel_layout=stereo:sample_rate=48000').inputFormat('lavfi');
      command
        .complexFilter([`[0:v]${videoFilter}[vout]`])
        .outputOptions([
          '-map [vout]',
          '-map 1:a',
          '-shortest',
          '-c:v libx264',
          '-preset veryfast',
          '-pix_fmt yuv420p',
          '-r 30',
          '-c:a aac',
          '-b:a 192k',
          '-ar 48000',
          '-ac 2',
          '-movflags +faststart',
        ]);
    } else {
      command
        .videoFilters(videoFilter)
        .outputOptions([
          '-c:v libx264',
          '-preset veryfast',
          '-pix_fmt yuv420p',
          '-r 30',
          '-c:a aac',
          '-b:a 192k',
          '-ar 48000',
          '-ac 2',
          '-movflags +faststart',
        ]);
    }

    command
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err, _stdout, stderr) => reject(new Error(stderr || err.message)))
      .run();
  });
}

async function concatNormalizedVideos(segmentPaths, outputPath) {
  const listFile = path.join(tempDir, `concat_${uuidv4()}.txt`);
  const listContents = segmentPaths
    .map((segmentPath) => `file '${segmentPath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n');

  await fs.writeFile(listFile, listContents);

  return new Promise((resolve, reject) => {
    ffmpeg(listFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', async () => {
        await fs.remove(listFile).catch(() => {});
        resolve(outputPath);
      })
      .on('error', async (err, _stdout, stderr) => {
        await fs.remove(listFile).catch(() => {});
        reject(new Error(stderr || err.message));
      })
      .run();
  });
}

async function processVideoComposition(inputPath, outputPath, settings, orientation, videoInfo, userMedia) {
  const tempFiles = [];
  const processedMainPath = path.join(tempDir, `processed_main_${uuidv4()}.mp4`);
  tempFiles.push(processedMainPath);

  try {
    await processVideoWithOverlay(inputPath, processedMainPath, settings, orientation, videoInfo, userMedia.logoPath);

    const includeIntro = Boolean(settings.enableIntro && userMedia.introVideoPath && fs.existsSync(userMedia.introVideoPath));
    const includeOutro = Boolean(settings.enableOutro && userMedia.outroVideoPath && fs.existsSync(userMedia.outroVideoPath));

    if (!includeIntro && !includeOutro) {
      await fs.move(processedMainPath, outputPath, { overwrite: true });
      tempFiles.pop();
      return outputPath;
    }

    const segmentPaths = [];

    if (includeIntro) {
      const normalizedIntroPath = path.join(tempDir, `intro_segment_${uuidv4()}.mp4`);
      tempFiles.push(normalizedIntroPath);
      await normalizeVideoSegment(userMedia.introVideoPath, normalizedIntroPath, videoInfo.width, videoInfo.height);
      segmentPaths.push(normalizedIntroPath);
    }

    const normalizedMainPath = path.join(tempDir, `main_segment_${uuidv4()}.mp4`);
    tempFiles.push(normalizedMainPath);
    await normalizeVideoSegment(processedMainPath, normalizedMainPath, videoInfo.width, videoInfo.height);
    segmentPaths.push(normalizedMainPath);

    if (includeOutro) {
      const normalizedOutroPath = path.join(tempDir, `outro_segment_${uuidv4()}.mp4`);
      tempFiles.push(normalizedOutroPath);
      await normalizeVideoSegment(userMedia.outroVideoPath, normalizedOutroPath, videoInfo.width, videoInfo.height);
      segmentPaths.push(normalizedOutroPath);
    }

    await concatNormalizedVideos(segmentPaths, outputPath);
    return outputPath;
  } finally {
    await removeFiles(tempFiles);
  }
}

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const sessions = readSessions();
    const session = sessions.find((item) => item.token === token);

    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    const users = readUsers();
    const user = users.find((item) => item.id === session.userId);

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.sessionToken = token;
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const users = readUsers();
  const user = users.find((item) => item.username.toLowerCase() === String(username).trim().toLowerCase());

  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const sessions = readSessions().filter((item) => item.userId !== user.id);
  const token = uuidv4();
  sessions.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
  });
  writeSessions(sessions);

  res.json({
    token,
    user: sanitizeUser(req, user),
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    user: sanitizeUser(req, req.user),
  });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const sessions = readSessions().filter((item) => item.token !== req.sessionToken);
  writeSessions(sessions);
  res.json({ success: true });
});

app.get('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const users = readUsers();
  res.json({
    users: users.map((user) => sanitizeUser(req, user)),
  });
});

app.post(
  '/api/admin/users',
  authMiddleware,
  adminOnly,
  adminAssetUpload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'introVideo', maxCount: 1 },
    { name: 'outroVideo', maxCount: 1 },
  ]),
  async (req, res) => {
    const uploadedFiles = []
      .concat(req.files?.logo || [])
      .concat(req.files?.introVideo || [])
      .concat(req.files?.outroVideo || []);

    try {
      const { username, password, displayName } = req.body || {};
      const logoFile = req.files?.logo?.[0] || null;
      const introFile = req.files?.introVideo?.[0] || null;
      const outroFile = req.files?.outroVideo?.[0] || null;

      if (!username || !password || !displayName) {
        await removeFiles(uploadedFiles.map((file) => file.path));
        res.status(400).json({ error: 'Username, display name, and password are required' });
        return;
      }

      if (!logoFile) {
        await removeFiles(uploadedFiles.map((file) => file.path));
        res.status(400).json({ error: 'Logo file is required for new users' });
        return;
      }

      const users = readUsers();
      const normalizedUsername = String(username).trim().toLowerCase();

      if (users.some((user) => user.username.toLowerCase() === normalizedUsername)) {
        await removeFiles(uploadedFiles.map((file) => file.path));
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      const user = {
        id: uuidv4(),
        username: normalizedUsername,
        displayName: String(displayName).trim(),
        role: 'user',
        passwordHash: createPasswordHash(String(password)),
        logoFileName: logoFile.filename,
        introVideoFileName: introFile ? introFile.filename : null,
        outroVideoFileName: outroFile ? outroFile.filename : null,
        createdAt: new Date().toISOString(),
      };

      users.push(user);
      writeUsers(users);

      res.status(201).json({
        user: sanitizeUser(req, user),
      });
    } catch (error) {
      await removeFiles(uploadedFiles.map((file) => file.path));
      res.status(500).json({ error: 'Failed to create user', details: error.message });
    }
  }
);

app.post('/api/upload', authMiddleware, videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No video file uploaded' });
      return;
    }

    const metadata = await getVideoMetadata(req.file.path);
    const orientation = metadata.width > metadata.height ? 'landscape' : 'portrait';

    res.json({
      success: true,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      orientation,
      dimensions: {
        width: metadata.width,
        height: metadata.height,
      },
      duration: metadata.duration,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process video', details: error.message });
  }
});

app.post('/api/preview', authMiddleware, async (req, res) => {
  try {
    const { settings, orientation, width, height } = req.body || {};

    if (!settings || !orientation || !width || !height) {
      res.status(400).json({ error: 'Missing preview parameters' });
      return;
    }

    const overlayPath = path.join(tempDir, `preview_${uuidv4()}.png`);
    const logoPath = req.user.logoFileName ? path.join(logosDir, req.user.logoFileName) : null;
    await createOverlayImage(overlayPath, settings, orientation, width, height, logoPath);

    res.sendFile(overlayPath, async (err) => {
      await fs.remove(overlayPath).catch(() => {});
      if (err) {
        console.error('Preview send error:', err);
      }
    });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: 'Failed to generate preview', details: error.message });
  }
});

app.post('/api/process', authMiddleware, async (req, res) => {
  try {
    const { fileName, settings } = req.body || {};

    if (!fileName || !settings) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    const inputPath = path.join(uploadsDir, fileName);
    if (!fs.existsSync(inputPath)) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    const metadata = await getVideoMetadata(inputPath);
    const orientation = metadata.width > metadata.height ? 'landscape' : 'portrait';
    const outputFileName = `processed_${uuidv4()}.mp4`;
    const outputPath = path.join(outputsDir, outputFileName);

    await processVideoComposition(inputPath, outputPath, settings, orientation, metadata, {
      logoPath: req.user.logoFileName ? path.join(logosDir, req.user.logoFileName) : null,
      introVideoPath: req.user.introVideoFileName ? path.join(assignedVideosDir, req.user.introVideoFileName) : null,
      outroVideoPath: req.user.outroVideoFileName ? path.join(assignedVideosDir, req.user.outroVideoFileName) : null,
    });

    res.json({
      success: true,
      outputFile: outputFileName,
      downloadUrl: `/outputs/${outputFileName}`,
    });
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ error: 'Failed to process video', details: error.message });
  }
});

app.get('/api/download/:filename', authMiddleware, (req, res) => {
  const filePath = path.join(outputsDir, req.params.filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.download(filePath);
});

app.post('/api/cleanup', async (_req, res) => {
  try {
    const maxAge = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const cleanupDir = async (dir) => {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file === '.gitkeep') {
          continue;
        }

        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.remove(filePath);
        }
      }
    };

    await cleanupDir(uploadsDir);
    await cleanupDir(outputsDir);
    await cleanupDir(tempDir);

    res.json({ success: true, message: 'Cleanup completed' });
  } catch (error) {
    res.status(500).json({ error: 'Cleanup failed', details: error.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

ensureDefaultAdmin();

app.listen(PORT, () => {
  console.log(`NewsOverlay Pro Server running on port ${PORT}`);
  console.log(`Upload directory: ${uploadsDir}`);
  console.log(`Output directory: ${outputsDir}`);
  console.log(`Assigned videos directory: ${assignedVideosDir}`);
  console.log(`Default admin username: ${adminUsername}`);
});

module.exports = app;
