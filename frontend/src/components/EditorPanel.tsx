import type { RefObject } from 'react';
import { AlertCircle, Download, Play, RefreshCw, Settings, Upload, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import type {
  AuthUser,
  ColorSettings,
  OverlaySettings,
  OverlayTextColor,
  TextColorSettings,
  VideoInfo,
} from '@/lib/app-models';

interface EditorPanelProps {
  authUser: AuthUser;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  error: string;
  getInputProps: (...args: any[]) => any;
  getRootProps: (...args: any[]) => any;
  isDragActive: boolean;
  isProcessing: boolean;
  onCrawlerTextChange: (value: string) => void;
  onDownload: () => void;
  onProcess: () => void;
  onReporterNameChange: (value: string) => void;
  onReset: () => void;
  onToggleIntro: (value: boolean) => void;
  onToggleOutro: (value: boolean) => void;
  outputVideo: string;
  processingProgress: number;
  settings: OverlaySettings;
  updateColor: (key: keyof ColorSettings, value: string) => void;
  updateTextColor: (key: keyof TextColorSettings, value: OverlayTextColor) => void;
  uploadedVideo: VideoInfo | null;
  videoUrl: string;
}

export function EditorPanel({
  authUser,
  canvasRef,
  error,
  getInputProps,
  getRootProps,
  isDragActive,
  isProcessing,
  onCrawlerTextChange,
  onDownload,
  onProcess,
  onReporterNameChange,
  onReset,
  onToggleIntro,
  onToggleOutro,
  outputVideo,
  processingProgress,
  settings,
  updateColor,
  updateTextColor,
  uploadedVideo,
  videoUrl,
}: EditorPanelProps) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[0.65fr_1.35fr]">
        <Card>
          <CardHeader>
            <CardTitle>लॉगिन की गई पहचान</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              {authUser.logoUrl ? (
                <img src={authUser.logoUrl} alt={`${authUser.displayName} logo`} className="w-16 h-16 rounded-full border object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center font-bold">NEWS</div>
              )}
              <div>
                <p className="font-semibold text-lg">{authUser.displayName}</p>
                <p className="text-sm text-slate-500">@{authUser.username}</p>
              </div>
            </div>

            <Alert>
              <AlertDescription>
                {authUser.logoUrl
                  ? 'असाइन किया गया लोगो प्रीव्यू और फाइनल वीडियो दोनों में अपने आप इस्तेमाल होगा।'
                  : 'इस यूज़र के पास कस्टम लोगो नहीं है, इसलिए डिफॉल्ट NEWS बैज दिखाई देगा।'}
              </AlertDescription>
            </Alert>

            <div className="grid gap-3 md:grid-cols-2">
              <StatusChip label="इंट्रो वीडियो" value={authUser.introVideoUrl ? 'असाइन है' : 'असाइन नहीं'} />
              <StatusChip label="आउट्रो वीडियो" value={authUser.outroVideoUrl ? 'असाइन है' : 'असाइन नहीं'} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>वर्कफ़्लो</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <InfoCard title="1. वीडियो अपलोड" body="लॉगिन के बाद अपना मुख्य वीडियो अपलोड करें।" />
            <InfoCard title="2. टेक्स्ट और रंग" body="रिपोर्टर नाम, मुख्य हेडलाइंस और टेक्स्ट के रंग सेट करें।" />
            <InfoCard title="3. ऑटो मर्ज" body="असाइन किया गया इंट्रो पहले, मुख्य वीडियो बीच में और आउट्रो आखिर में जुड़ जाएगा।" />
          </CardContent>
        </Card>
      </div>

      {!uploadedVideo ? (
        <div className="max-w-3xl mx-auto mt-4">
          <Card className="border-2 border-dashed border-slate-300">
            <CardContent className="p-12">
              <div
                {...getRootProps()}
                className={`cursor-pointer text-center transition-colors ${isDragActive ? 'bg-blue-50' : ''}`}
              >
                <input {...getInputProps()} />
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Upload className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{isDragActive ? 'वीडियो यहां छोड़ें' : 'अपना वीडियो अपलोड करें'}</h3>
                <p className="text-slate-500 mb-4">वीडियो फ़ाइल को यहां ड्रैग करें या क्लिक करके चुनें।</p>
                <p className="text-sm text-slate-400">MP4, MOV, AVI, MKV और अधिकतम 500MB</p>
                <Button className="mt-6" size="lg">
                  <Video className="w-5 h-5 mr-2" />
                  वीडियो चुनें
                </Button>
              </div>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="w-5 h-5" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <Card className="overflow-hidden">
              <CardHeader className="bg-slate-100 py-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Play className="w-5 h-5" />
                  प्रीव्यू
                  <span
                    className={`ml-auto rounded px-2 py-1 text-xs ${
                      uploadedVideo.orientation === 'landscape' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {uploadedVideo.orientation === 'landscape' ? 'लैंडस्केप' : 'पोर्ट्रेट'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="relative p-0">
                <div className="relative bg-black">
                  <video src={videoUrl} controls className="h-auto max-h-[70vh] w-full" style={{ display: 'block' }} />
                  <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0 h-full w-full" style={{ width: '100%', height: '100%' }} />
                </div>
              </CardContent>
            </Card>

            <div className="mt-4 grid grid-cols-3 gap-4">
              <StatCard label="रिज़ॉल्यूशन" value={`${uploadedVideo.dimensions.width} x ${uploadedVideo.dimensions.height}`} />
              <StatCard label="ओरिएंटेशन" value={uploadedVideo.orientation === 'landscape' ? 'लैंडस्केप' : 'पोर्ट्रेट'} />
              <StatCard label="अवधि" value={`${Math.round(uploadedVideo.duration)} सेकंड`} />
            </div>
          </div>

          <div>
            <Card>
              <CardHeader className="bg-slate-100 py-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="w-5 h-5" />
                  ओवरले सेटिंग्स
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="reporterName">रिपोर्टर नाम</Label>
                    <Input
                      id="reporterName"
                      value={settings.reporterName}
                      onChange={(event) => onReporterNameChange(event.target.value)}
                      placeholder="रिपोर्टर का नाम लिखें"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="crawlerText">मुख्य हेडलाइंस</Label>
                    <Textarea
                      id="crawlerText"
                      value={settings.crawlerText}
                      onChange={(event) => onCrawlerTextChange(event.target.value)}
                      placeholder="यहां हिंदी हेडलाइंस लिखें"
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">इंट्रो और आउट्रो</h4>
                  <ToggleRow
                    checked={settings.enableIntro}
                    disabled={!authUser.introVideoUrl}
                    label="इंट्रो वीडियो जोड़ें"
                    hint={authUser.introVideoUrl ? 'असाइन किए गए इंट्रो को फाइनल वीडियो की शुरुआत में जोड़ें।' : 'इस यूज़र के लिए कोई इंट्रो वीडियो असाइन नहीं है।'}
                    onChange={onToggleIntro}
                  />
                  <ToggleRow
                    checked={settings.enableOutro}
                    disabled={!authUser.outroVideoUrl}
                    label="आउट्रो वीडियो जोड़ें"
                    hint={authUser.outroVideoUrl ? 'असाइन किए गए आउट्रो को फाइनल वीडियो के अंत में जोड़ें।' : 'इस यूज़र के लिए कोई आउट्रो वीडियो असाइन नहीं है।'}
                    onChange={onToggleOutro}
                  />
                </div>

                <Separator />

                <div>
                  <h4 className="mb-4 font-medium">बार के रंग</h4>
                  {authUser.logoUrl && (
                    <p className="mb-4 text-xs text-slate-500">
                      लोगो असाइन है, इसलिए लोगो बैकग्राउंड रंग सिर्फ fallback केस में लगेगा।
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-4">
                    <ColorPicker label="लोगो बैकग्राउंड" value={settings.colors.logoBg} onChange={(value) => updateColor('logoBg', value)} />
                    <ColorPicker label="ऊपरी पट्टी" value={settings.colors.designationBar} onChange={(value) => updateColor('designationBar', value)} />
                    <ColorPicker label="निचली पट्टी" value={settings.colors.reporterBar} onChange={(value) => updateColor('reporterBar', value)} />
                    <ColorPicker label="हेडलाइंस पट्टी" value={settings.colors.crawlerBar} onChange={(value) => updateColor('crawlerBar', value)} />
                    <ColorPicker label="हेडलाइंस लाइन" value={settings.colors.crawlerLine} onChange={(value) => updateColor('crawlerLine', value)} />
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-4 font-medium">टेक्स्ट रंग</h4>
                  <div className="space-y-4">
                    <TextColorToggle
                      label="डिज़िग्नेशन टेक्स्ट"
                      value={settings.textColors.designation}
                      onChange={(value) => updateTextColor('designation', value)}
                    />
                    <TextColorToggle
                      label="रिपोर्टर नाम टेक्स्ट"
                      value={settings.textColors.reporter}
                      onChange={(value) => updateTextColor('reporter', value)}
                    />
                    <TextColorToggle
                      label="हेडलाइंस टेक्स्ट"
                      value={settings.textColors.crawler}
                      onChange={(value) => updateTextColor('crawler', value)}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  {isProcessing ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>वीडियो प्रोसेस हो रहा है...</span>
                        <span>{processingProgress}%</span>
                      </div>
                      <Progress value={processingProgress} className="h-2" />
                      <p className="text-xs text-slate-500">
                        फाइनल वीडियो में इसी यूज़र का असाइन लोगो और चुना गया इंट्रो/आउट्रो इस्तेमाल होगा।
                      </p>
                    </div>
                  ) : outputVideo ? (
                    <div className="space-y-3">
                      <Alert className="border-green-200 bg-green-50">
                        <AlertDescription className="text-green-700">वीडियो सफलतापूर्वक तैयार हो गया।</AlertDescription>
                      </Alert>
                      <Button onClick={onDownload} className="w-full" size="lg">
                        <Download className="mr-2 h-5 w-5" />
                        फाइनल वीडियो डाउनलोड करें
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={onProcess} className="w-full" size="lg" disabled={isProcessing}>
                      <Play className="mr-2 h-5 w-5" />
                      फाइनल वीडियो बनाएं
                    </Button>
                  )}

                  <Button variant="outline" onClick={onReset} className="w-full">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    नया वीडियो शुरू करें
                  </Button>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="w-5 h-5" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-slate-500">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-10 cursor-pointer rounded border-2 border-slate-200"
        />
      </div>
    </div>
  );
}

function TextColorToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: OverlayTextColor;
  onChange: (value: OverlayTextColor) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={value === 'white' ? 'default' : 'outline'}
          className="min-w-20"
          onClick={() => onChange('white')}
        >
          सफेद
        </Button>
        <Button
          type="button"
          variant={value === 'black' ? 'default' : 'outline'}
          className="min-w-20"
          onClick={() => onChange('black')}
        >
          काला
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  disabled,
  hint,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  hint: string;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${disabled ? 'bg-slate-50 text-slate-400' : 'bg-slate-50'}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">{label}</p>
          <p className="mt-1 text-sm">{hint}</p>
        </div>
        <label className={`inline-flex items-center gap-2 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm">{checked ? 'चालू' : 'बंद'}</span>
        </label>
      </div>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}
