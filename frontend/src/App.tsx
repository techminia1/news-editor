import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useDropzone } from 'react-dropzone';
import { Film, LogOut, Settings, Users } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminPanel } from '@/components/AdminPanel';
import { EditorPanel } from '@/components/EditorPanel';
import { LoginScreen } from '@/components/LoginScreen';
import {
  API_BASE_URL,
  LANDSCAPE_DEFAULTS,
  PORTRAIT_DEFAULTS,
  TOKEN_STORAGE_KEY,
  createInitialSettings,
  getErrorMessage,
  type AdminCreateUserState,
  type AuthUser,
  type ColorSettings,
  type OverlaySettings,
  type OverlayTextColor,
  type TextColorSettings,
  type VideoInfo,
} from '@/lib/app-models';
import './App.css';

function getUserSettings(user?: AuthUser | null) {
  return createInitialSettings(user?.displayName, {
    hasIntro: Boolean(user?.introVideoUrl),
    hasOutro: Boolean(user?.outroVideoUrl),
  });
}

function resolveTextColor(color: OverlayTextColor) {
  return color === 'black' ? '#000000' : '#FFFFFF';
}

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  baseFontSize: number
) {
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

function getPreviewLayout(uploadedVideo: VideoInfo) {
  const { width, height } = uploadedVideo.dimensions;
  const isLandscape = uploadedVideo.orientation === 'landscape';
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
    scaleX,
  };
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || '');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [activeView, setActiveView] = useState<'editor' | 'admin'>('editor');
  const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState<AdminCreateUserState>({ username: '', displayName: '', password: '' });
  const [newUserLogo, setNewUserLogo] = useState<File | null>(null);
  const [newUserIntroVideo, setNewUserIntroVideo] = useState<File | null>(null);
  const [newUserOutroVideo, setNewUserOutroVideo] = useState<File | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<VideoInfo | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [settings, setSettings] = useState<OverlaySettings>(createInitialSettings());
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [outputVideo, setOutputVideo] = useState('');
  const [error, setError] = useState('');
  const [logoVersion, setLogoVersion] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const createUserLogoInputRef = useRef<HTMLInputElement>(null);
  const createUserIntroInputRef = useRef<HTMLInputElement>(null);
  const createUserOutroInputRef = useRef<HTMLInputElement>(null);
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken('');
    setAuthUser(null);
    setAdminUsers([]);
    setActiveView('editor');
    setUploadedVideo(null);
    setVideoUrl('');
    setOutputVideo('');
    setError('');
    setSettings(createInitialSettings());
  }, []);

  const loadAdminUsers = useCallback(
    async (sessionToken = token) => {
      const response = await axios.get(`${API_BASE_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      setAdminUsers(response.data.users || []);
    },
    [token]
  );

  useEffect(() => {
    if (!token) {
      setAuthLoading(false);
      return;
    }

    let cancelled = false;

    const restoreSession = async () => {
      try {
        setAuthLoading(true);
        const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;
        setAuthUser(response.data.user);
        setSettings(getUserSettings(response.data.user));

        if (response.data.user.role === 'admin') {
          await loadAdminUsers(token);
        } else {
          setAdminUsers([]);
        }
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [token, loadAdminUsers, clearSession]);

  useEffect(() => {
    if (!authUser?.logoUrl) {
      logoImageRef.current = null;
      setLogoVersion((value) => value + 1);
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      logoImageRef.current = image;
      setLogoVersion((value) => value + 1);
    };
    image.onerror = () => {
      logoImageRef.current = null;
      setLogoVersion((value) => value + 1);
    };
    image.src = authUser.logoUrl;
  }, [authUser?.logoUrl]);

  useEffect(() => {
    if (!uploadedVideo) return;
    const defaults = uploadedVideo.orientation === 'landscape' ? LANDSCAPE_DEFAULTS : PORTRAIT_DEFAULTS;
    setSettings((prev) => ({ ...prev, colors: { ...defaults } }));
  }, [uploadedVideo?.orientation]);

  const drawLogo = (
    ctx: CanvasRenderingContext2D,
    logoX: number,
    logoY: number,
    logoSize: number,
    logoBg: string
  ) => {
    const image = logoImageRef.current;
    const centerX = logoX + logoSize / 2;
    const centerY = logoY + logoSize / 2;
    const radius = logoSize / 2;

    if (image) {
      const aspectRatio = image.width / image.height;
      let drawWidth = logoSize;
      let drawHeight = logoSize;
      let drawX = logoX;
      let drawY = logoY;

      if (aspectRatio > 1) {
        drawWidth = logoSize * aspectRatio;
        drawX = logoX - (drawWidth - logoSize) / 2;
      } else {
        drawHeight = logoSize / aspectRatio;
        drawY = logoY - (drawHeight - logoSize) / 2;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      ctx.restore();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(3, logoSize * 0.04);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = logoBg;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${logoSize * 0.3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEWS', centerX, centerY);
  };

  const drawOverlayPreview = useCallback(
    (timestamp = 0) => {
      if (!canvasRef.current || !uploadedVideo) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const layout = getPreviewLayout(uploadedVideo);
      const { colors, reporterName, crawlerText, textColors } = settings;
      canvasRef.current.width = layout.width;
      canvasRef.current.height = layout.height;
      ctx.clearRect(0, 0, layout.width, layout.height);

      ctx.fillStyle = colors.designationBar;
      ctx.fillRect(layout.upperBarX, layout.upperBarY, layout.upperBarWidth, layout.upperBarHeight);
      ctx.fillStyle = resolveTextColor(textColors.designation);
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
      ctx.fillStyle = resolveTextColor(textColors.reporter);
      drawFittedText(
        ctx,
        reporterName || authUser?.displayName || 'अनिल मोर्या',
        layout.barTextStartX,
        layout.lowerBarY + layout.lowerBarHeight / 2,
        layout.reporterTextMaxWidth,
        layout.lowerBarHeight * 0.55
      );

      ctx.fillStyle = colors.crawlerBar;
      ctx.fillRect(0, layout.crawlerY, layout.width, layout.crawlerHeight);
      ctx.fillStyle = colors.crawlerLine;
      ctx.fillRect(0, layout.crawlerY, layout.lineWidth, layout.crawlerHeight);
      drawLogo(ctx, layout.logoX, layout.logoY, layout.logoSize, colors.logoBg);

      const tickerText = crawlerText || 'आज की मुख्य हेडलाइंस यहां दिखेंगी...';
      const textPadding = layout.lineWidth + Math.round(20 * layout.scaleX);
      const scrollSpeed = layout.width / 8;
      ctx.fillStyle = resolveTextColor(textColors.crawler);
      ctx.font = `bold ${layout.crawlerHeight * 0.5}px "Nirmala UI", "Mangal", Arial`;
      ctx.textAlign = 'left';
      const textWidth = ctx.measureText(tickerText).width;
      const loopWidth = layout.width + textWidth + textPadding;
      const scrollOffset = ((timestamp / 1000) * scrollSpeed) % loopWidth;
      ctx.fillText(tickerText, layout.width - scrollOffset, layout.crawlerY + layout.crawlerHeight / 2);
    },
    [uploadedVideo, settings, authUser?.displayName]
  );

  useEffect(() => {
    if (!uploadedVideo || !canvasRef.current) return;
    let animationFrameId = 0;
    const render = (timestamp: number) => {
      drawOverlayPreview(timestamp);
      animationFrameId = requestAnimationFrame(render);
    };
    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [uploadedVideo, drawOverlayPreview, logoVersion]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, loginForm);
      localStorage.setItem(TOKEN_STORAGE_KEY, response.data.token);
      setToken(response.data.token);
      setAuthUser(response.data.user);
      setSettings(getUserSettings(response.data.user));
      setLoginForm({ username: '', password: '' });
      if (response.data.user.role === 'admin') {
        setActiveView('admin');
        await loadAdminUsers(response.data.token);
      }
      toast.success(`स्वागत है, ${response.data.user.displayName}`);
    } catch (err) {
      setAuthError(getErrorMessage(err, 'लॉगिन नहीं हो सका'));
    }
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, { headers: authHeaders });
      }
    } catch {}
    clearSession();
    toast.success('लॉगआउट हो गया');
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newUserLogo) {
      toast.error('नए यूज़र के लिए लोगो चुनना जरूरी है');
      return;
    }

    try {
      setIsCreatingUser(true);
      const formData = new FormData();
      formData.append('username', newUserForm.username);
      formData.append('displayName', newUserForm.displayName);
      formData.append('password', newUserForm.password);
      formData.append('logo', newUserLogo);
      if (newUserIntroVideo) {
        formData.append('introVideo', newUserIntroVideo);
      }
      if (newUserOutroVideo) {
        formData.append('outroVideo', newUserOutroVideo);
      }

      await axios.post(`${API_BASE_URL}/api/admin/users`, formData, {
        headers: { ...authHeaders, 'Content-Type': 'multipart/form-data' },
      });

      setNewUserForm({ username: '', displayName: '', password: '' });
      setNewUserLogo(null);
      setNewUserIntroVideo(null);
      setNewUserOutroVideo(null);
      if (createUserLogoInputRef.current) createUserLogoInputRef.current.value = '';
      if (createUserIntroInputRef.current) createUserIntroInputRef.current.value = '';
      if (createUserOutroInputRef.current) createUserOutroInputRef.current.value = '';
      await loadAdminUsers();
      toast.success('नया यूज़र सफलतापूर्वक बन गया');
    } catch (err) {
      toast.error(getErrorMessage(err, 'यूज़र नहीं बन सका'));
    } finally {
      setIsCreatingUser(false);
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setError('');
      setOutputVideo('');
      const formData = new FormData();
      formData.append('video', file);

      try {
        toast.loading('वीडियो अपलोड हो रहा है...', { id: 'video-upload' });
        const response = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
          headers: { ...authHeaders, 'Content-Type': 'multipart/form-data' },
        });
        setUploadedVideo(response.data);
        setVideoUrl(`${API_BASE_URL}/uploads/${response.data.fileName}`);
        toast.success('वीडियो सफलतापूर्वक अपलोड हो गया', { id: 'video-upload' });
      } catch (err) {
        const message = getErrorMessage(err, 'वीडियो अपलोड नहीं हो सका');
        setError(message);
        toast.error(message, { id: 'video-upload' });
      }
    },
    [authHeaders]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv'] },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024,
  });

  const handleProcessVideo = async () => {
    if (!uploadedVideo) return;
    setIsProcessing(true);
    setProcessingProgress(0);
    setError('');

    try {
      toast.loading('वीडियो प्रोसेस हो रहा है...', { id: 'video-process' });
      const progressInterval = setInterval(() => setProcessingProgress((value) => Math.min(value + 5, 90)), 1500);
      const response = await axios.post(
        `${API_BASE_URL}/api/process`,
        { fileName: uploadedVideo.fileName, settings },
        { headers: authHeaders }
      );
      clearInterval(progressInterval);
      setProcessingProgress(100);
      setOutputVideo(response.data.outputFile);
      toast.success('फाइनल वीडियो तैयार हो गया', { id: 'video-process' });
    } catch (err) {
      const message = getErrorMessage(err, 'वीडियो प्रोसेस नहीं हो सका');
      setError(message);
      toast.error(message, { id: 'video-process' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!outputVideo) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/api/download/${outputVideo}`, {
        headers: authHeaders,
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = outputVideo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      toast.error(getErrorMessage(err, 'वीडियो डाउनलोड नहीं हो सका'));
    }
  };

  const handleReset = () => {
    setUploadedVideo(null);
    setVideoUrl('');
    setOutputVideo('');
    setError('');
    setSettings(getUserSettings(authUser));
  };

  const updateColor = (key: keyof ColorSettings, value: string) => {
    setSettings((prev) => ({ ...prev, colors: { ...prev.colors, [key]: value } }));
  };

  const updateTextColor = (key: keyof TextColorSettings, value: OverlayTextColor) => {
    setSettings((prev) => ({ ...prev, textColors: { ...prev.textColors, [key]: value } }));
  };

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">NewsOverlay Pro लोड हो रहा है...</div>;
  }

  if (!authUser) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <LoginScreen
          authError={authError}
          loginForm={loginForm}
          onChange={(field, value) => setLoginForm((prev) => ({ ...prev, [field]: value }))}
          onSubmit={handleLogin}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" richColors />
      <header className="bg-slate-950 px-6 py-4 text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Film className="h-8 w-8 text-red-500" />
            <div>
              <h1 className="text-2xl font-bold">NewsOverlay Pro</h1>
              <p className="text-sm text-slate-400">हिंदी वीडियो ओवरले और ब्रांडिंग वर्कस्पेस</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="border-white/10 bg-white/10 text-white">
              {authUser.displayName}
            </Badge>
            <Badge
              variant={authUser.role === 'admin' ? 'default' : 'outline'}
              className={authUser.role === 'admin' ? '' : 'border-white/20 text-white'}
            >
              {authUser.role === 'admin' ? 'एडमिन' : 'यूज़र'}
            </Badge>
            <div className="flex gap-2">
              <Button
                variant={activeView === 'editor' ? 'secondary' : 'outline'}
                className={activeView === 'editor' ? '' : 'border-white/20 text-white hover:bg-white/10'}
                onClick={() => setActiveView('editor')}
              >
                <Settings className="mr-2 h-4 w-4" />
                एडिटर
              </Button>
              {authUser.role === 'admin' && (
                <Button
                  variant={activeView === 'admin' ? 'secondary' : 'outline'}
                  className={activeView === 'admin' ? '' : 'border-white/20 text-white hover:bg-white/10'}
                  onClick={() => setActiveView('admin')}
                >
                  <Users className="mr-2 h-4 w-4" />
                  एडमिन पैनल
                </Button>
              )}
            </div>
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              लॉगआउट
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-6">
        {activeView === 'admin' && authUser.role === 'admin' ? (
          <AdminPanel
            createUserLogoInputRef={createUserLogoInputRef}
            createUserIntroInputRef={createUserIntroInputRef}
            createUserOutroInputRef={createUserOutroInputRef}
            isCreatingUser={isCreatingUser}
            newUserForm={newUserForm}
            newUserIntroVideo={newUserIntroVideo}
            newUserLogo={newUserLogo}
            newUserOutroVideo={newUserOutroVideo}
            users={adminUsers}
            onFormChange={(field, value) => setNewUserForm((prev) => ({ ...prev, [field]: value }))}
            onIntroVideoChange={setNewUserIntroVideo}
            onLogoChange={setNewUserLogo}
            onOutroVideoChange={setNewUserOutroVideo}
            onSubmit={handleCreateUser}
          />
        ) : (
          <EditorPanel
            authUser={authUser}
            canvasRef={canvasRef}
            error={error}
            getInputProps={getInputProps}
            getRootProps={getRootProps}
            isDragActive={isDragActive}
            isProcessing={isProcessing}
            onCrawlerTextChange={(value) => setSettings((prev) => ({ ...prev, crawlerText: value }))}
            onDownload={handleDownload}
            onProcess={handleProcessVideo}
            onReporterNameChange={(value) => setSettings((prev) => ({ ...prev, reporterName: value }))}
            onReset={handleReset}
            onToggleIntro={(value) => setSettings((prev) => ({ ...prev, enableIntro: value }))}
            onToggleOutro={(value) => setSettings((prev) => ({ ...prev, enableOutro: value }))}
            outputVideo={outputVideo}
            processingProgress={processingProgress}
            settings={settings}
            updateColor={updateColor}
            updateTextColor={updateTextColor}
            uploadedVideo={uploadedVideo}
            videoUrl={videoUrl}
          />
        )}
      </main>

      <footer className="mt-12 bg-slate-950 px-6 py-4 text-slate-400">
        <div className="mx-auto max-w-7xl text-center text-sm">
          <p>NewsOverlay Pro - एडमिन नियंत्रित हिंदी वीडियो ओवरले, लोगो, इंट्रो और आउट्रो वर्कफ़्लो</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
