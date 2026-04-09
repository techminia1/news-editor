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
const PImage = require('pureimage');
const path = require('path');
const fs = require('fs-extra');
const { MongoClient } = require('mongodb');
const { v2: cloudinary } = require('cloudinary');
const { v4: uuidv4 } = require('uuid');

let ffmpegReady = false;
let ffmpegInitError = null;

try {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
  ffmpegReady = true;
} catch (error) {
  ffmpegInitError = error;
  console.error(`FFmpeg initialization failed: ${error.message}`);
}

const app = express();
const PORT = process.env.PORT || 5000;
const defaultStorageRoot = process.env.VERCEL
  ? path.join('/tmp', 'newsoverlay-pro')
  : __dirname;
const storageRoot = process.env.DATA_ROOT
  ? path.resolve(process.cwd(), process.env.DATA_ROOT)
  : defaultStorageRoot;

const uploadsDir = path.join(storageRoot, 'uploads');
const outputsDir = path.join(storageRoot, 'outputs');
const tempDir = path.join(storageRoot, 'temp');
const logosDir = path.join(storageRoot, 'logos');
const assignedVideosDir = path.join(storageRoot, 'assigned-videos');
const dataDir = path.join(storageRoot, 'data');
const usersFile = path.join(dataDir, 'users.json');

for (const dir of [uploadsDir, outputsDir, tempDir, logosDir, assignedVideosDir, dataDir]) {
  fs.ensureDirSync(dir);
}

if (!fs.existsSync(usersFile)) {
  fs.writeJsonSync(usersFile, [], { spaces: 2 });
}

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const sessionSecret =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`${adminUsername}:${adminPassword}`).digest('hex');
const sessionTtlMs = Number(process.env.SESSION_TTL_HOURS || 24 * 7) * 60 * 60 * 1000;
const mongoEnabled = Boolean(process.env.MONGODB_URI);
const cloudinaryEnabled = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);
const mongoDbName = process.env.MONGODB_DB_NAME || 'newsoverlay_pro';
const allowedCorsOrigins = String(process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const localAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
let databasePromise = null;

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (localAllowedOrigins.includes(origin) || allowedCorsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    if (process.env.NODE_ENV !== 'production' && allowedCorsOrigins.length === 0) {
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
    logo: normalizeMediaAsset(user.logo, user.logoFileName, 'image', 'logo'),
    introVideo: normalizeMediaAsset(user.introVideo, user.introVideoFileName, 'video', 'assignedVideo'),
    outroVideo: normalizeMediaAsset(user.outroVideo, user.outroVideoFileName, 'video', 'assignedVideo'),
  };
}

function normalizeMediaAsset(asset, legacyFileName, resourceType, kind) {
  if (asset?.secureUrl || asset?.localFileName) {
    return {
      provider: asset.provider || (asset.secureUrl ? 'cloudinary' : 'local'),
      publicId: asset.publicId || null,
      secureUrl: asset.secureUrl || null,
      resourceType: asset.resourceType || resourceType,
      kind: asset.kind || kind,
      format: asset.format || null,
      originalName: asset.originalName || null,
      localFileName: asset.localFileName || null,
      bytes: asset.bytes || null,
    };
  }

  if (!legacyFileName) {
    return null;
  }

  return {
    provider: 'local',
    publicId: null,
    secureUrl: null,
    resourceType,
    kind,
    format: path.extname(legacyFileName).replace('.', '') || null,
    originalName: legacyFileName,
    localFileName: legacyFileName,
    bytes: null,
  };
}

function getLocalAssetBaseDir(kind) {
  if (kind === 'logo') {
    return logosDir;
  }

  if (kind === 'assignedVideo') {
    return assignedVideosDir;
  }

  if (kind === 'upload') {
    return uploadsDir;
  }

  if (kind === 'output') {
    return outputsDir;
  }

  return storageRoot;
}

function getLocalAssetPath(asset) {
  if (!asset?.localFileName) {
    return null;
  }

  return path.join(getLocalAssetBaseDir(asset.kind), asset.localFileName);
}

function readUsers() {
  return (fs.readJsonSync(usersFile, { throws: false }) || []).map(normalizeUserRecord);
}

function writeUsers(users) {
  fs.writeJsonSync(usersFile, users, { spaces: 2 });
}

async function getDatabase() {
  if (!mongoEnabled) {
    return null;
  }

  if (!databasePromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    databasePromise = client.connect().then((connectedClient) => connectedClient.db(mongoDbName));
  }

  return databasePromise;
}

async function getCollection(name) {
  const database = await getDatabase();
  if (!database) {
    return null;
  }

  return database.collection(name);
}

async function listUsers() {
  if (!mongoEnabled) {
    return readUsers();
  }

  const collection = await getCollection('users');
  return (await collection.find({}).sort({ createdAt: -1 }).toArray()).map(normalizeUserRecord);
}

async function findUserById(id) {
  if (!mongoEnabled) {
    return readUsers().find((user) => user.id === id) || null;
  }

  const collection = await getCollection('users');
  const user = await collection.findOne({ id });
  return user ? normalizeUserRecord(user) : null;
}

async function findUserByUsername(username) {
  const normalizedUsername = String(username || '').trim().toLowerCase();

  if (!mongoEnabled) {
    return readUsers().find((user) => user.username.toLowerCase() === normalizedUsername) || null;
  }

  const collection = await getCollection('users');
  const user = await collection.findOne({ username: normalizedUsername });
  return user ? normalizeUserRecord(user) : null;
}

async function insertUser(user) {
  if (!mongoEnabled) {
    const users = readUsers();
    users.push(user);
    writeUsers(users);
    return user;
  }

  const collection = await getCollection('users');
  await collection.insertOne(user);
  return normalizeUserRecord(user);
}

async function insertUploadRecord(record) {
  if (!mongoEnabled) {
    return record;
  }

  const collection = await getCollection('uploads');
  await collection.insertOne(record);
  return record;
}

async function findUploadRecordForUser(ownerUserId, id) {
  if (!mongoEnabled) {
    return null;
  }

  const collection = await getCollection('uploads');
  return collection.findOne({ id, ownerUserId });
}

async function insertOutputRecord(record) {
  if (!mongoEnabled) {
    return record;
  }

  const collection = await getCollection('outputs');
  await collection.insertOne(record);
  return record;
}

async function findOutputRecordForUser(ownerUserId, id) {
  if (!mongoEnabled) {
    return null;
  }

  const collection = await getCollection('outputs');
  return collection.findOne({ id, ownerUserId });
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

function ensureRemoteStorageConfigured() {
  if (!mongoEnabled || !cloudinaryEnabled) {
    return false;
  }

  return true;
}

function createSessionToken(userId) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      exp: Date.now() + sessionTtlMs,
    })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  const [payload, signature] = String(token || '').split('.');

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!decoded?.userId || !decoded?.exp || decoded.exp < Date.now()) {
    return null;
  }

  return decoded;
}

function buildMediaUrl(req, asset) {
  if (!asset) {
    return null;
  }

  if (asset.secureUrl) {
    return asset.secureUrl;
  }

  if (asset.localFileName) {
    const routePrefix = asset.kind === 'logo' ? '/logos' : asset.kind === 'assignedVideo' ? '/assigned-videos' : null;
    if (!routePrefix) {
      return null;
    }

    return `${req.protocol}://${req.get('host')}${routePrefix}/${asset.localFileName}`;
  }

  return null;
}

function sanitizeUser(req, user) {
  const normalizedUser = normalizeUserRecord(user);
  return {
    id: normalizedUser.id,
    username: normalizedUser.username,
    displayName: normalizedUser.displayName,
    role: normalizedUser.role,
    logoUrl: buildMediaUrl(req, normalizedUser.logo),
    introVideoUrl: buildMediaUrl(req, normalizedUser.introVideo),
    outroVideoUrl: buildMediaUrl(req, normalizedUser.outroVideo),
    createdAt: normalizedUser.createdAt,
  };
}

async function uploadFileToCloudinary(filePath, options) {
  const { folder, resourceType, publicId } = options;

  if (resourceType === 'video') {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_chunked_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'video',
          overwrite: true,
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        }
      );

      fs.createReadStream(filePath)
        .on('error', reject)
        .pipe(uploadStream)
        .on('error', reject);
    });
  }

  return cloudinary.uploader.upload(filePath, {
    folder,
    public_id: publicId,
    resource_type: 'image',
    overwrite: true,
  });
}

async function storeUploadedMedia(file, kind, resourceType, folder, options = {}) {
  const { removeLocalFile = true } = options;

  if (!file) {
    return null;
  }

  if (ensureRemoteStorageConfigured()) {
    try {
      const result = await uploadFileToCloudinary(file.path, {
        folder,
        resourceType,
        publicId: uuidv4(),
      });

      return {
        provider: 'cloudinary',
        publicId: result.public_id,
        secureUrl: result.secure_url,
        resourceType,
        kind,
        format: result.format || path.extname(file.originalname).replace('.', '') || null,
        originalName: file.originalname,
        localFileName: null,
        bytes: result.bytes || null,
      };
    } finally {
      if (removeLocalFile) {
        await fs.remove(file.path).catch(() => {});
      }
    }
  }

  return {
    provider: 'local',
    publicId: null,
    secureUrl: null,
    resourceType,
    kind,
    format: path.extname(file.originalname).replace('.', '') || null,
    originalName: file.originalname,
    localFileName: file.filename,
    bytes: file.size || null,
  };
}

async function materializeMediaAsset(asset, fallbackExt) {
  if (!asset) {
    return null;
  }

  if (asset.provider !== 'cloudinary' || !asset.secureUrl) {
    return getLocalAssetPath(asset);
  }

  const extension = asset.format || fallbackExt || (asset.resourceType === 'image' ? 'png' : 'mp4');
  const targetPath = path.join(tempDir, `${asset.kind || 'asset'}_${uuidv4()}.${extension}`);
  const response = await fetch(asset.secureUrl);

  if (!response.ok) {
    throw new Error(`Failed to download media asset: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

async function ensureDefaultAdmin() {
  const existingAdmin = mongoEnabled
    ? (await getCollection('users')).findOne({ role: 'admin' })
    : readUsers().find((user) => user.role === 'admin');

  if (existingAdmin) {
    return;
  }

  await insertUser({
    id: uuidv4(),
    username: adminUsername,
    displayName: 'Administrator',
    role: 'admin',
    passwordHash: createPasswordHash(adminPassword),
    logo: null,
    introVideo: null,
    outroVideo: null,
    logoFileName: null,
    introVideoFileName: null,
    outroVideoFileName: null,
    createdAt: new Date().toISOString(),
  });
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
let canvasModule;

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

function ensureFfmpegReady() {
  if (!ffmpegReady) {
    throw new Error(
      ffmpegInitError?.message || 'FFmpeg is not available in the current runtime environment'
    );
  }
}

function getCanvasModule() {
  if (canvasModule !== undefined) {
    return canvasModule;
  }

  try {
    canvasModule = require('canvas');
  } catch (error) {
    console.warn(`Canvas unavailable, falling back to PureImage: ${error.message}`);
    canvasModule = null;
  }

  return canvasModule;
}

async function removeFiles(paths) {
  await Promise.all(
    (paths || []).filter(Boolean).map((filePath) => fs.remove(filePath).catch(() => {}))
  );
}

function estimateTextWidth(text, fontSize) {
  const safeText = String(text || '').trim();
  const devanagariChars = (safeText.match(/[\u0900-\u097F]/g) || []).length;
  const latinChars = safeText.length - devanagariChars;
  return devanagariChars * fontSize * 0.9 + latinChars * fontSize * 0.62;
}

function getFittedFontSize(text, maxWidth, baseFontSize) {
  const safeText = String(text || '').trim();
  const minFontSize = Math.max(14, Math.round(baseFontSize * 0.52));
  let fontSize = Math.round(baseFontSize);

  while (fontSize > minFontSize && estimateTextWidth(safeText, fontSize) > maxWidth) {
    fontSize -= 1;
  }

  return fontSize;
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
  ensureFfmpegReady();
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

async function drawAssignedLogoWithCanvas(ctx, layout, colors, logoPath, loadImage) {
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

async function loadPureImageBitmap(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  let decoder = null;

  if (extension === '.png') {
    decoder = PImage.decodePNGFromStream;
  } else if (extension === '.jpg' || extension === '.jpeg') {
    decoder = PImage.decodeJPEGFromStream;
  }

  if (!decoder) {
    return null;
  }

  const stream = fs.createReadStream(filePath);

  try {
    return await decoder(stream);
  } finally {
    stream.destroy();
  }
}

async function drawAssignedLogoWithPureImage(ctx, layout, colors, logoPath) {
  const centerX = layout.logoX + layout.logoSize / 2;
  const centerY = layout.logoY + layout.logoSize / 2;
  const radius = layout.logoSize / 2;

  if (logoPath && fs.existsSync(logoPath)) {
    const image = await loadPureImageBitmap(logoPath).catch(() => null);

    if (image) {
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
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, false);
      ctx.clip();
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      ctx.restore();

      ctx.lineWidth = Math.max(3, layout.logoSize * 0.04);
      ctx.strokeStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - ctx.lineWidth / 2, 0, Math.PI * 2, false);
      ctx.stroke();
      return;
    }
  }

  ctx.fillStyle = colors.logoBg;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, false);
  ctx.fill();

  ctx.lineWidth = Math.max(3, layout.logoSize * 0.04);
  ctx.strokeStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - ctx.lineWidth / 2, 0, Math.PI * 2, false);
  ctx.stroke();
}

async function createOverlayImageWithCanvas(canvasLib, overlayPath, settings, orientation, width, height, logoPath) {
  const canvas = canvasLib.createCanvas(width, height);
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
  await drawAssignedLogoWithCanvas(ctx, layout, colors, logoPath, canvasLib.loadImage);

  await fs.writeFile(overlayPath, canvas.toBuffer('image/png'));
  return layout;
}

async function createOverlayImageWithPureImage(overlayPath, settings, orientation, width, height, logoPath) {
  const image = PImage.make(width, height);
  const ctx = image.getContext('2d');
  const layout = getOverlayLayout(orientation, width, height);
  const { colors } = settings;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.designationBar;
  ctx.fillRect(layout.upperBarX, layout.upperBarY, layout.upperBarWidth, layout.upperBarHeight);
  ctx.fillStyle = colors.reporterBar;
  ctx.fillRect(layout.upperBarX, layout.lowerBarY, layout.lowerBarWidth, layout.lowerBarHeight);
  ctx.fillStyle = colors.crawlerBar;
  ctx.fillRect(0, layout.crawlerY, width, layout.crawlerHeight);
  ctx.fillStyle = colors.crawlerLine;
  ctx.fillRect(0, layout.crawlerY, layout.lineWidth, layout.crawlerHeight);
  await drawAssignedLogoWithPureImage(ctx, layout, colors, logoPath);

  await PImage.encodePNGToStream(image, fs.createWriteStream(overlayPath));
  return layout;
}

async function createOverlayImage(overlayPath, settings, orientation, width, height, logoPath) {
  const availableCanvasModule = getCanvasModule();

  if (availableCanvasModule) {
    return createOverlayImageWithCanvas(
      availableCanvasModule,
      overlayPath,
      settings,
      orientation,
      width,
      height,
      logoPath
    );
  }

  return createOverlayImageWithPureImage(overlayPath, settings, orientation, width, height, logoPath);
}

async function processVideoWithOverlay(inputPath, outputPath, settings, orientation, videoInfo, logoPath) {
  ensureFfmpegReady();
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
  const designationText = 'संवाददाता';
  const reporterText = settings.reporterName || 'अनिल मोर्या';
  const crawlerText = escapeFFmpegText(settings.crawlerText || 'आज की मुख्य हेडलाइंस यहां दिखेंगी...');
  const designationTextColor = resolveFFmpegTextColor(settings.textColors?.designation);
  const reporterTextColor = resolveFFmpegTextColor(settings.textColors?.reporter);
  const crawlerTextColor = resolveFFmpegTextColor(settings.textColors?.crawler);
  const designationFontSize = getFittedFontSize(
    designationText,
    layout.designationTextMaxWidth,
    layout.upperBarHeight * 0.6
  );
  const reporterFontSize = getFittedFontSize(
    reporterText,
    layout.reporterTextMaxWidth,
    layout.lowerBarHeight * 0.55
  );
  const designationTextFilter = `[base]drawtext=text='${escapeFFmpegText(designationText)}':x=${layout.barTextStartX}:y=${layout.upperBarY + layout.upperBarHeight / 2}-text_h/2:fontsize=${designationFontSize}:fontcolor=${designationTextColor}${fontFileClause(devanagariFont)}[designation]`;
  const reporterTextFilter = `[designation]drawtext=text='${escapeFFmpegText(reporterText)}':x=${layout.barTextStartX}:y=${layout.lowerBarY + layout.lowerBarHeight / 2}-text_h/2:fontsize=${reporterFontSize}:fontcolor=${reporterTextColor}${fontFileClause(devanagariFont)}[reporter]`;
  const crawlerTextFilter = `[reporter]drawtext=text='${crawlerText}':x=w-mod(t*${scrollSpeed}\\,w+text_w):y=${layout.crawlerY + layout.crawlerHeight / 2}-text_h/2:fontsize=${layout.crawlerHeight * 0.5}:fontcolor=${crawlerTextColor}${fontFileClause(devanagariFont)}[vout]`;

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .input(overlayPath)
      .complexFilter([
        '[0:v][1:v]overlay=0:0[base]',
        designationTextFilter,
        reporterTextFilter,
        crawlerTextFilter,
      ])
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
  ensureFfmpegReady();
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
  ensureFfmpegReady();
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

    const session = verifySessionToken(token);
    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    const user = await findUserById(session.userId);

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
  void (async () => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const user = await findUserByUsername(username);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const token = createSessionToken(user.id);

  res.json({
    token,
    user: sanitizeUser(req, user),
  });
  })().catch((error) => {
    res.status(500).json({ error: 'Login failed', details: error.message });
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    user: sanitizeUser(req, req.user),
  });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  res.json({ success: true });
});

app.get('/', (_req, res) => {
  res.json({
    service: 'NewsOverlay Pro Backend',
    status: 'ok',
    health: '/health',
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    storageRoot,
    ffmpegReady,
    ffmpegInitError: ffmpegInitError?.message || null,
    mongoEnabled,
    cloudinaryEnabled,
    directories: {
      uploads: fs.existsSync(uploadsDir),
      outputs: fs.existsSync(outputsDir),
      temp: fs.existsSync(tempDir),
      logos: fs.existsSync(logosDir),
      assignedVideos: fs.existsSync(assignedVideosDir),
      data: fs.existsSync(dataDir),
    },
  });
});

app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  const users = await listUsers();
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

      const normalizedUsername = String(username).trim().toLowerCase();

      if (await findUserByUsername(normalizedUsername)) {
        await removeFiles(uploadedFiles.map((file) => file.path));
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      const user = normalizeUserRecord({
        id: uuidv4(),
        username: normalizedUsername,
        displayName: String(displayName).trim(),
        role: 'user',
        passwordHash: createPasswordHash(String(password)),
        logo: await storeUploadedMedia(logoFile, 'logo', 'image', `newsoverlay-pro/users/${normalizedUsername}/logos`),
        introVideo: await storeUploadedMedia(
          introFile,
          'assignedVideo',
          'video',
          `newsoverlay-pro/users/${normalizedUsername}/intro`
        ),
        outroVideo: await storeUploadedMedia(
          outroFile,
          'assignedVideo',
          'video',
          `newsoverlay-pro/users/${normalizedUsername}/outro`
        ),
        logoFileName: null,
        introVideoFileName: null,
        outroVideoFileName: null,
        createdAt: new Date().toISOString(),
      });

      await insertUser(user);

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

    const metadataPromise = getVideoMetadata(req.file.path);
    const remoteUploadPromise = ensureRemoteStorageConfigured()
      ? storeUploadedMedia(
          req.file,
          'upload',
          'video',
          `newsoverlay-pro/users/${req.user.id}/uploads`,
          { removeLocalFile: false }
        )
      : Promise.resolve(null);

    const metadata = await metadataPromise;
    const orientation = metadata.width > metadata.height ? 'landscape' : 'portrait';
    let fileToken = req.file.filename;
    let videoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    if (ensureRemoteStorageConfigured()) {
      const media = await remoteUploadPromise;
      const record = {
        id: uuidv4(),
        ownerUserId: req.user.id,
        originalName: req.file.originalname,
        media,
        createdAt: new Date().toISOString(),
      };
      await insertUploadRecord(record);
      fileToken = record.id;
      videoUrl = media.secureUrl;
      await fs.remove(req.file.path).catch(() => {});
    }

    res.json({
      success: true,
      fileName: fileToken,
      originalName: req.file.originalname,
      orientation,
      videoUrl,
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
    const logoPath = await materializeMediaAsset(req.user.logo, 'png');
    await createOverlayImage(overlayPath, settings, orientation, width, height, logoPath);

    res.sendFile(overlayPath, async (err) => {
      await removeFiles([overlayPath, logoPath && logoPath.startsWith(tempDir) ? logoPath : null]);
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

    let inputPath = path.join(uploadsDir, fileName);
    let tempInputPath = null;

    if (ensureRemoteStorageConfigured()) {
      const uploadRecord = await findUploadRecordForUser(req.user.id, fileName);
      if (!uploadRecord?.media) {
        res.status(404).json({ error: 'Video file not found' });
        return;
      }

      tempInputPath = await materializeMediaAsset(uploadRecord.media, 'mp4');
      inputPath = tempInputPath;
    } else if (!fs.existsSync(inputPath)) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    const metadata = await getVideoMetadata(inputPath);
    const orientation = metadata.width > metadata.height ? 'landscape' : 'portrait';
    const outputFileName = `processed_${uuidv4()}.mp4`;
    const outputPath = path.join(outputsDir, outputFileName);
    const logoPath = await materializeMediaAsset(req.user.logo, 'png');
    const introVideoPath = await materializeMediaAsset(req.user.introVideo, 'mp4');
    const outroVideoPath = await materializeMediaAsset(req.user.outroVideo, 'mp4');

    await processVideoComposition(inputPath, outputPath, settings, orientation, metadata, {
      logoPath,
      introVideoPath,
      outroVideoPath,
    });

    if (ensureRemoteStorageConfigured()) {
      const outputMedia = await storeUploadedMedia(
        {
          path: outputPath,
          originalname: outputFileName,
          filename: outputFileName,
          size: (await fs.stat(outputPath)).size,
        },
        'output',
        'video',
        `newsoverlay-pro/users/${req.user.id}/outputs`
      );
      const outputRecord = {
        id: uuidv4(),
        ownerUserId: req.user.id,
        originalName: outputFileName,
        media: outputMedia,
        createdAt: new Date().toISOString(),
      };
      await insertOutputRecord(outputRecord);
      await removeFiles([
        tempInputPath,
        logoPath && logoPath.startsWith(tempDir) ? logoPath : null,
        introVideoPath && introVideoPath.startsWith(tempDir) ? introVideoPath : null,
        outroVideoPath && outroVideoPath.startsWith(tempDir) ? outroVideoPath : null,
      ]);

      res.json({
        success: true,
        outputFile: outputRecord.id,
        downloadUrl: `/api/download/${outputRecord.id}`,
      });
      return;
    }

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

app.get('/api/download/:filename', authMiddleware, async (req, res) => {
  if (ensureRemoteStorageConfigured()) {
    const outputRecord = await findOutputRecordForUser(req.user.id, req.params.filename);

    if (!outputRecord?.media?.secureUrl) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const response = await fetch(outputRecord.media.secureUrl);

    if (!response.ok) {
      res.status(502).json({ error: 'Failed to fetch processed file' });
      return;
    }

    const extension = outputRecord.media.format || 'mp4';
    const downloadName = `${outputRecord.originalName || outputRecord.id}.${extension}`.replace(/\.+/, '.');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.send(buffer);
    return;
  }

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

const startupPromise = ensureDefaultAdmin().catch((error) => {
  console.error(`Startup initialization failed: ${error.message}`);
});

if (!process.env.VERCEL) {
  startupPromise.then(() => {
    app.listen(PORT, () => {
      console.log(`NewsOverlay Pro Server running on port ${PORT}`);
      console.log(`Storage root: ${storageRoot}`);
      console.log(`Upload directory: ${uploadsDir}`);
      console.log(`Output directory: ${outputsDir}`);
      console.log(`Assigned videos directory: ${assignedVideosDir}`);
      console.log(`Default admin username: ${adminUsername}`);
      console.log(`MongoDB enabled: ${mongoEnabled}`);
      console.log(`Cloudinary enabled: ${cloudinaryEnabled}`);
    });
  });
}

module.exports = app;
